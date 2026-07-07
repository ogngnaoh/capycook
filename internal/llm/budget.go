package llm

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Budget: a UsageMeter turns per-call token usage into cumulative USD spend
// and enforces the LLM_BUDGET_USD hard cap (spec §7 failure policy; global
// constraint "hard-stop + report at cap").
//
// Persistence decision (task 3.3): spend lives in a tiny sidecar JSON file
// next to the SQLite database (cmd/server uses DB_PATH + ".budget.json"),
// NOT in a store table. The ledger is operational state, not domain data —
// keeping it out of the store spares the pinned Store interface and the
// migration chain, and a fork can reset it by deleting one file. Writes are
// atomic (temp file + rename) under the meter's mutex.
//
// Pricing pinned from live api-docs.deepseek.com (task 3.1, fetched
// 2026-07-07): input $0.435/M tokens (cache miss), $0.003625/M (cache hit),
// output $0.87/M.
const (
	inputMissUSDPerMTok = 0.435
	inputHitUSDPerMTok  = 0.003625
	outputUSDPerMTok    = 0.87
)

// ErrBudgetExhausted is the typed pre-call hard-stop: cumulative spend has
// reached the configured cap, so the call is refused before any network
// traffic. The orchestrator maps it — like every generation error — to
// move_failed (never proposal_blocked).
var ErrBudgetExhausted = errors.New("llm: budget exhausted")

// costUSD prices one call from its usage fields. cached is the cache-hit
// share of prompt tokens (DeepSeek's prompt_tokens_details /
// prompt_cache_hit_tokens); it can never meaningfully exceed prompt and is
// clamped defensively.
func costUSD(prompt, cached, completion int) float64 {
	if cached > prompt {
		cached = prompt
	}
	miss := prompt - cached
	return float64(miss)*inputMissUSDPerMTok/1e6 +
		float64(cached)*inputHitUSDPerMTok/1e6 +
		float64(completion)*outputUSDPerMTok/1e6
}

// budgetFile is the sidecar ledger's on-disk shape.
type budgetFile struct {
	Comment  string  `json:"comment,omitempty"`
	SpentUSD float64 `json:"spent_usd"`
}

const budgetFileComment = "CapyCook cumulative LLM spend (USD) — sidecar ledger for the LLM_BUDGET_USD hard cap. Deleting this file resets the accounting."

// UsageMeter is the persisted spend counter behind the budget hard-stop.
type UsageMeter struct {
	mu       sync.Mutex
	path     string
	capUSD   float64
	spentUSD float64
}

// OpenUsageMeter loads (or initializes) the ledger at path with the given
// cap. A missing file starts at zero; a corrupt file is an error — spend is
// never silently reset.
func OpenUsageMeter(path string, capUSD float64) (*UsageMeter, error) {
	m := &UsageMeter{path: path, capUSD: capUSD}
	raw, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return m, nil
	case err != nil:
		return nil, fmt.Errorf("llm: read budget ledger: %w", err)
	}
	var f budgetFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, fmt.Errorf("llm: corrupt budget ledger %s (delete it to reset spend): %w", path, err)
	}
	m.spentUSD = f.SpentUSD
	return m, nil
}

// Spent returns cumulative spend in USD (for /api/status and reports).
func (m *UsageMeter) Spent() float64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.spentUSD
}

// Cap returns the configured hard cap in USD.
func (m *UsageMeter) Cap() float64 { return m.capUSD }

// PreCheck is the pre-call hard-stop: it fails with ErrBudgetExhausted once
// spend has reached the cap, before any network call. A call's exact cost
// is unknowable in advance, so the final in-budget call may overshoot the
// cap slightly; every call after it is refused.
func (m *UsageMeter) PreCheck() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.spentUSD >= m.capUSD {
		return fmt.Errorf("%w: spent $%.4f of $%.2f cap (LLM_BUDGET_USD)", ErrBudgetExhausted, m.spentUSD, m.capUSD)
	}
	return nil
}

// Record prices one call's usage, adds it to the cumulative spend, and
// persists the ledger. The in-memory total is updated even if persistence
// fails, so the cap still holds for this process.
func (m *UsageMeter) Record(prompt, cached, completion int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.spentUSD += costUSD(prompt, cached, completion)
	return m.persistLocked()
}

// persistLocked writes the ledger atomically. Caller holds mu.
func (m *UsageMeter) persistLocked() error {
	raw, err := json.MarshalIndent(budgetFile{Comment: budgetFileComment, SpentUSD: m.spentUSD}, "", "  ")
	if err != nil {
		return fmt.Errorf("llm: marshal budget ledger: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(m.path), 0o755); err != nil {
		return fmt.Errorf("llm: budget ledger dir: %w", err)
	}
	tmp := m.path + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0o644); err != nil {
		return fmt.Errorf("llm: write budget ledger: %w", err)
	}
	if err := os.Rename(tmp, m.path); err != nil {
		return fmt.Errorf("llm: replace budget ledger: %w", err)
	}
	return nil
}

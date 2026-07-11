package llm

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/ogngnaoh/capycook/internal/proposal"
)

// countingLLM records how many times GenerateMove was invoked, so a test can
// prove the budget pre-check refuses BEFORE delegating.
type countingLLM struct{ calls int }

func (c *countingLLM) GenerateMove(context.Context, MoveRequest) (proposal.Proposal, error) {
	c.calls++
	return proposal.Proposal{MoveType: MoveTypeSeedExpand, Confidence: 0.6}, nil
}

// TestMeteredDelegatesUnderCap: below the cap, Metered forwards to the inner
// LLM and returns its proposal. The stub-style edge reports no usage, so
// spend never accrues.
func TestMeteredDelegatesUnderCap(t *testing.T) {
	m, err := OpenUsageMeter(filepath.Join(t.TempDir(), "budget.json"), 10)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	inner := &countingLLM{}
	p, err := Metered{Inner: inner, Meter: m}.GenerateMove(context.Background(),
		MoveRequest{MoveType: MoveTypeSeedExpand})
	if err != nil {
		t.Fatalf("GenerateMove under cap: %v", err)
	}
	if inner.calls != 1 {
		t.Errorf("inner called %d times, want 1", inner.calls)
	}
	if p.MoveType != MoveTypeSeedExpand {
		t.Errorf("delegated proposal not returned: %+v", p)
	}
	if got := m.Spent(); got != 0 {
		t.Errorf("Spent() = %v, want 0 (stub usage is zero)", got)
	}
}

// TestMeteredRefusesAtZeroCap: with LLM_BUDGET_USD=0 the very first call is
// refused pre-delegation (spent 0 >= cap 0) — the BC-H-4 budget profile the
// orchestrator maps to move_failed, never a safety hold.
func TestMeteredRefusesAtZeroCap(t *testing.T) {
	m, err := OpenUsageMeter(filepath.Join(t.TempDir(), "budget.json"), 0)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	inner := &countingLLM{}
	_, err = Metered{Inner: inner, Meter: m}.GenerateMove(context.Background(),
		MoveRequest{MoveType: MoveTypeSeedExpand})
	if !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("GenerateMove at zero cap = %v, want ErrBudgetExhausted", err)
	}
	if inner.calls != 0 {
		t.Errorf("inner called %d times at zero cap, want 0 (refused pre-call)", inner.calls)
	}
}

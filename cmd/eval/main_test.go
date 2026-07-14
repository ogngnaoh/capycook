package main

// Tests for the plan-4.4 eval CLI. Every test drives the exported Run
// entrypoint directly — never an exec of a built binary (plan 4.4:
// "httptest-free CLI tests via package funcs"). All labeled fixtures come
// from internal/eval/testdata, the only place synthetic label values may
// live (phase-4 rail); temp files created here carry NO label values at all.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/eval"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/telemetry"
)

// Fixture paths relative to this package (cmd/eval).
const (
	testSeedsPath   = "../../internal/eval/testdata/seeds_synthetic.json"
	testLabelsPath  = "../../internal/eval/testdata/claims_labeled.jsonl"
	testKappaPath   = "../../internal/eval/testdata/claims_double_labeled.jsonl"
	testEventsPath  = "../../internal/eval/testdata/events_gate_dynamics.json"
	testScriptPath  = "../../eval/fixtures/move_script.json"
	testDataDirPath = "../../data"
)

// runCLI drives the exported CLI entrypoint with captured output.
func runCLI(t *testing.T, args ...string) (code int, stdout, stderr string) {
	t.Helper()
	var out, errBuf bytes.Buffer
	code = Run(args, &out, &errBuf)
	return code, out.String(), errBuf.String()
}

func mustContain(t *testing.T, name, s string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(s, w) {
			t.Errorf("%s missing %q:\n%s", name, w, s)
		}
	}
}

// seedEventDB builds a temp SQLite event log holding the synthetic H2
// fixture (hand-computed expectations live in internal/eval/replay_test.go).
func seedEventDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "events.db")
	st, err := store.Open(path)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()
	raw, err := os.ReadFile(testEventsPath)
	if err != nil {
		t.Fatalf("read events fixture: %v", err)
	}
	var events []eventlog.Event
	if err := json.Unmarshal(raw, &events); err != nil {
		t.Fatalf("unmarshal events fixture: %v", err)
	}
	log := eventlog.New(st)
	for _, e := range events {
		if err := log.Append(context.Background(), e); err != nil {
			t.Fatalf("append fixture event: %v", err)
		}
	}
	return path
}

// --- dispatch ---

func TestUsageAndDispatch(t *testing.T) {
	if code, _, stderr := runCLI(t); code != 2 || !strings.Contains(stderr, "usage: eval") {
		t.Errorf("no args: code=%d stderr=%q, want 2 + usage", code, stderr)
	}
	if code, _, stderr := runCLI(t, "brunch"); code != 2 || !strings.Contains(stderr, "brunch") {
		t.Errorf("unknown subcommand: code=%d stderr=%q, want 2 naming it", code, stderr)
	}
	code, stdout, _ := runCLI(t, "help")
	if code != 0 {
		t.Fatalf("help: code=%d, want 0", code)
	}
	mustContain(t, "help", stdout, "run", "replay", "rates", "kappa", "report", "export-labels", "import-labels")
}

// --- seeds resolution ---

// The default seeds path points at the UNRATIFIED draft (with a printed
// warning) until eval/fixtures/seeds.json exists post-Gate-C ratification.
func TestResolveSeeds(t *testing.T) {
	dir := t.TempDir()
	ratified := filepath.Join(dir, "seeds.json")
	proposed := filepath.Join(dir, "proposed-benchmark-seeds.json")

	if path, warn := resolveSeeds("explicit.json", ratified, proposed); path != "explicit.json" || warn != "" {
		t.Errorf("explicit: got (%q, %q), want (explicit.json, no warning)", path, warn)
	}
	path, warn := resolveSeeds("", ratified, proposed)
	if path != proposed {
		t.Errorf("no ratified file: path=%q, want the proposed draft %q", path, proposed)
	}
	mustContain(t, "unratified warning", warn, "UNRATIFIED", "Gate C")
	if path, warn := resolveSeeds(proposed, ratified, proposed); path != proposed || !strings.Contains(warn, "UNRATIFIED") {
		t.Errorf("explicit proposed path must still warn: got (%q, %q)", path, warn)
	}
	if err := os.WriteFile(ratified, []byte("[]"), 0o644); err != nil {
		t.Fatal(err)
	}
	if path, warn := resolveSeeds("", ratified, proposed); path != ratified || warn != "" {
		t.Errorf("ratified exists: got (%q, %q), want (%q, no warning)", path, warn, ratified)
	}
}

// --- rates ---

func TestRatesCommand(t *testing.T) {
	code, stdout, stderr := runCLI(t, "rates", "--labels", testLabelsPath)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	// Hand-computed rows (internal/eval/rates_test.go): explicit Ns, never a bare %.
	mustContain(t, "rates output", stdout,
		"| grounded | 8 | 1 | 6 | 1 | 0.667 | 0.167 | 0.167 |",
		"| ungrounded | 5 | 0 | 4 | 1 | 0.250 | 0.000 | 0.750 |",
		"neither for nor against",
	)

	if code, _, stderr := runCLI(t, "rates"); code != 1 || !strings.Contains(stderr, "--labels") {
		t.Errorf("missing --labels: code=%d stderr=%q, want 1 naming the flag", code, stderr)
	}
	if code, _, _ := runCLI(t, "rates", "--labels", filepath.Join(t.TempDir(), "missing.jsonl")); code != 1 {
		t.Errorf("missing file: code=%d, want 1", code)
	}
}

// --- kappa ---

func TestKappaCommand(t *testing.T) {
	code, stdout, stderr := runCLI(t, "kappa", "--labels", testKappaPath)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	// Hand-computed on the 20-claim fixture (internal/eval/kappa_test.go):
	// p_o = 0.8, p_e = 0.235, κ = 113/153 ≈ 0.739.
	mustContain(t, "kappa output", stdout,
		"N=20 double-labeled claims",
		"p_o=0.800", "p_e=0.235", "κ=0.739",
		"| grounded-correct | 6 | 1 | 0 | 0 | 0 |",
	)

	// A file with no double-labeled rows: κ is not measurable — hard error,
	// never reported as κ=0. The temp file carries no label values at all.
	unlabeled := filepath.Join(t.TempDir(), "unlabeled.jsonl")
	line := `{"claim_id":"clm-synth-cli1","arm":"grounded","dish":"dish-synthetic-1","text":"SYNTHETIC claim","source":""}`
	if err := os.WriteFile(unlabeled, []byte(line+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if code, _, stderr := runCLI(t, "kappa", "--labels", unlabeled); code != 1 || !strings.Contains(stderr, "double-labeled") {
		t.Errorf("empty subset: code=%d stderr=%q, want 1 naming the empty double-labeled subset", code, stderr)
	}
}

// --- replay ---

func TestWriteGateDynamicsSessionGrammar(t *testing.T) {
	for _, tc := range []struct {
		name     string
		sessions int
		want     string
	}{
		{name: "zero", sessions: 0, want: "across 0 sessions"},
		{name: "singular", sessions: 1, want: "across 1 session,"},
		{name: "plural", sessions: 2, want: "across 2 sessions"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			writeGateDynamics(&out, eval.GateDynamics{
				Total:    &eval.Dynamics{Counts: map[string]int{}},
				Sessions: tc.sessions,
			})
			if !strings.Contains(out.String(), tc.want) {
				t.Errorf("output missing %q:\n%s", tc.want, out.String())
			}
		})
	}
}

func TestReplayCommand(t *testing.T) {
	db := seedEventDB(t)
	code, stdout, stderr := runCLI(t, "replay", "--db", db)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	// Hand-computed fold (internal/eval/replay_test.go): N=11 across 2
	// sessions, move_failed=1 outside N; harness events fully excluded.
	mustContain(t, "replay output", stdout,
		"N=11 gate decisions across 2 sessions, single operator",
		"one human",
		"| technique_step | 3 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 |",
		"| creative (roll-up) | 9 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 |",
		"| TOTAL | 11 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 | 1 |",
		"cancel folds into reject",
		"| TOTAL (frozen five) | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 |",
	)

	// Dish filter: dish-synthetic-2 holds only the move_failed event — zero
	// gate decisions, zero sessions, the failure surfaced beside N.
	code, stdout, stderr = runCLI(t, "replay", "--db", db, "--dish", "dish-synthetic-2")
	if code != 0 {
		t.Fatalf("dish filter: code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "dish-filtered replay", stdout,
		"N=0 gate decisions across 0 sessions",
		"move_failed=1",
	)

	if code, _, stderr := runCLI(t, "replay", "--db", filepath.Join(t.TempDir(), "missing.db")); code != 1 || !strings.Contains(stderr, "no event-log database") {
		t.Errorf("missing db: code=%d stderr=%q, want 1 + explicit no-database error", code, stderr)
	}
}

// --- run (stub LLM only in phase 4) ---

func TestRunCommandStubAllArms(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "out")
	code, stdout, stderr := runCLI(t, "run",
		"--arm", "all",
		"--seeds", testSeedsPath,
		"--script", testScriptPath,
		"--data", testDataDirPath,
		"--db", filepath.Join(t.TempDir(), "harness.db"),
		"--out", outDir,
	)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	if strings.Contains(stderr, "UNRATIFIED") {
		t.Errorf("explicit --seeds must not print the unratified-default warning, stderr=%q", stderr)
	}
	mustContain(t, "run summary", stdout, "stub",
		"label_r1/label_r2 are EMPTY — author R1 and judge R2 label Tier-2 claims (PREREG §9 Amendment 1)")
	// 2 synthetic seeds × 4 claims each (arithmetic in internal/eval/runner_test.go).
	for _, arm := range eval.Arms {
		path := filepath.Join(outDir, "claims_"+arm+".jsonl")
		mustContain(t, "run summary", stdout, path)
		f, err := os.Open(path)
		if err != nil {
			t.Fatalf("arm %s: claims file: %v", arm, err)
		}
		claims, err := eval.ReadClaims(f)
		f.Close()
		if err != nil {
			t.Fatalf("arm %s: ReadClaims: %v", arm, err)
		}
		if len(claims) != 8 {
			t.Errorf("arm %s: %d claims, want 8", arm, len(claims))
		}
		// The S3-exit coverage flag (PREREG §9 Amendment 1): the operator must
		// see per-arm how many claims the Tier-1 verifier settled machine-side
		// vs. how many fell through to Tier 2.
		tc := eval.Tier1Coverage(claims)
		wantTier1 := fmt.Sprintf("tier-1: %-11s %d/%d labeled (fell through to Tier 2: %d)",
			arm, tc.Labeled, tc.Labeled+tc.FellThrough, tc.FellThrough)
		mustContain(t, "run summary", stdout, wantTier1)
		for _, c := range claims {
			// The Amendment-1 stop-line: label_r1/label_r2 come only from the
			// author (R1) and the judge (R2) — never from this code. label_tier1
			// is machine-written by the Tier-1 verifier and may be non-empty.
			if c.LabelR1 != "" || c.LabelR2 != "" {
				t.Errorf("claim %s carries labels (%q/%q) — label_r1/label_r2 only ever come from author R1 / judge R2 (PREREG §9 Amendment 1)", c.ClaimID, c.LabelR1, c.LabelR2)
			}
		}
	}
}

// The live campaign must be traceable OTel→Langfuse (milestone-02 spec Part 2
// "runs traced"); buildDeps wires the tracer from LANGFUSE_* env exactly like
// cmd/server — but only for --live runs: stub dry-runs must never export
// spans into the real Langfuse project (harness/operator separation, same as
// the event log's run_kind). The operator always sees which mode is active.
func TestBuildDepsTelemetry(t *testing.T) {
	build := func(t *testing.T, traced bool) (telemetry.Tracer, string) {
		t.Helper()
		var out bytes.Buffer
		deps, cleanup, err := buildDeps(filepath.Join(t.TempDir(), "t.db"), testDataDirPath, llm.Stub{}, traced, &out)
		if err != nil {
			t.Fatalf("buildDeps: %v", err)
		}
		t.Cleanup(cleanup)
		return deps.Tracer, out.String()
	}
	t.Run("live, no keys: noop tracer, explicit notice", func(t *testing.T) {
		t.Setenv("LANGFUSE_PUBLIC_KEY", "")
		t.Setenv("LANGFUSE_SECRET_KEY", "")
		t.Setenv("LANGFUSE_HOST", "")
		tracer, out := build(t, true)
		if _, ok := tracer.(telemetry.Noop); !ok {
			t.Errorf("Tracer = %T, want telemetry.Noop without LANGFUSE_* keys", tracer)
		}
		mustContain(t, "buildDeps stdout", out, "telemetry: no-op")
	})
	t.Run("live, keys set: real tracer, enabled banner", func(t *testing.T) {
		t.Setenv("LANGFUSE_PUBLIC_KEY", "pk")
		t.Setenv("LANGFUSE_SECRET_KEY", "sk")
		t.Setenv("LANGFUSE_HOST", "https://lf.example")
		tracer, out := build(t, true)
		if _, ok := tracer.(telemetry.Noop); ok {
			t.Error("Tracer is the no-op — LANGFUSE_* keys must wire the real exporter (spec: runs traced OTel→Langfuse)")
		}
		mustContain(t, "buildDeps stdout", out, "Langfuse enabled")
	})
	t.Run("stub, keys set: never exports", func(t *testing.T) {
		t.Setenv("LANGFUSE_PUBLIC_KEY", "pk")
		t.Setenv("LANGFUSE_SECRET_KEY", "sk")
		t.Setenv("LANGFUSE_HOST", "https://lf.example")
		tracer, out := build(t, false)
		if _, ok := tracer.(telemetry.Noop); !ok {
			t.Errorf("Tracer = %T on a stub run — dry-run spans must never reach the real Langfuse project", tracer)
		}
		mustContain(t, "buildDeps stdout", out, "telemetry: off (stub run")
	})
}

func TestRunCommandSingleArm(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "out")
	code, _, stderr := runCLI(t, "run",
		"--arm", "grounded",
		"--seeds", testSeedsPath,
		"--script", testScriptPath,
		"--data", testDataDirPath,
		"--db", filepath.Join(t.TempDir(), "harness.db"),
		"--out", outDir,
	)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	if _, err := os.Stat(filepath.Join(outDir, "claims_grounded.jsonl")); err != nil {
		t.Errorf("claims_grounded.jsonl missing: %v", err)
	}
	for _, other := range []string{"claims_ungrounded.jsonl", "claims_flavorgraph.jsonl"} {
		if _, err := os.Stat(filepath.Join(outDir, other)); !os.IsNotExist(err) {
			t.Errorf("%s written for a grounded-only run (stat err = %v)", other, err)
		}
	}

	if code, _, stderr := runCLI(t, "run", "--arm", "none", "--seeds", testSeedsPath); code != 1 || !strings.Contains(stderr, "ungrounded|flavorgraph|grounded") {
		t.Errorf("--arm=none: code=%d stderr=%q, want 1 listing the eval arms", code, stderr)
	}
}

// --live is refused without BOTH CAPYCOOK_LIVE_TEST=1 and a key, printing the
// budget state either way (global rail: no live LLM calls in phase 4).
func TestRunCommandRefusesLive(t *testing.T) {
	outDir := filepath.Join(t.TempDir(), "out")
	base := []string{"run", "--live",
		"--seeds", testSeedsPath,
		"--script", testScriptPath,
		"--data", testDataDirPath,
		"--db", filepath.Join(t.TempDir(), "harness.db"),
		"--out", outDir,
	}

	t.Setenv("CAPYCOOK_LIVE_TEST", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	code, stdout, stderr := runCLI(t, base...)
	if code != 1 {
		t.Fatalf("no env gate: code=%d, want 1", code)
	}
	mustContain(t, "live refusal (no env)", stderr, "refusing --live", "CAPYCOOK_LIVE_TEST")
	mustContain(t, "live refusal budget state", stdout, "budget", "cap")

	t.Setenv("CAPYCOOK_LIVE_TEST", "1")
	code, _, stderr = runCLI(t, base...)
	if code != 1 {
		t.Fatalf("no key: code=%d, want 1", code)
	}
	mustContain(t, "live refusal (no key)", stderr, "refusing --live", "DEEPSEEK_API_KEY")

	if entries, err := os.ReadDir(outDir); err == nil && len(entries) > 0 {
		t.Errorf("refused --live still wrote %d output files", len(entries))
	}
}

// --- report ---

func TestReportNoData(t *testing.T) {
	jsonPath := filepath.Join(t.TempDir(), "report.json")
	code, stdout, stderr := runCLI(t, "report",
		"--db", filepath.Join(t.TempDir(), "missing.db"),
		"--json", jsonPath,
	)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "no-data report", stdout,
		"NO LABELED DATA",          // the no-data banner
		"one human",                // single-operator caveat line
		"cancel folds into reject", // frozen-five derivation note
		"no event-log database",
	)

	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatalf("read JSON report: %v", err)
	}
	var rep struct {
		Banner       string            `json:"banner"`
		Rates        []json.RawMessage `json:"rates"`
		Kappa        *json.RawMessage  `json:"kappa"`
		GateDynamics *json.RawMessage  `json:"gate_dynamics"`
	}
	if err := json.Unmarshal(raw, &rep); err != nil {
		t.Fatalf("parse JSON report: %v", err)
	}
	if rep.Banner == "" {
		t.Error("JSON report banner empty, want the no-data banner")
	}
	if len(rep.Rates) != 0 || rep.Kappa != nil || rep.GateDynamics != nil {
		t.Errorf("JSON report carries data with none available: rates=%d kappa=%v dynamics=%v",
			len(rep.Rates), rep.Kappa != nil, rep.GateDynamics != nil)
	}
}

func TestReportComposed(t *testing.T) {
	db := seedEventDB(t)
	jsonPath := filepath.Join(t.TempDir(), "report.json")
	code, stdout, stderr := runCLI(t, "report",
		"--labels", testLabelsPath,
		"--db", db,
		"--json", jsonPath,
	)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	// Rates rows (hand-computed), κ over the fixture's 3 double-labeled rows
	// (p_o=2/3, p_e=1/3 → κ=0.5), and the H2 fold with explicit Ns.
	mustContain(t, "composed report", stdout,
		"| grounded | 8 | 1 | 6 | 1 | 0.667 | 0.167 | 0.167 |",
		"| ungrounded | 5 | 0 | 4 | 1 | 0.250 | 0.000 | 0.750 |",
		"N=3 double-labeled claims",
		"κ=0.500",
		"N=11 gate decisions across 2 sessions, single operator",
		"one human",
		"cancel folds into reject",
	)

	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatalf("read JSON report: %v", err)
	}
	var rep struct {
		Banner string `json:"banner"`
		Rates  []struct {
			Arm       string `json:"arm"`
			Total     int    `json:"total"`
			Checkable int    `json:"checkable"`
		} `json:"rates"`
		Kappa *struct {
			N     int     `json:"n"`
			Kappa float64 `json:"kappa"`
		} `json:"kappa"`
		GateDynamics *struct {
			N          int            `json:"n"`
			Sessions   int            `json:"sessions"`
			FrozenFive map[string]int `json:"frozen_five"`
		} `json:"gate_dynamics"`
	}
	if err := json.Unmarshal(raw, &rep); err != nil {
		t.Fatalf("parse JSON report: %v", err)
	}
	if rep.Banner != "" {
		t.Errorf("banner = %q, want none (labeled data present)", rep.Banner)
	}
	if len(rep.Rates) != 2 {
		t.Fatalf("JSON rates has %d arms, want 2", len(rep.Rates))
	}
	byArm := map[string]struct{ total, checkable int }{}
	for _, r := range rep.Rates {
		byArm[r.Arm] = struct{ total, checkable int }{r.Total, r.Checkable}
	}
	if g := byArm["grounded"]; g.total != 8 || g.checkable != 6 {
		t.Errorf("grounded Ns = %+v, want total=8 checkable=6", g)
	}
	if rep.Kappa == nil || rep.Kappa.N != 3 || math.Abs(rep.Kappa.Kappa-0.5) > 1e-9 {
		t.Errorf("JSON kappa = %+v, want N=3 κ=0.5", rep.Kappa)
	}
	if rep.GateDynamics == nil || rep.GateDynamics.N != 11 || rep.GateDynamics.Sessions != 2 {
		t.Fatalf("JSON gate dynamics = %+v, want N=11 sessions=2", rep.GateDynamics)
	}
	if rep.GateDynamics.FrozenFive["reject"] != 1 || rep.GateDynamics.FrozenFive["accept"] != 2 {
		t.Errorf("frozen five = %v, want accept=2 reject=1 (cancel folded)", rep.GateDynamics.FrozenFive)
	}
}

// --- export-labels / import-labels (plan 4.6) ---

// writeUnlabeledClaims writes one temp claims_<arm>.jsonl the way the runner
// does — UNLABELED, no label values anywhere in this test file.
func writeUnlabeledClaims(t *testing.T, dir, arm string, n int) string {
	t.Helper()
	claims := make([]eval.Claim, n)
	for i := range claims {
		claims[i] = eval.Claim{
			ClaimID: fmt.Sprintf("clm-synth-%s-%03d", arm, i+1),
			Arm:     arm,
			Dish:    "dish-synthetic-1",
			Text:    fmt.Sprintf("SYNTHETIC %s claim %d", arm, i+1),
		}
	}
	path := filepath.Join(dir, "claims_"+arm+".jsonl")
	if err := eval.WriteClaims(path, claims); err != nil {
		t.Fatalf("write claims fixture: %v", err)
	}
	return path
}

func TestExportLabelsCommand(t *testing.T) {
	dir := t.TempDir()
	paths := []string{
		writeUnlabeledClaims(t, dir, "ungrounded", 5),
		writeUnlabeledClaims(t, dir, "flavorgraph", 4),
		writeUnlabeledClaims(t, dir, "grounded", 3),
	}
	out := filepath.Join(dir, "labels.csv")
	code, stdout, stderr := runCLI(t, "export-labels", "--claims", strings.Join(paths, ","), "--out", out)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	// All 12 claims are Tier-2 (label_tier1 empty): none is filtered out, and
	// every row is double-labeled — no sampler, no per-arm rate (Amendment 1).
	mustContain(t, "export summary", stdout,
		"tier-2 sheet: 12 claims (tier-1 already labeled: 0)",
		"every row double-labeled", "Amendment 1",
		"EMPTY",
	)

	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("read sheet: %v", err)
	}
	marked := 0
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		if strings.HasSuffix(line, ",true") {
			marked++
		}
	}
	if marked != 12 {
		t.Errorf("marked rows = %d, want 12 (every row double-labeled)", marked)
	}
	f, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	claims, err := eval.ReadLabelCSV(f)
	if err != nil {
		t.Fatalf("ReadLabelCSV: %v", err)
	}
	if len(claims) != 12 {
		t.Errorf("sheet rows = %d, want 12", len(claims))
	}
	for _, c := range claims {
		if c.LabelR1 != "" || c.LabelR2 != "" {
			t.Errorf("claim %s exported with labels (%q/%q) — the sheet must be EMPTY", c.ClaimID, c.LabelR1, c.LabelR2)
		}
	}

	if code, _, stderr := runCLI(t, "export-labels", "--out", out); code != 1 || !strings.Contains(stderr, "--claims") {
		t.Errorf("missing --claims: code=%d stderr=%q, want 1 naming the flag", code, stderr)
	}
	// A claims file that already carries labels can never become a fresh sheet.
	if code, _, stderr := runCLI(t, "export-labels", "--claims", testLabelsPath, "--out", filepath.Join(dir, "labels2.csv")); code != 1 || !strings.Contains(stderr, "labels") {
		t.Errorf("labeled input: code=%d stderr=%q, want 1 refusing the pre-labeled file", code, stderr)
	}
}

func TestImportLabelsCommand(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "claims_labeled.jsonl")
	sheet := "../../internal/eval/testdata/labels_sheet_valid.csv"
	code, stdout, stderr := runCLI(t, "import-labels", "--csv", sheet, "--out", out)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	// Fixture arithmetic (labels_test.go): 6 rows, 5 with label_r1, 2 with
	// both labels, 1 still unlabeled.
	mustContain(t, "import summary", stdout,
		"6 imported", "5 labeled by R1", "2 double-labeled", "1 still unlabeled", out,
	)
	f, err := os.Open(out)
	if err != nil {
		t.Fatalf("open imported jsonl: %v", err)
	}
	claims, err := eval.ReadClaims(f)
	f.Close()
	if err != nil {
		t.Fatalf("ReadClaims: %v", err)
	}
	if len(claims) != 6 {
		t.Errorf("imported claims = %d, want 6", len(claims))
	}
	// The imported JSONL is what rates/kappa consume.
	if code, _, stderr := runCLI(t, "rates", "--labels", out); code != 0 {
		t.Errorf("rates over imported jsonl: code=%d stderr=%q, want 0", code, stderr)
	}

	if code, _, stderr := runCLI(t, "import-labels", "--out", out); code != 1 || !strings.Contains(stderr, "--csv") {
		t.Errorf("missing --csv: code=%d stderr=%q, want 1 naming the flag", code, stderr)
	}
	badSheet := "../../internal/eval/testdata/labels_sheet_bad_label.csv"
	badOut := filepath.Join(dir, "bad.jsonl")
	if code, _, stderr := runCLI(t, "import-labels", "--csv", badSheet, "--out", badOut); code != 1 || !strings.Contains(stderr, "plausible") || !strings.Contains(stderr, "frozen") {
		t.Errorf("unknown label: code=%d stderr=%q, want 1 naming the value and the frozen rubric", code, stderr)
	}
	if _, err := os.Stat(badOut); !os.IsNotExist(err) {
		t.Errorf("rejected import still wrote %s (stat err = %v)", badOut, err)
	}
}

// --- judge (Task 20: Tier-2 R2 labeling) ---

// fakeJudge is the test-only judgeClient double: it returns a canned verdict
// (or error) and counts calls, so tests can assert exactly which claims the
// CLI actually sent to the judge. budgetAt (1-indexed, 0 = never) makes it
// return llm.ErrBudgetExhausted on that call, so a test can exercise the
// mid-run budget hard-stop.
type fakeJudge struct {
	calls    int
	verdict  llm.JudgeVerdict
	err      error
	budgetAt int
}

func (f *fakeJudge) LabelClaim(ctx context.Context, text, source string) (llm.JudgeVerdict, error) {
	f.calls++
	if f.budgetAt != 0 && f.calls == f.budgetAt {
		return llm.JudgeVerdict{}, fmt.Errorf("call %d: %w", f.calls, llm.ErrBudgetExhausted)
	}
	return f.verdict, f.err
}

// withFakeJudge overrides the package-level judgeFactory seam for the
// duration of the test, restoring the original (real, live-gated) factory on
// cleanup.
func withFakeJudge(t *testing.T, fj *fakeJudge) {
	t.Helper()
	orig := judgeFactory
	judgeFactory = func(dbPath string, stdout io.Writer) (judgeClient, error) {
		return fj, nil
	}
	t.Cleanup(func() { judgeFactory = orig })
}

// judge refuses without --live: there is no stub judging (a canned label
// would be fabricated data), so the CLI must name both the missing flag and
// the underlying env gate it maps to — mirroring run --live's refusal shape.
func TestJudgeCommandRefusesNonLive(t *testing.T) {
	dir := t.TempDir()
	claimsPath := writeUnlabeledClaims(t, dir, "grounded", 1)
	outPath := filepath.Join(dir, "claims_judged.jsonl")

	code, _, stderr := runCLI(t, "judge", "--claims", claimsPath, "--out", outPath)
	if code != 1 {
		t.Fatalf("code=%d stderr=%q, want 1", code, stderr)
	}
	mustContain(t, "judge non-live refusal", stderr, "--live", "CAPYCOOK_LIVE_TEST")
	if _, err := os.Stat(outPath); !os.IsNotExist(err) {
		t.Errorf("refused judge run still wrote %s", outPath)
	}
}

// judge only labels claims with both label_tier1 and label_r2 empty: a
// tier-1-settled claim is never judged, and a claim already carrying label_r2
// is skipped (idempotent resume) — over this 3-claim file exactly one claim
// is eligible, so the fake judge must see exactly one call.
func TestJudgeCommandLabelsOnlyEligibleClaims(t *testing.T) {
	dir := t.TempDir()
	claims := []eval.Claim{
		{ClaimID: "clm-1", Arm: "grounded", Dish: "dish-1", Text: "text one", Source: "source one", LabelTier1: eval.LabelGroundedCorrect},
		{ClaimID: "clm-2", Arm: "grounded", Dish: "dish-1", Text: "text two", Source: "source two", LabelR2: eval.LabelHallucinated},
		{ClaimID: "clm-3", Arm: "grounded", Dish: "dish-1", Text: "text three", Source: "source three"},
	}
	claimsPath := filepath.Join(dir, "claims.jsonl")
	if err := eval.WriteClaims(claimsPath, claims); err != nil {
		t.Fatalf("write claims fixture: %v", err)
	}
	outPath := filepath.Join(dir, "claims_judged.jsonl")

	fj := &fakeJudge{verdict: llm.JudgeVerdict{Label: eval.LabelGroundedCorrect, Rationale: "fake rationale"}}
	withFakeJudge(t, fj)

	code, stdout, stderr := runCLI(t, "judge", "--live", "--claims", claimsPath, "--out", outPath)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	if fj.calls != 1 {
		t.Fatalf("LabelClaim calls = %d, want 1 (only clm-3 is eligible)", fj.calls)
	}
	mustContain(t, "judge summary", stdout,
		"judge R2: 1 labeled, 1 skipped (already labeled), 1 tier-1 (not judged)")

	f, err := os.Open(outPath)
	if err != nil {
		t.Fatalf("open judged output: %v", err)
	}
	defer f.Close()
	got, err := eval.ReadClaims(f)
	if err != nil {
		t.Fatalf("ReadClaims: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("output claims = %d, want 3 (every claim carried through)", len(got))
	}
	byID := map[string]eval.Claim{}
	for _, c := range got {
		byID[c.ClaimID] = c
	}
	if byID["clm-1"].LabelR2 != "" {
		t.Errorf("tier-1-labeled claim got label_r2 = %q, want empty (never judged)", byID["clm-1"].LabelR2)
	}
	if byID["clm-2"].LabelR2 != eval.LabelHallucinated {
		t.Errorf("already-labeled claim label_r2 changed to %q, want unchanged %q", byID["clm-2"].LabelR2, eval.LabelHallucinated)
	}
	if byID["clm-3"].LabelR2 != eval.LabelGroundedCorrect {
		t.Errorf("eligible claim label_r2 = %q, want %q (from the fake judge)", byID["clm-3"].LabelR2, eval.LabelGroundedCorrect)
	}
}

// A claim the judge errors on after retries keeps label_r2 empty and is
// counted abstained rather than failing the whole run — the summary surfaces
// the count only when it's non-zero.
func TestJudgeCommandAbstainsOnJudgeError(t *testing.T) {
	dir := t.TempDir()
	claimsPath := writeUnlabeledClaims(t, dir, "grounded", 1)
	outPath := filepath.Join(dir, "claims_judged.jsonl")

	fj := &fakeJudge{err: errors.New("exhausted retries")}
	withFakeJudge(t, fj)

	code, stdout, stderr := runCLI(t, "judge", "--live", "--claims", claimsPath, "--out", outPath)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0 (abstain is not fatal)", code, stderr)
	}
	mustContain(t, "judge abstain summary", stdout,
		"judge R2: 0 labeled, 0 skipped (already labeled), 0 tier-1 (not judged), 1 abstained")

	f, err := os.Open(outPath)
	if err != nil {
		t.Fatalf("open judged output: %v", err)
	}
	defer f.Close()
	got, err := eval.ReadClaims(f)
	if err != nil {
		t.Fatalf("ReadClaims: %v", err)
	}
	if len(got) != 1 || got[0].LabelR2 != "" {
		t.Fatalf("got claims = %+v, want 1 claim with label_r2 empty", got)
	}
}

// Budget exhaustion is a hard-stop on the shared cap, not a per-claim abstain:
// once LabelClaim returns llm.ErrBudgetExhausted the loop stops early, every
// remaining claim keeps label_r2 empty, and a distinct final line reports the
// unjudged count alongside the (correct) labeled count.
func TestJudgeCommandStopsEarlyOnBudgetExhaustion(t *testing.T) {
	dir := t.TempDir()
	claims := []eval.Claim{
		{ClaimID: "clm-1", Arm: "grounded", Dish: "dish-1", Text: "text one", Source: "src one"},
		{ClaimID: "clm-2", Arm: "grounded", Dish: "dish-1", Text: "text two", Source: "src two"},
		{ClaimID: "clm-3", Arm: "grounded", Dish: "dish-1", Text: "text three", Source: "src three"},
	}
	claimsPath := filepath.Join(dir, "claims.jsonl")
	if err := eval.WriteClaims(claimsPath, claims); err != nil {
		t.Fatalf("write claims fixture: %v", err)
	}
	outPath := filepath.Join(dir, "claims_judged.jsonl")

	// Call 1 labels clm-1; call 2 (clm-2) hits the cap and stops the loop —
	// clm-3 is never even sent.
	fj := &fakeJudge{verdict: llm.JudgeVerdict{Label: eval.LabelGroundedCorrect, Rationale: "r"}, budgetAt: 2}
	withFakeJudge(t, fj)

	code, stdout, stderr := runCLI(t, "judge", "--live", "--claims", claimsPath, "--out", outPath)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0 (budget stop is a clean early exit, not a failure)", code, stderr)
	}
	if fj.calls != 2 {
		t.Fatalf("LabelClaim calls = %d, want 2 (loop must stop at the cap, not send clm-3)", fj.calls)
	}
	mustContain(t, "judge budget-stop summary", stdout,
		"judge R2: 1 labeled, 0 skipped (already labeled), 0 tier-1 (not judged)",
		"budget cap reached — stopped with 2 claims unjudged (label_r2 empty)")

	f, err := os.Open(outPath)
	if err != nil {
		t.Fatalf("open judged output: %v", err)
	}
	defer f.Close()
	got, err := eval.ReadClaims(f)
	if err != nil {
		t.Fatalf("ReadClaims: %v", err)
	}
	byID := map[string]eval.Claim{}
	for _, c := range got {
		byID[c.ClaimID] = c
	}
	if byID["clm-1"].LabelR2 != eval.LabelGroundedCorrect {
		t.Errorf("clm-1 label_r2 = %q, want %q (labeled before the cap)", byID["clm-1"].LabelR2, eval.LabelGroundedCorrect)
	}
	if byID["clm-2"].LabelR2 != "" || byID["clm-3"].LabelR2 != "" {
		t.Errorf("post-cap claims label_r2 = %q/%q, want both empty (unjudged)", byID["clm-2"].LabelR2, byID["clm-3"].LabelR2)
	}
}

// --- blind kit (PREREG §9 Amendment 1 R1 blinding + verifier↔author
// blind-check) ---

func TestExportLabelsBlindCommand(t *testing.T) {
	dir := t.TempDir()
	paths := []string{
		writeUnlabeledClaims(t, dir, "ungrounded", 3),
		writeUnlabeledClaims(t, dir, "flavorgraph", 3),
		writeUnlabeledClaims(t, dir, "grounded", 3),
	}
	out := filepath.Join(dir, "labels_blind.csv")
	mapOut := filepath.Join(dir, "labels_blind_map.csv")
	code, stdout, stderr := runCLI(t, "export-labels", "--blind", "--claims", strings.Join(paths, ","), "--out", out, "--map", mapOut)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "blind export summary", stdout,
		"tier-2 sheet: 9 claims (tier-1 already labeled: 0)",
		"blind sheet -> "+out,
		"blind map -> "+mapOut,
		"do not open the map until R1 labeling is done",
	)

	f, err := os.Open(out)
	if err != nil {
		t.Fatalf("open blind sheet: %v", err)
	}
	sheet, err := eval.ReadBlindCSV(f)
	f.Close()
	if err != nil {
		t.Fatalf("ReadBlindCSV: %v", err)
	}
	if len(sheet) != 9 {
		t.Errorf("blind sheet rows = %d, want 9", len(sheet))
	}
	for _, h := range eval.BlindCSVHeader {
		if h == "arm" || h == "claim_id" {
			t.Errorf("blind sheet header carries a %q column", h)
		}
	}

	mapRaw, err := os.ReadFile(mapOut)
	if err != nil {
		t.Fatalf("read blind map: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(mapRaw)), "\n")
	if len(lines) != 10 { // header + 9 rows
		t.Errorf("blind map lines = %d, want 10 (header + 9 rows)", len(lines))
	}

	if code, _, stderr := runCLI(t, "export-labels", "--blind", "--out", out); code != 1 || !strings.Contains(stderr, "--claims") {
		t.Errorf("missing --claims (blind): code=%d stderr=%q, want 1 naming the flag", code, stderr)
	}
}

func TestImportLabelsBlindCommand(t *testing.T) {
	dir := t.TempDir()
	paths := []string{
		writeUnlabeledClaims(t, dir, "ungrounded", 2),
		writeUnlabeledClaims(t, dir, "flavorgraph", 2),
	}
	blindOut := filepath.Join(dir, "labels_blind.csv")
	mapOut := filepath.Join(dir, "labels_blind_map.csv")
	if code, _, stderr := runCLI(t, "export-labels", "--blind", "--claims", strings.Join(paths, ","), "--out", blindOut, "--map", mapOut); code != 0 {
		t.Fatalf("export-labels --blind: code=%d stderr=%q", code, stderr)
	}

	// Simulate the author blind-labeling every row of the sheet.
	f, err := os.Open(blindOut)
	if err != nil {
		t.Fatal(err)
	}
	sheet, err := eval.ReadBlindCSV(f)
	f.Close()
	if err != nil {
		t.Fatalf("ReadBlindCSV: %v", err)
	}
	for i := range sheet {
		sheet[i].LabelR1 = eval.LabelGroundedCorrect
	}
	sf, err := os.Create(blindOut)
	if err != nil {
		t.Fatal(err)
	}
	if err := eval.WriteBlindCSV(sf, sheet); err != nil {
		t.Fatal(err)
	}
	if err := sf.Close(); err != nil {
		t.Fatal(err)
	}

	// RejoinBlind needs the original claims to write label_r1 onto: combine
	// the two arm files export-labels read from.
	var all []eval.Claim
	for _, p := range paths {
		pf, err := os.Open(p)
		if err != nil {
			t.Fatal(err)
		}
		cs, err := eval.ReadClaims(pf)
		pf.Close()
		if err != nil {
			t.Fatal(err)
		}
		all = append(all, cs...)
	}
	claimsCombined := filepath.Join(dir, "claims_all.jsonl")
	if err := eval.WriteClaims(claimsCombined, all); err != nil {
		t.Fatal(err)
	}

	out := filepath.Join(dir, "claims_labeled.jsonl")
	code, stdout, stderr := runCLI(t, "import-labels", "--blind", "--csv", blindOut, "--map", mapOut, "--claims", claimsCombined, "--out", out)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "blind import summary", stdout, "4 imported", "4 labeled by R1", out)

	rf, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	labeled, err := eval.ReadClaims(rf)
	rf.Close()
	if err != nil {
		t.Fatal(err)
	}
	if len(labeled) != 4 {
		t.Fatalf("labeled claims = %d, want 4", len(labeled))
	}
	for _, c := range labeled {
		if c.LabelR1 != eval.LabelGroundedCorrect {
			t.Errorf("claim %s label_r1 = %q, want %q", c.ClaimID, c.LabelR1, eval.LabelGroundedCorrect)
		}
	}

	if code, _, stderr := runCLI(t, "import-labels", "--blind", "--csv", blindOut, "--claims", claimsCombined, "--out", out); code != 1 || !strings.Contains(stderr, "--map") {
		t.Errorf("missing --map: code=%d stderr=%q, want 1 naming the flag", code, stderr)
	}
}

// tier1LabeledClaims builds n claims per arm, every one already Tier-1-
// labeled (label_tier1 = label) — the verifier↔author blind-check draws
// from exactly this subset.
func tier1LabeledClaims(arms []string, label string, n int) []eval.Claim {
	var claims []eval.Claim
	for _, arm := range arms {
		for i := 0; i < n; i++ {
			claims = append(claims, eval.Claim{
				ClaimID:    fmt.Sprintf("clm-%s-bench-01-%03d", arm, i+1),
				Arm:        arm,
				Dish:       "bench-01",
				Text:       fmt.Sprintf("SYNTHETIC claim %d", i+1),
				LabelTier1: label,
			})
		}
	}
	return claims
}

func TestBlindCheckCommand(t *testing.T) {
	dir := t.TempDir()
	claims := tier1LabeledClaims([]string{"ungrounded", "flavorgraph", "grounded"}, eval.LabelGroundedCorrect, 3)
	claimsPath := filepath.Join(dir, "claims_tier1.jsonl")
	if err := eval.WriteClaims(claimsPath, claims); err != nil {
		t.Fatal(err)
	}

	out := filepath.Join(dir, "blind_check.csv")
	code, stdout, stderr := runCLI(t, "blind-check", "--claims", claimsPath, "--out", out)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "blind-check summary", stdout,
		"blind-check sample: 9 of 9 Tier-1-labeled claims",
		"blind-check sheet -> "+out,
		"label_tier1 is withheld",
	)

	f, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	sheet, err := eval.ReadBlindCSV(f)
	if err != nil {
		t.Fatalf("ReadBlindCSV: %v", err)
	}
	if len(sheet) != 9 {
		t.Errorf("blind-check sheet rows = %d, want 9", len(sheet))
	}
	mapPath := filepath.Join(dir, "blind_check_map.csv")
	if _, err := os.Stat(mapPath); err != nil {
		t.Errorf("derived map path %s missing: %v", mapPath, err)
	}

	unlabeledPath := writeUnlabeledClaims(t, dir, "grounded", 2)
	if code, _, stderr := runCLI(t, "blind-check", "--claims", unlabeledPath, "--out", filepath.Join(dir, "bc2.csv")); code != 1 || !strings.Contains(stderr, "no Tier-1-labeled claims") {
		t.Errorf("no tier-1 claims: code=%d stderr=%q, want 1 naming it", code, stderr)
	}
}

func TestBlindCheckScoreCommand(t *testing.T) {
	dir := t.TempDir()
	claims := tier1LabeledClaims([]string{"ungrounded", "flavorgraph", "grounded"}, eval.LabelGroundedCorrect, 3)
	claimsPath := filepath.Join(dir, "claims_tier1.jsonl")
	if err := eval.WriteClaims(claimsPath, claims); err != nil {
		t.Fatal(err)
	}

	sheetPath := filepath.Join(dir, "blind_check.csv")
	mapPath := filepath.Join(dir, "blind_check_map.csv")
	if code, _, stderr := runCLI(t, "blind-check", "--claims", claimsPath, "--out", sheetPath, "--map", mapPath); code != 0 {
		t.Fatalf("blind-check: code=%d stderr=%q", code, stderr)
	}

	f, err := os.Open(sheetPath)
	if err != nil {
		t.Fatal(err)
	}
	sheet, err := eval.ReadBlindCSV(f)
	f.Close()
	if err != nil {
		t.Fatalf("ReadBlindCSV: %v", err)
	}
	// The author agrees on every row but one — exercises both the agreement
	// count and a non-trivial confusion cell.
	for i := range sheet {
		if i == 0 {
			sheet[i].LabelR1 = eval.LabelHallucinated
		} else {
			sheet[i].LabelR1 = eval.LabelGroundedCorrect
		}
	}
	sf, err := os.Create(sheetPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := eval.WriteBlindCSV(sf, sheet); err != nil {
		t.Fatal(err)
	}
	if err := sf.Close(); err != nil {
		t.Fatal(err)
	}

	code, stdout, stderr := runCLI(t, "blind-check-score", "--csv", sheetPath, "--map", mapPath, "--claims", claimsPath)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "blind-check-score summary", stdout,
		fmt.Sprintf("verifier↔author agreement: %d/9", len(sheet)-1),
		eval.LabelGroundedCorrect+" -> "+eval.LabelHallucinated+": 1",
	)

	if code, _, stderr := runCLI(t, "blind-check-score", "--csv", sheetPath, "--map", mapPath); code != 1 || !strings.Contains(stderr, "--claims") {
		t.Errorf("missing --claims: code=%d stderr=%q, want 1 naming the flag", code, stderr)
	}
}

// A claims file with zero labels: rates render with explicit zero
// denominators under the UNLABELED banner, and κ is noted as not measurable.
func TestReportUnlabeledBanner(t *testing.T) {
	claims := filepath.Join(t.TempDir(), "claims.jsonl")
	lines := `{"claim_id":"clm-synth-cli2","arm":"grounded","dish":"dish-synthetic-1","text":"SYNTHETIC claim a","source":""}
{"claim_id":"clm-synth-cli3","arm":"grounded","dish":"dish-synthetic-1","text":"SYNTHETIC claim b","source":""}
`
	if err := os.WriteFile(claims, []byte(lines), 0o644); err != nil {
		t.Fatal(err)
	}
	code, stdout, stderr := runCLI(t, "report",
		"--labels", claims,
		"--db", filepath.Join(t.TempDir(), "missing.db"),
		"--json", filepath.Join(t.TempDir(), "report.json"),
	)
	if code != 0 {
		t.Fatalf("code=%d stderr=%q, want 0", code, stderr)
	}
	mustContain(t, "unlabeled report", stdout,
		"UNLABELED",
		"| grounded | 2 | 2 | 0 | 0 | 0.000 | 0.000 | 0.000 |",
		"not measurable",
	)
}

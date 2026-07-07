package llm

import (
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func almostEqual(a, b float64) bool { return math.Abs(a-b) < 1e-12 }

// TestCostUSDArithmetic pins the USD arithmetic to the verified prices
// (api-docs.deepseek.com, fetched 2026-07-07): input $0.435/M cache miss,
// $0.003625/M cache hit, output $0.87/M.
func TestCostUSDArithmetic(t *testing.T) {
	cases := []struct {
		name                      string
		prompt, cached, completion int
		want                      float64
	}{
		{
			// hit/miss split: 60k miss + 40k hit + 20k out
			name: "hit-miss split", prompt: 100000, cached: 40000, completion: 20000,
			want: 60000*0.435/1e6 + 40000*0.003625/1e6 + 20000*0.87/1e6,
		},
		{
			name: "all miss no details", prompt: 1000, cached: 0, completion: 0,
			want: 1000 * 0.435 / 1e6,
		},
		{
			name: "output only", prompt: 0, cached: 0, completion: 1000,
			want: 1000 * 0.87 / 1e6,
		},
		{
			// defensive clamp: cached can never exceed prompt tokens
			name: "cached exceeds prompt clamps", prompt: 100, cached: 200, completion: 0,
			want: 100 * 0.003625 / 1e6,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := costUSD(tc.prompt, tc.cached, tc.completion); !almostEqual(got, tc.want) {
				t.Fatalf("costUSD(%d,%d,%d) = %v, want %v", tc.prompt, tc.cached, tc.completion, got, tc.want)
			}
		})
	}
}

func TestUsageMeterAccumulatesAndPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "budget.json")
	m, err := OpenUsageMeter(path, 10)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	if got := m.Spent(); got != 0 {
		t.Fatalf("fresh meter Spent() = %v, want 0", got)
	}
	if err := m.Record(100000, 40000, 20000); err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := m.Record(1000, 0, 500); err != nil {
		t.Fatalf("Record: %v", err)
	}
	want := costUSD(100000, 40000, 20000) + costUSD(1000, 0, 500)
	if got := m.Spent(); !almostEqual(got, want) {
		t.Fatalf("Spent() = %v, want %v", got, want)
	}

	// The cap survives restarts: a reopened meter sees the same spend.
	m2, err := OpenUsageMeter(path, 10)
	if err != nil {
		t.Fatalf("reopen OpenUsageMeter: %v", err)
	}
	if got := m2.Spent(); !almostEqual(got, want) {
		t.Fatalf("reopened Spent() = %v, want %v", got, want)
	}
	if got := m2.Cap(); got != 10 {
		t.Fatalf("Cap() = %v, want 10", got)
	}
}

func TestUsageMeterPreCheckHardStop(t *testing.T) {
	path := filepath.Join(t.TempDir(), "budget.json")
	m, err := OpenUsageMeter(path, 0.0004)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	if err := m.PreCheck(); err != nil {
		t.Fatalf("PreCheck under cap: %v, want nil", err)
	}
	// 1000 miss tokens = $0.000435 >= $0.0004 cap.
	if err := m.Record(1000, 0, 0); err != nil {
		t.Fatalf("Record: %v", err)
	}
	err = m.PreCheck()
	if !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("PreCheck at cap = %v, want ErrBudgetExhausted", err)
	}
}

func TestOpenUsageMeterMissingFileStartsAtZero(t *testing.T) {
	m, err := OpenUsageMeter(filepath.Join(t.TempDir(), "nonexistent", "budget.json"), 5)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	if got := m.Spent(); got != 0 {
		t.Fatalf("Spent() = %v, want 0", got)
	}
}

func TestOpenUsageMeterCorruptFileErrors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "budget.json")
	if err := os.WriteFile(path, []byte("not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := OpenUsageMeter(path, 5); err == nil {
		t.Fatal("OpenUsageMeter on a corrupt ledger succeeded, want error (never silently reset spend)")
	}
}

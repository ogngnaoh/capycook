package eval

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func loadFixtureClaims(t *testing.T) []Claim {
	t.Helper()
	f, err := os.Open(filepath.Join("testdata", "claims_labeled.jsonl"))
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer f.Close()
	claims, err := ReadClaims(f)
	if err != nil {
		t.Fatalf("ReadClaims: %v", err)
	}
	return claims
}

// Hand-computed expectations from testdata/claims_labeled.jsonl (PREREG §7a,
// scored on label_r1 only; label_r2 exists for the κ subset).
//
// grounded (8 rows): grounded-correct ×3 (g1,g2,g8), correctly-unverified ×1
// (g3), grounded-mischaracterized ×1 (g4), hallucinated ×1 (g5),
// opinion-non-checkable ×1 (g6), unlabeled ×1 (g7).
//
//	checkable = 8 - 1 unlabeled - 1 opinion = 6
//	provenance/honesty       = (3+1)/6 = 4/6
//	mischaracterization      = 1/6     (neither for nor against — its own bucket)
//	hallucination            = 1/6
//
// ungrounded (5 rows): hallucinated ×3 (u1,u2,u5), correctly-unverified ×1
// (u3), opinion-non-checkable ×1 (u4).
//
//	checkable = 5 - 0 unlabeled - 1 opinion = 4
//	provenance/honesty = (0+1)/4 = 1/4 · mischaracterization = 0/4 ·
//	hallucination = 3/4
func TestComputeRatesOnSyntheticLabels(t *testing.T) {
	got, err := ComputeRates(loadFixtureClaims(t))
	if err != nil {
		t.Fatalf("ComputeRates: %v", err)
	}
	want := map[string]ArmRates{
		"grounded": {
			Arm:       "grounded",
			Total:     8,
			Unlabeled: 1,
			Excluded:  1,
			Checkable: 6,
			Counts: map[string]int{
				LabelGroundedCorrect:          3,
				LabelCorrectlyUnverified:      1,
				LabelGroundedMischaracterized: 1,
				LabelHallucinated:             1,
				LabelOpinionNonCheckable:      1,
			},
			Provenance:          4.0 / 6.0,
			Mischaracterization: 1.0 / 6.0,
			Hallucination:       1.0 / 6.0,
		},
		"ungrounded": {
			Arm:       "ungrounded",
			Total:     5,
			Unlabeled: 0,
			Excluded:  1,
			Checkable: 4,
			Counts: map[string]int{
				LabelHallucinated:        3,
				LabelCorrectlyUnverified: 1,
				LabelOpinionNonCheckable: 1,
			},
			Provenance:          1.0 / 4.0,
			Mischaracterization: 0,
			Hallucination:       3.0 / 4.0,
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ComputeRates:\n got %+v\nwant %+v", got, want)
	}
}

// A label value outside the frozen §7a categories must fail loudly — the
// harness never guesses what a labeler meant.
func TestComputeRatesRejectsUnknownLabel(t *testing.T) {
	claims := []Claim{{
		ClaimID: "clm-synth-bad", Arm: "grounded",
		Text: "SYNTHETIC claim", LabelR1: "plausible",
	}}
	_, err := ComputeRates(claims)
	if err == nil {
		t.Fatal("ComputeRates accepted an unknown label, want error")
	}
	if !strings.Contains(err.Error(), "clm-synth-bad") || !strings.Contains(err.Error(), "plausible") {
		t.Errorf("error should name the claim and the bad label, got: %v", err)
	}
}

// checkable = 0 (everything opinion or unlabeled): rates stay 0 and the
// explicit zero denominator carries the message — no NaN, no invented rate.
func TestComputeRatesZeroCheckable(t *testing.T) {
	claims := []Claim{
		{ClaimID: "clm-synth-o1", Arm: "grounded", Text: "SYNTHETIC opinion", LabelR1: LabelOpinionNonCheckable},
		{ClaimID: "clm-synth-o2", Arm: "grounded", Text: "SYNTHETIC unlabeled"},
	}
	got, err := ComputeRates(claims)
	if err != nil {
		t.Fatalf("ComputeRates: %v", err)
	}
	r := got["grounded"]
	if r.Checkable != 0 || r.Excluded != 1 || r.Unlabeled != 1 {
		t.Errorf("denominators = %+v, want Checkable=0 Excluded=1 Unlabeled=1", r)
	}
	if r.Provenance != 0 || r.Mischaracterization != 0 || r.Hallucination != 0 {
		t.Errorf("rates over an empty denominator must be 0, got %+v", r)
	}
}

func TestReadClaims(t *testing.T) {
	t.Run("skips blank lines", func(t *testing.T) {
		in := `{"claim_id":"clm-synth-1","arm":"grounded","dish":"d","text":"SYNTHETIC","source":"","label_r1":"hallucinated","label_r2":""}

{"claim_id":"clm-synth-2","arm":"grounded","dish":"d","text":"SYNTHETIC","source":"","label_r1":"","label_r2":""}
`
		claims, err := ReadClaims(strings.NewReader(in))
		if err != nil {
			t.Fatalf("ReadClaims: %v", err)
		}
		if len(claims) != 2 || claims[0].ClaimID != "clm-synth-1" || claims[1].ClaimID != "clm-synth-2" {
			t.Errorf("claims = %+v, want the 2 non-blank rows", claims)
		}
	})
	t.Run("reports the offending line", func(t *testing.T) {
		in := "{\"claim_id\":\"clm-synth-1\"}\n\n{not json\n"
		_, err := ReadClaims(strings.NewReader(in))
		if err == nil {
			t.Fatal("ReadClaims accepted malformed JSONL, want error")
		}
		if !strings.Contains(err.Error(), "line 3") {
			t.Errorf("error should point at line 3, got: %v", err)
		}
	})
}

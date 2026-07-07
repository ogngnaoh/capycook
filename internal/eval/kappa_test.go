package eval

import (
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func loadClaimsFile(t *testing.T, name string) []Claim {
	t.Helper()
	f, err := os.Open(filepath.Join("testdata", name))
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

// dl builds a double-labeled synthetic claim for the degenerate-case tests.
func dl(id, r1, r2 string) Claim {
	return Claim{ClaimID: id, Arm: "grounded", Text: "SYNTHETIC claim", LabelR1: r1, LabelR2: r2}
}

const kappaTol = 1e-9

// Hand-computed expectations from testdata/claims_double_labeled.jsonl.
//
// The file has 23 rows; 3 are NOT double-labeled and must be excluded from
// the subset: k21 (label_r2 empty), k22 (label_r1 empty), k23 (both empty).
// The double-labeled subset is the 20 rows k01–k20.
//
// Confusion matrix (rows = label_r1, cols = label_r2, KappaCategories order
// GC = grounded-correct, GM = grounded-mischaracterized,
// CU = correctly-unverified, H = hallucinated, O = opinion-non-checkable):
//
//	      GC  GM  CU   H   O | row
//	GC     6   1   0   0   0 |   7   (k01–k06 agree; k07 GC/GM)
//	GM     1   2   0   0   0 |   3   (k08 GM/GC; k09,k10 agree)
//	CU     0   0   3   1   0 |   4   (k11–k13 agree; k14 CU/H)
//	H      0   0   1   3   0 |   4   (k15 H/CU; k16–k18 agree)
//	O      0   0   0   0   2 |   2   (k19,k20 agree)
//	col    7   3   4   4   2 |  20
//
// Observed agreement p_o = diagonal / N = (6+2+3+3+2)/20 = 16/20 = 0.8
//
// Expected (chance) agreement from the marginals,
// p_e = Σ_k (row_k/N)·(col_k/N):
//
//	GC: (7/20)(7/20) = 49/400
//	GM: (3/20)(3/20) =  9/400
//	CU: (4/20)(4/20) = 16/400
//	H:  (4/20)(4/20) = 16/400
//	O:  (2/20)(2/20) =  4/400
//	p_e = 94/400 = 0.235
//
// κ = (p_o − p_e) / (1 − p_e) = (0.8 − 0.235) / (1 − 0.235)
//
//	= 0.565 / 0.765 = 113/153 ≈ 0.738562091503268
func TestComputeKappaOnHandComputedFixture(t *testing.T) {
	got, err := ComputeKappa(loadClaimsFile(t, "claims_double_labeled.jsonl"))
	if err != nil {
		t.Fatalf("ComputeKappa: %v", err)
	}
	if got.N != 20 {
		t.Errorf("N = %d, want 20 (the double-labeled subset)", got.N)
	}
	wantMatrix := [5][5]int{
		{6, 1, 0, 0, 0},
		{1, 2, 0, 0, 0},
		{0, 0, 3, 1, 0},
		{0, 0, 1, 3, 0},
		{0, 0, 0, 0, 2},
	}
	if got.Matrix != wantMatrix {
		t.Errorf("Matrix =\n%v\nwant\n%v", got.Matrix, wantMatrix)
	}
	if math.Abs(got.Observed-0.8) > kappaTol {
		t.Errorf("Observed = %v, want 16/20 = 0.8", got.Observed)
	}
	if math.Abs(got.Expected-0.235) > kappaTol {
		t.Errorf("Expected = %v, want 94/400 = 0.235", got.Expected)
	}
	if want := 113.0 / 153.0; math.Abs(got.Kappa-want) > kappaTol {
		t.Errorf("Kappa = %v, want 113/153 = %v", got.Kappa, want)
	}
}

// Perfect agreement → κ = 1 exactly, including the p_e == 1 corner (every
// claim in one category) where the raw formula would be 0/0.
func TestComputeKappaPerfectAgreement(t *testing.T) {
	t.Run("across categories", func(t *testing.T) {
		// p_o = 1, p_e = (2/3)² + (1/3)² = 5/9 < 1.
		got, err := ComputeKappa([]Claim{
			dl("clm-synth-p1", LabelGroundedCorrect, LabelGroundedCorrect),
			dl("clm-synth-p2", LabelGroundedCorrect, LabelGroundedCorrect),
			dl("clm-synth-p3", LabelHallucinated, LabelHallucinated),
		})
		if err != nil {
			t.Fatalf("ComputeKappa: %v", err)
		}
		if got.Kappa != 1 {
			t.Errorf("Kappa = %v, want exactly 1", got.Kappa)
		}
	})
	t.Run("single category (p_e == 1, formula is 0/0)", func(t *testing.T) {
		got, err := ComputeKappa([]Claim{
			dl("clm-synth-p4", LabelHallucinated, LabelHallucinated),
			dl("clm-synth-p5", LabelHallucinated, LabelHallucinated),
		})
		if err != nil {
			t.Fatalf("ComputeKappa: %v", err)
		}
		if math.IsNaN(got.Kappa) {
			t.Fatal("Kappa is NaN, want exactly 1")
		}
		if got.Kappa != 1 {
			t.Errorf("Kappa = %v, want exactly 1", got.Kappa)
		}
	})
}

// Observed agreement equal to chance agreement → κ = 0 exactly.
// Matrix [[1,1],[1,1]] over GC/H: p_o = 2/4 = 0.5 and
// p_e = (2/4)(2/4) + (2/4)(2/4) = 0.5.
func TestComputeKappaChanceAgreement(t *testing.T) {
	got, err := ComputeKappa([]Claim{
		dl("clm-synth-c1", LabelGroundedCorrect, LabelGroundedCorrect),
		dl("clm-synth-c2", LabelGroundedCorrect, LabelHallucinated),
		dl("clm-synth-c3", LabelHallucinated, LabelGroundedCorrect),
		dl("clm-synth-c4", LabelHallucinated, LabelHallucinated),
	})
	if err != nil {
		t.Fatalf("ComputeKappa: %v", err)
	}
	if got.Kappa != 0 {
		t.Errorf("Kappa = %v, want exactly 0 (observed == chance)", got.Kappa)
	}
}

// Symmetric total disagreement: p_o = 0, p_e = 0.5 → κ = −1.
func TestComputeKappaTotalDisagreement(t *testing.T) {
	got, err := ComputeKappa([]Claim{
		dl("clm-synth-d1", LabelGroundedCorrect, LabelHallucinated),
		dl("clm-synth-d2", LabelHallucinated, LabelGroundedCorrect),
	})
	if err != nil {
		t.Fatalf("ComputeKappa: %v", err)
	}
	if math.Abs(got.Kappa-(-1)) > kappaTol {
		t.Errorf("Kappa = %v, want -1", got.Kappa)
	}
}

// An empty double-labeled subset is an error — never NaN, never a silent 0.
func TestComputeKappaEmptySubsetErrors(t *testing.T) {
	cases := map[string][]Claim{
		"no claims at all": nil,
		"no double-labeled rows": {
			dl("clm-synth-e1", LabelGroundedCorrect, ""),
			dl("clm-synth-e2", "", LabelHallucinated),
			dl("clm-synth-e3", "", ""),
		},
	}
	for name, claims := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := ComputeKappa(claims)
			if err == nil {
				t.Fatal("ComputeKappa accepted an empty double-labeled subset, want error")
			}
		})
	}
}

// A label outside the frozen §7a categories in the double-labeled subset must
// fail loudly for either rater — the harness never guesses.
func TestComputeKappaRejectsUnknownLabel(t *testing.T) {
	t.Run("label_r1", func(t *testing.T) {
		_, err := ComputeKappa([]Claim{dl("clm-synth-b1", "plausible", LabelHallucinated)})
		if err == nil {
			t.Fatal("ComputeKappa accepted an unknown label_r1, want error")
		}
		if !strings.Contains(err.Error(), "clm-synth-b1") || !strings.Contains(err.Error(), "plausible") {
			t.Errorf("error should name the claim and the bad label, got: %v", err)
		}
	})
	t.Run("label_r2", func(t *testing.T) {
		_, err := ComputeKappa([]Claim{dl("clm-synth-b2", LabelHallucinated, "plausible")})
		if err == nil {
			t.Fatal("ComputeKappa accepted an unknown label_r2, want error")
		}
		if !strings.Contains(err.Error(), "clm-synth-b2") || !strings.Contains(err.Error(), "plausible") {
			t.Errorf("error should name the claim and the bad label, got: %v", err)
		}
	})
}

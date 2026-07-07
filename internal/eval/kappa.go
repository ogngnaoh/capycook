package eval

// This file implements the PREREG §6 inter-rater reliability spot-check:
// Cohen's κ plus the full confusion matrix (§7 requires the matrix reported
// alongside κ) over the double-labeled subset — rows where BOTH label_r1 and
// label_r2 are non-empty — over the five frozen §7a categories. κ is
// computed, never interpreted here: the §6/§8 bands (> 0.6 substantial,
// < 0.4 ambiguous rubric) are applied in the writeup, not by code.

import "fmt"

// KappaCategories fixes the confusion-matrix row/column order: the five
// frozen §7a categories, in rubric-table order.
var KappaCategories = [5]string{
	LabelGroundedCorrect,
	LabelGroundedMischaracterized,
	LabelCorrectlyUnverified,
	LabelHallucinated,
	LabelOpinionNonCheckable,
}

// KappaResult is Cohen's κ over the double-labeled subset with the explicit
// N and the full confusion matrix — never a bare coefficient.
type KappaResult struct {
	N        int       // double-labeled claims (both label_r1 and label_r2 set)
	Observed float64   // p_o: fraction of the subset where the raters agree
	Expected float64   // p_e: chance agreement from the per-rater marginals
	Kappa    float64   // (p_o − p_e) / (1 − p_e), degenerate cases below
	Matrix   [5][5]int // rows = label_r1, cols = label_r2, order = KappaCategories
}

func categoryIndex(label string) (int, bool) {
	for i, c := range KappaCategories {
		if c == label {
			return i, true
		}
	}
	return 0, false
}

// ComputeKappa folds claims into the confusion matrix and Cohen's κ.
// Rows that are not double-labeled are skipped (they belong to the
// single-rater flow, not this reliability check); a double-labeled row with
// a label outside the frozen categories is an error. Degenerate cases are
// explicit so κ is never NaN: perfect agreement → 1 (this covers p_e == 1,
// where the raw formula is 0/0 — p_e can only reach 1 when both raters put
// everything in one category, which is perfect agreement); observed
// agreement equal to chance → 0; an empty subset → error, because "no κ
// measurable" must never be mistaken for "κ = 0".
func ComputeKappa(claims []Claim) (KappaResult, error) {
	var res KappaResult
	for _, c := range claims {
		if c.LabelR1 == "" || c.LabelR2 == "" {
			continue
		}
		i, ok := categoryIndex(c.LabelR1)
		if !ok {
			return KappaResult{}, fmt.Errorf("eval: claim %s: unknown label_r1 %q (PREREG §7a categories are frozen)", c.ClaimID, c.LabelR1)
		}
		j, ok := categoryIndex(c.LabelR2)
		if !ok {
			return KappaResult{}, fmt.Errorf("eval: claim %s: unknown label_r2 %q (PREREG §7a categories are frozen)", c.ClaimID, c.LabelR2)
		}
		res.Matrix[i][j]++
		res.N++
	}
	if res.N == 0 {
		return KappaResult{}, fmt.Errorf("eval: kappa: empty double-labeled subset (no rows with both label_r1 and label_r2)")
	}

	agree := 0
	var rows, cols [5]int
	for i := range KappaCategories {
		agree += res.Matrix[i][i]
		for j := range KappaCategories {
			rows[i] += res.Matrix[i][j]
			cols[j] += res.Matrix[i][j]
		}
	}
	n := float64(res.N)
	res.Observed = float64(agree) / n
	for k := range KappaCategories {
		res.Expected += (float64(rows[k]) / n) * (float64(cols[k]) / n)
	}
	switch {
	case res.Observed == 1:
		res.Kappa = 1
	case res.Observed == res.Expected:
		res.Kappa = 0
	default:
		res.Kappa = (res.Observed - res.Expected) / (1 - res.Expected)
	}
	return res, nil
}

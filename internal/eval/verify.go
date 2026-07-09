package eval

import (
	"strings"

	"github.com/ogngnaoh/capycook/internal/llm"
)

// Package-doc addendum lives in doc.go (Task 16). VerifyTier1 is the
// Amendment-1 Tier-1 deterministic verifier: it labels a claim mechanically
// when — and only when — the label follows from re-derived ground truth
// (the evidence the arm supplied, rebuilt via the T1-pinned llm.BuildEvidence
// matrix). Anything it cannot decide returns "" and falls through to Tier 2.
//
// Rules (PREREG §9 Amendment 1):
//   - ""              -> correctly-unverified (null provenance renders [unverified])
//   - pairing:<name>  -> grounded-correct if <name> is among the supplied
//                        pairings; grounded-mischaracterized otherwise (the
//                        citation asserts evidence the arm never supplied)
//   - fdc:<id> / foodon:<id> -> anchor check only: supplied -> "" (content
//                        judgment is Tier 2); not supplied -> grounded-
//                        mischaracterized
//   - anything else   -> "" (unparseable; Tier 2)
func VerifyTier1(source string, ev llm.Evidence) string {
	switch {
	case source == "":
		return LabelCorrectlyUnverified
	case strings.HasPrefix(source, "pairing:"):
		name := strings.TrimPrefix(source, "pairing:")
		for _, p := range ev.Pairings {
			if p.Ingredient == name {
				return LabelGroundedCorrect
			}
		}
		return LabelGroundedMischaracterized
	case strings.HasPrefix(source, "fdc:"):
		id := strings.TrimPrefix(source, "fdc:")
		for _, r := range ev.Resolutions {
			if r.FDCID != nil && *r.FDCID == id {
				return "" // anchored; content judgment is Tier 2
			}
		}
		return LabelGroundedMischaracterized
	case strings.HasPrefix(source, "foodon:"):
		id := strings.TrimPrefix(source, "foodon:")
		for _, r := range ev.Resolutions {
			if r.FoodOnID != nil && *r.FoodOnID == id {
				return ""
			}
		}
		return LabelGroundedMischaracterized
	}
	return ""
}

// Tier1Summary is the per-arm Tier-1 coverage the CLI prints (Task 16):
// how many claims the Tier-1 verifier settled machine-side vs. how many fell
// through to Tier 2, plus a tally per label actually assigned.
type Tier1Summary struct {
	Labeled     int
	FellThrough int
	ByLabel     map[string]int
}

// Tier1Coverage folds a claim slice's label_tier1 values into a Tier1Summary:
// pure and computed only from each claim's already-machine-written label
// (never re-runs VerifyTier1 itself).
func Tier1Coverage(claims []Claim) Tier1Summary {
	s := Tier1Summary{ByLabel: map[string]int{}}
	for _, c := range claims {
		if c.LabelTier1 == "" {
			s.FellThrough++
			continue
		}
		s.Labeled++
		s.ByLabel[c.LabelTier1]++
	}
	return s
}

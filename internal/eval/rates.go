package eval

// This file implements PREREGISTRATION §7a EXACTLY: the three per-claim
// rates, per arm, over the checkable denominator (all categories except
// opinion / non-checkable). grounded-mischaracterized counts neither for nor
// against — it is its own visible bucket. Rates are scored on each claim's
// FINAL label (PREREG §9 Amendment 1): label_tier1 if the Tier-1 verifier has
// set it, else label_r1 (the primary rater) as fallback; label_r2 exists for
// the double-labeled κ subset.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Frozen §7a label categories (wire values; "opinion-non-checkable" encodes
// PREREG's "opinion / non-checkable").
const (
	LabelGroundedCorrect          = "grounded-correct"
	LabelGroundedMischaracterized = "grounded-mischaracterized"
	LabelCorrectlyUnverified      = "correctly-unverified"
	LabelHallucinated             = "hallucinated"
	LabelOpinionNonCheckable      = "opinion-non-checkable"
)

// Claim is one row of a labeled-claim file (plan 4.6 schema), stored as
// JSONL. An empty FinalLabel means not yet labeled: such rows are excluded
// from every rate and surfaced via ArmRates.Unlabeled — never guessed.
type Claim struct {
	ClaimID    string `json:"claim_id"`
	Arm        string `json:"arm"`
	Dish       string `json:"dish"`
	Text       string `json:"text"`
	Source     string `json:"source"`
	LabelTier1 string `json:"label_tier1"`
	LabelR1    string `json:"label_r1"`
	LabelR2    string `json:"label_r2"`
}

// FinalLabel is the rate-assembly rule PREREG §9 Amendment 1 registers: the
// machine-written label_tier1 wins when the Tier-1 verifier has set it,
// otherwise label_r1 (the human primary rater) is the fallback.
func (c Claim) FinalLabel() string {
	if c.LabelTier1 != "" {
		return c.LabelTier1
	}
	return c.LabelR1
}

// ReadClaims parses a JSONL labeled-claim stream: one Claim per line, blank
// lines skipped, any malformed line an error naming its line number.
func ReadClaims(r io.Reader) ([]Claim, error) {
	var claims []Claim
	sc := bufio.NewScanner(r)
	line := 0
	for sc.Scan() {
		line++
		text := strings.TrimSpace(sc.Text())
		if text == "" {
			continue
		}
		var c Claim
		if err := json.Unmarshal([]byte(text), &c); err != nil {
			return nil, fmt.Errorf("eval: claims line %d: %w", line, err)
		}
		claims = append(claims, c)
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("eval: read claims: %w", err)
	}
	return claims, nil
}

// ArmRates carries the three PREREG §7a rates for one arm with the explicit
// denominators §5 requires (rates are never reported bare).
type ArmRates struct {
	Arm       string
	Total     int            // claims seen for this arm
	Unlabeled int            // empty label_r1 — excluded from every rate, reported explicitly
	Excluded  int            // opinion / non-checkable — out of the checkable denominator
	Checkable int            // denominator = labeled claims minus Excluded
	Counts    map[string]int // per frozen category, over labeled claims

	Provenance          float64 // (grounded-correct + correctly-unverified) / checkable
	Mischaracterization float64 // grounded-mischaracterized / checkable — neither for nor against
	Hallucination       float64 // hallucinated / checkable
}

// ComputeRates folds labeled claims into the per-arm §7a rates, counting each
// claim by its FinalLabel() (PREREG §9 Amendment 1: label_tier1 where set,
// else label_r1). A final label value outside the frozen categories is an
// error — the harness never guesses what a labeler meant; an empty final
// label still counts as Unlabeled. With Checkable == 0 the rates stay 0; the
// explicit zero denominator carries the message.
func ComputeRates(claims []Claim) (map[string]ArmRates, error) {
	byArm := map[string]ArmRates{}
	for _, c := range claims {
		r := byArm[c.Arm]
		if r.Counts == nil {
			r.Arm = c.Arm
			r.Counts = map[string]int{}
		}
		r.Total++
		label := c.FinalLabel()
		switch label {
		case "":
			r.Unlabeled++
		case LabelOpinionNonCheckable:
			r.Counts[label]++
			r.Excluded++
		case LabelGroundedCorrect, LabelGroundedMischaracterized,
			LabelCorrectlyUnverified, LabelHallucinated:
			r.Counts[label]++
			r.Checkable++
		default:
			return nil, fmt.Errorf("eval: claim %s: unknown final label %q (PREREG §7a categories are frozen)", c.ClaimID, label)
		}
		byArm[c.Arm] = r
	}
	for arm, r := range byArm {
		if r.Checkable > 0 {
			n := float64(r.Checkable)
			r.Provenance = float64(r.Counts[LabelGroundedCorrect]+r.Counts[LabelCorrectlyUnverified]) / n
			r.Mischaracterization = float64(r.Counts[LabelGroundedMischaracterized]) / n
			r.Hallucination = float64(r.Counts[LabelHallucinated]) / n
		}
		byArm[arm] = r
	}
	return byArm, nil
}

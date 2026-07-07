package services

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// cookedTechniques are the technique enums that can satisfy a high-risk
// protein's minimum internal temperature (task 2.6 / SPEC §6). sous_vide,
// cure, ferment, can, infuse_oil, raw, and other deliberately do NOT satisfy —
// sous-vide and the preservation techniques carry their own anaerobic risk and
// are treated by the lexicon, not as ordinary cooks.
var cookedTechniques = map[string]bool{
	"saute": true, "roast": true, "boil": true, "simmer": true,
	"bake": true, "grill": true, "fry": true,
}

// tempRule is one row of data/safety/min_temps.csv.
type tempRule struct {
	class   string
	minC    float64 // the value compared against draft.Step.internal_temp_c
	minF    float64 // the source FSIS figure, for the reason text
	restMin int
}

// anaerobicRule is one row of data/safety/anaerobic_lexicon.csv.
type anaerobicRule struct {
	ruleID    string
	technique string   // the draft.Step.technique enum this rule fires on
	condition string   // always | on_pattern | missing_temp_control
	patterns  []string // lowercase substrings, for on_pattern
	reason    string
}

// DataSafetyGate is the real FSIS/CDC-cited safety gate (task 2.6). Detection
// is structured — it reads each step's technique enum and internal_temp_c, not
// recipe prose (the one exception is the low-acid-aromatic pattern the
// infuse_oil rule requires) — and fail-closed: an op list it cannot apply, or
// a high-risk protein with no sufficiently-hot cooking step, blocks. It
// composes the FoodOn allergen checker (task 2.4). The Phase-1 StubSafetyGate
// stays in place for other packages' tests; orchestrator wiring swaps to this
// in task 2.8.
type DataSafetyGate struct {
	minTemps map[string]tempRule // protein_class -> min-temp rule
	classOf  map[string]string   // normalized ingredient name -> protein_class
	rules    []anaerobicRule     // anaerobic lexicon, file order
	allergen *AllergenChecker
}

var _ SafetyGate = (*DataSafetyGate)(nil)

// NewSafetyGate loads the three committed safety tables (data/safety/) and
// binds the already-constructed allergen checker. It rejects a min-temp value
// that is not numeric and a protein class that lacks a min-temp rule — a
// malformed table is a data bug, not a runtime fallback.
func NewSafetyGate(minTempsPath, lexiconPath, proteinClassesPath string, allergen *AllergenChecker) (*DataSafetyGate, error) {
	if allergen == nil {
		return nil, fmt.Errorf("safety: nil allergen checker")
	}
	g := &DataSafetyGate{
		minTemps: make(map[string]tempRule),
		classOf:  make(map[string]string),
		allergen: allergen,
	}

	if err := forEachCSVRow(minTempsPath,
		[]string{"protein_class", "min_internal_temp_c", "rest_time_min"},
		func(row map[string]string) error {
			class := strings.TrimSpace(row["protein_class"])
			minC, err := strconv.ParseFloat(strings.TrimSpace(row["min_internal_temp_c"]), 64)
			if err != nil {
				return fmt.Errorf("bad min_internal_temp_c for %q: %w", class, err)
			}
			minF, err := strconv.ParseFloat(strings.TrimSpace(row["min_internal_temp_f"]), 64)
			if err != nil {
				return fmt.Errorf("bad min_internal_temp_f for %q: %w", class, err)
			}
			rest, err := strconv.Atoi(strings.TrimSpace(row["rest_time_min"]))
			if err != nil {
				return fmt.Errorf("bad rest_time_min for %q: %w", class, err)
			}
			g.minTemps[class] = tempRule{class: class, minC: minC, minF: minF, restMin: rest}
			return nil
		}); err != nil {
		return nil, fmt.Errorf("safety: load min temps: %w", err)
	}

	if err := forEachCSVRow(proteinClassesPath,
		[]string{"name", "protein_class"},
		func(row map[string]string) error {
			class := strings.TrimSpace(row["protein_class"])
			if class == "" || class == "none" {
				return nil // not subject to the cook-temp rule
			}
			if _, ok := g.minTemps[class]; !ok {
				return fmt.Errorf("ingredient %q maps to protein class %q with no min-temp rule", row["name"], class)
			}
			g.classOf[normalizeName(row["name"])] = class
			return nil
		}); err != nil {
		return nil, fmt.Errorf("safety: load protein classes: %w", err)
	}

	if err := forEachCSVRow(lexiconPath,
		[]string{"rule_id", "technique", "block_condition", "text_patterns", "reason", "citation"},
		func(row map[string]string) error {
			r := anaerobicRule{
				ruleID:    strings.TrimSpace(row["rule_id"]),
				technique: strings.TrimSpace(row["technique"]),
				condition: strings.TrimSpace(row["block_condition"]),
				reason:    strings.TrimSpace(row["reason"]),
			}
			switch r.condition {
			case "always", "on_pattern", "missing_temp_control":
			default:
				return fmt.Errorf("rule %q has unknown block_condition %q", r.ruleID, r.condition)
			}
			for _, p := range strings.Split(row["text_patterns"], ";") {
				if p = strings.ToLower(strings.TrimSpace(p)); p != "" {
					r.patterns = append(r.patterns, p)
				}
			}
			g.rules = append(g.rules, r)
			return nil
		}); err != nil {
		return nil, fmt.Errorf("safety: load anaerobic lexicon: %w", err)
	}

	return g, nil
}

// Screen judges the draft that results from applying ops to current. It is
// fail-closed at every stage: ops that do not apply block ("unable to evaluate
// proposal safety" — the deliberate inversion of the stub's fail-open); an
// anaerobic technique match blocks; a high-risk protein with no sufficiently
// hot cooking step blocks (missing temperature is itself the block reason);
// the composed allergen check's violations become block reasons.
func (g *DataSafetyGate) Screen(current draft.Draft, ops []proposal.Op) proposal.Safety {
	proposed, err := current.Apply(ops)
	if err != nil {
		return proposal.Safety{
			Status:  "blocked",
			Reasons: []string{"unable to evaluate proposal safety"},
			RuleIDs: []string{"screen-unevaluable"},
		}
	}

	var reasons, ruleIDs []string

	// (a) anaerobic-preservation technique rules, in step then file order.
	for _, s := range proposed.Steps {
		for _, r := range g.rules {
			if s.Technique == r.technique && g.anaerobicFires(r, s, proposed) {
				reasons = append(reasons, r.reason)
				ruleIDs = append(ruleIDs, r.ruleID)
			}
		}
	}

	// (b) high-risk protein minimum internal temperature (fail-closed on a
	// missing temperature). The check is draft-global: draft.Step carries no
	// structural link to an ingredient, so it asks whether ANY satisfying-cook
	// step reaches the class minimum (see data/safety/PROVENANCE.md).
	for _, in := range proposed.Ingredients {
		class, ok := g.classOf[normalizeName(in.Name)]
		if !ok {
			continue
		}
		rule := g.minTemps[class]
		if reachesTemp(proposed.Steps, rule.minC) {
			continue
		}
		reasons = append(reasons, cookTempReason(in.Name, rule))
		ruleIDs = append(ruleIDs, "min-temp-"+class)
	}

	// (c) allergen check (task 2.4) composed in.
	if a := g.allergen.Check(proposed); a.Status == "blocked" {
		reasons = append(reasons, a.Reasons...)
		ruleIDs = append(ruleIDs, a.RuleIDs...)
	}

	if len(reasons) == 0 {
		return pass()
	}
	return proposal.Safety{Status: "blocked", Reasons: reasons, RuleIDs: ruleIDs}
}

// anaerobicFires evaluates a rule's block_condition against a matching step.
func (g *DataSafetyGate) anaerobicFires(r anaerobicRule, s draft.Step, d draft.Draft) bool {
	switch r.condition {
	case "always":
		return true
	case "missing_temp_control":
		return s.InternalTempC == nil
	case "on_pattern":
		hay := strings.ToLower(s.Text)
		for _, in := range d.Ingredients {
			hay += " " + strings.ToLower(in.Name)
		}
		for _, p := range r.patterns {
			if strings.Contains(hay, p) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

// reachesTemp reports whether any satisfying-cook step states an internal
// temperature at or above minC.
func reachesTemp(steps []draft.Step, minC float64) bool {
	for _, s := range steps {
		if cookedTechniques[s.Technique] && s.InternalTempC != nil && *s.InternalTempC >= minC {
			return true
		}
	}
	return false
}

// cookTempReason cites the rule's FSIS-derived temperatures in the block text.
func cookTempReason(name string, r tempRule) string {
	rest := ""
	if r.restMin > 0 {
		rest = fmt.Sprintf(" plus a %d-minute rest", r.restMin)
	}
	return fmt.Sprintf(
		"%s (%s) requires a cooking step reaching %g C / %g F internal temperature%s (USDA FSIS); no step states a sufficient internal temperature",
		name, r.class, r.minC, r.minF, rest)
}

package services

import (
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// StubSafetyGate blocks exactly the seeded Phase-1 case — a step with
// technique infuse_oil whose text or draft ingredients involve garlic —
// and passes everything else. The real FSIS-cited rule set lands in
// phase 2 behind the same interface.
type StubSafetyGate struct{}

var _ SafetyGate = StubSafetyGate{}

// Screen applies ops to current and scans the resulting steps. Ops that do
// not apply cleanly pass: this stub only screens outcomes it can evaluate,
// and a broken op list fails upstream at draft.Apply anyway.
func (StubSafetyGate) Screen(current draft.Draft, ops []proposal.Op) proposal.Safety {
	proposed, err := current.Apply(ops)
	if err != nil {
		return pass()
	}
	garlicIngredient := false
	for _, ing := range proposed.Ingredients {
		if strings.Contains(strings.ToLower(ing.Name), "garlic") {
			garlicIngredient = true
			break
		}
	}
	for _, step := range proposed.Steps {
		if step.Technique != "infuse_oil" {
			continue
		}
		if garlicIngredient || strings.Contains(strings.ToLower(step.Text), "garlic") {
			return proposal.Safety{
				Status: "blocked",
				Reasons: []string{
					"room-temperature garlic-in-oil infusion supports Clostridium botulinum growth (anaerobic, low-acid); refrigerate and use promptly, or acidify per a tested recipe",
				},
				RuleIDs: []string{"anaerobic-garlic-oil"},
			}
		}
	}
	return pass()
}

// pass is the empty-handed verdict every non-seeded change receives.
func pass() proposal.Safety {
	return proposal.Safety{Status: "pass", Reasons: []string{}, RuleIDs: []string{}}
}

package llm

import (
	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/grounding"
)

// Arm wire names (spec §4 enums). The three eval arms are the grounding
// toggle; "none" is normal operator use.
const (
	ArmUngrounded  = "ungrounded"
	ArmFlavorgraph = "flavorgraph"
	ArmGrounded    = "grounded"
	ArmNone        = "none"
)

// BuildEvidence assembles the arm-dependent Evidence block per the spec §7
// component matrix. The toggle governs only what the model sees and cites —
// the safety gate and deterministic analysis stay on in every arm:
//
//	ungrounded  — empty: no pairings, no resolutions; grounding is never consulted
//	flavorgraph — FlavorGraph pairings only (top-10 over the draft's ingredient names)
//	grounded    — pairings plus per-ingredient USDA/FoodOn resolutions for the
//	              citation-grounding block: resolved entries only, deduplicated
//	              on the canonical entity
//
// Arm "none" is normal operator use: the toggle is an eval construct, so
// operators get the full grounded assembly and only the event stamp records
// "none" (spec §4 rule). Any unrecognized arm value falls through to the same
// full-system behavior.
func BuildEvidence(arm string, d draft.Draft, g grounding.Grounding) Evidence {
	if arm == ArmUngrounded {
		return Evidence{}
	}
	names := make([]string, len(d.Ingredients))
	for i, ing := range d.Ingredients {
		names[i] = ing.Name
	}
	ev := Evidence{Pairings: g.Suggest(names)}
	if arm == ArmFlavorgraph {
		return ev
	}
	seen := make(map[string]bool)
	for _, name := range names {
		r, ok := g.Resolve(name)
		if !ok || seen[r.Canonical] {
			continue
		}
		seen[r.Canonical] = true
		ev.Resolutions = append(ev.Resolutions, r)
	}
	return ev
}

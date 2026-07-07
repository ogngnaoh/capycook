// Package llm is the swappable model layer: the LLM interface, the DeepSeek
// implementation (structured extraction + streamed rationale), and the
// ungrounded-baseline path over the same interface (P0-6; SPEC §3). Phase 1
// ships the interface plus a deterministic templated stub; the real
// DeepSeek client lands in phase 3.
package llm

import (
	"context"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// Move-type wire names (spec §4 enums).
const (
	MoveTypeSeedExpand         = "seed_expand"
	MoveTypeFlavorDirection    = "flavor_direction"
	MoveTypeIngredientChange   = "ingredient_change"
	MoveTypeTechniqueStep      = "technique_step"
	MoveTypeIterateFeedback    = "iterate_feedback"
	MoveTypeScaleServings      = "scale_servings"
	MoveTypeUnitConvert        = "unit_convert"
	MoveTypeCostRecompute      = "cost_recompute"
	MoveTypeNutritionRecompute = "nutrition_recompute"
)

// ThreadTurn is one turn of the cook/model conversation, rebuilt from
// move_requested/gate_* events.
type ThreadTurn struct {
	Role string // cook|system
	Text string
}

// Evidence is the arm-dependent grounding block handed to the model
// (spec §7 matrix).
type Evidence struct {
	Pairings    []grounding.Pairing    // flavorgraph + grounded arms
	Resolutions []grounding.Resolution // grounded arm only
}

// MoveRequest is everything one generative move needs: the current draft,
// the move type, the optional steer, the replayed thread, and the evidence
// block.
type MoveRequest struct {
	Draft    draft.Draft
	MoveType string
	Steer    string
	Thread   []ThreadTurn // last 50, replayed from eventlog
	Evidence Evidence
}

// LLM is the swappable model edge (spec §4 single-call design): one call
// per move returns a full Proposal whose Change diff Go computes from the
// model's complete proposed Draft. Proposal.ID/MoveID and Safety are left
// zero — the orchestrator assigns ids and the safety gate fills Safety.
type LLM interface {
	GenerateMove(ctx context.Context, req MoveRequest) (proposal.Proposal, error)
}

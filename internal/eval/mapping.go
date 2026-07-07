package eval

// This file holds the frozen mapping tables the eval reports derive from,
// exported as data so cmd/eval and the T1 amendment entry can print them
// verbatim (spec §4: "mapping table lives beside the eval code").

import (
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
)

// PREREG's frozen five gate-verb categories (PREREGISTRATION §3 H2 / §5:
// accept / edit / regenerate / reject / redirect).
const (
	FrozenAccept     = "accept"
	FrozenEdit       = "edit"
	FrozenRegenerate = "regenerate"
	FrozenReject     = "reject"
	FrozenRedirect   = "redirect"
)

// Unknown is the bucket for events whose move type cannot be resolved from
// the log, and for move types outside the frozen taxonomy in the roll-up.
// Unresolvable observations are counted here — never dropped, never guessed.
const Unknown = "unknown"

// VerbMappingRow is one row of the spec §4 native → frozen-category mapping.
// Frozen names the frozen-five category the native event folds into; a row
// with Frozen == "" is an additional labeled row that stays under Label and
// is never folded into the five.
type VerbMappingRow struct {
	Native string // native event type (eventlog wire value)
	Label  string // report label for the row
	Frozen string // frozen-five category, or "" for an additional labeled row
}

// VerbMapping is the spec §4 verb → frozen-category mapping table. The
// native distribution is primary; the frozen five is a stated derivation
// (FrozenFiveRollup). cancel (move_cancelled) folds into reject;
// alternatives, take_over, blocked, and auto_advanced are additional labeled
// rows because PREREG froze only the five verbs.
var VerbMapping = []VerbMappingRow{
	{Native: eventlog.TypeGateAccept, Label: "accept", Frozen: FrozenAccept},
	{Native: eventlog.TypeGateEdit, Label: "edit", Frozen: FrozenEdit},
	{Native: eventlog.TypeGateRegenerate, Label: "regenerate", Frozen: FrozenRegenerate},
	{Native: eventlog.TypeMoveCancelled, Label: "cancel", Frozen: FrozenReject},
	{Native: eventlog.TypeGateRedirect, Label: "redirect", Frozen: FrozenRedirect},
	{Native: eventlog.TypeGateAlternatives, Label: "alternatives", Frozen: ""},
	{Native: eventlog.TypeGateTakeOver, Label: "take_over", Frozen: ""},
	{Native: eventlog.TypeProposalBlocked, Label: "blocked", Frozen: ""},
	{Native: eventlog.TypeMoveAutoAdvanced, Label: "auto_advanced", Frozen: ""},
}

// FrozenFiveRollup derives the PREREG frozen-five distribution from a native
// event-type count map: frozen-five rows fold into their category, additional
// labeled rows keep their own labels, and any native type outside the table
// passes through under its own name — nothing is ever silently dropped.
func FrozenFiveRollup(native map[string]int) map[string]int {
	out := make(map[string]int, len(native))
	for typ, n := range native {
		out[frozenKey(typ)] += n
	}
	return out
}

func frozenKey(native string) string {
	for _, row := range VerbMapping {
		if row.Native != native {
			continue
		}
		if row.Frozen != "" {
			return row.Frozen
		}
		return row.Label
	}
	return native
}

// Deterministic/creative roll-up categories (spec §4 move taxonomy).
const (
	RollupCreative      = "creative"
	RollupDeterministic = "deterministic"
)

// MoveRollup is the frozen move-type taxonomy (spec §4): five creative and
// four deterministic move types. H2 reports fine-grained move types plus
// this roll-up.
var MoveRollup = map[string]string{
	llm.MoveTypeSeedExpand:         RollupCreative,
	llm.MoveTypeFlavorDirection:    RollupCreative,
	llm.MoveTypeIngredientChange:   RollupCreative,
	llm.MoveTypeTechniqueStep:      RollupCreative,
	llm.MoveTypeIterateFeedback:    RollupCreative,
	llm.MoveTypeScaleServings:      RollupDeterministic,
	llm.MoveTypeUnitConvert:        RollupDeterministic,
	llm.MoveTypeCostRecompute:      RollupDeterministic,
	llm.MoveTypeNutritionRecompute: RollupDeterministic,
}

// RollupOf returns the deterministic/creative roll-up for moveType, or
// Unknown for anything outside the frozen taxonomy.
func RollupOf(moveType string) string {
	if r, ok := MoveRollup[moveType]; ok {
		return r
	}
	return Unknown
}

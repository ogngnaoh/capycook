package eval

import (
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
)

// The verb → frozen-category mapping is a frozen instrument (spec §4,
// recorded in the T1 amendment entry): this test pins the exact table so any
// change is a deliberate, visible diff — never an accidental one.
func TestVerbMappingIsTheFrozenSpecTable(t *testing.T) {
	want := []VerbMappingRow{
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
	if !reflect.DeepEqual(VerbMapping, want) {
		t.Fatalf("VerbMapping drifted from the spec §4 table:\n got %+v\nwant %+v", VerbMapping, want)
	}
}

func TestFrozenFiveRollup(t *testing.T) {
	// Hand-built native distribution (matches the replay fixture totals plus
	// one deliberately unmapped type):
	//   accept 2 → accept 2; edit 1 → edit 1; regenerate 1 → regenerate 1;
	//   move_cancelled 1 → reject 1; redirect 1 → redirect 1;
	//   alternatives 1, take_over 1, blocked 2, auto_advanced 1 stay as
	//   additional labeled rows (never folded into the five);
	//   "mystery_event" 3 passes through under its own name (never dropped).
	native := map[string]int{
		eventlog.TypeGateAccept:       2,
		eventlog.TypeGateEdit:         1,
		eventlog.TypeGateRegenerate:   1,
		eventlog.TypeMoveCancelled:    1,
		eventlog.TypeGateRedirect:     1,
		eventlog.TypeGateAlternatives: 1,
		eventlog.TypeGateTakeOver:     1,
		eventlog.TypeProposalBlocked:  2,
		eventlog.TypeMoveAutoAdvanced: 1,
		"mystery_event":               3,
	}
	want := map[string]int{
		FrozenAccept:     2,
		FrozenEdit:       1,
		FrozenRegenerate: 1,
		FrozenReject:     1,
		FrozenRedirect:   1,
		"alternatives":   1,
		"take_over":      1,
		"blocked":        2,
		"auto_advanced":  1,
		"mystery_event":  3,
	}
	got := FrozenFiveRollup(native)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("FrozenFiveRollup:\n got %v\nwant %v", got, want)
	}
}

// The move-type taxonomy is frozen in spec §4: five creative, four
// deterministic; anything else rolls up as Unknown.
func TestMoveRollupTaxonomy(t *testing.T) {
	want := map[string]string{
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
	if !reflect.DeepEqual(MoveRollup, want) {
		t.Fatalf("MoveRollup drifted from the spec §4 taxonomy:\n got %v\nwant %v", MoveRollup, want)
	}
	for moveType, rollup := range want {
		if got := RollupOf(moveType); got != rollup {
			t.Errorf("RollupOf(%s) = %s, want %s", moveType, got, rollup)
		}
	}
	if got := RollupOf("not_a_move_type"); got != Unknown {
		t.Errorf("RollupOf(not_a_move_type) = %s, want %s", got, Unknown)
	}
}

package eval

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
)

func loadFixtureEvents(t *testing.T) []eventlog.Event {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "events_gate_dynamics.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var events []eventlog.Event
	if err := json.Unmarshal(raw, &events); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}
	return events
}

// synthEvent builds a clearly-synthetic event for the focused fold tests.
func synthEvent(sessionID, eventType, runKind, payload string) eventlog.Event {
	return eventlog.Event{
		DishID:    "dish-synthetic-x",
		SessionID: sessionID,
		Type:      eventType,
		Payload:   json.RawMessage(payload),
		Arm:       "none",
		RunKind:   runKind,
	}
}

func assertDynamics(t *testing.T, name string, got *Dynamics, want Dynamics) {
	t.Helper()
	if got == nil {
		t.Fatalf("%s: missing Dynamics, want %+v", name, want)
	}
	if !reflect.DeepEqual(*got, want) {
		t.Errorf("%s:\n got %+v\nwant %+v", name, *got, want)
	}
}

// Hand-computed expectations from testdata/events_gate_dynamics.json.
//
// Operator events counted into the native distribution (9 gate-dynamics
// types; move_failed tracked separately):
//
//	sess-a: gate_accept(seed_expand), gate_regenerate(ingredient_change),
//	        gate_edit(ingredient_change), move_auto_advanced(nutrition_recompute),
//	        gate_alternatives(flavor_direction), gate_accept(flavor_direction)   = 6
//	sess-b: proposal_blocked(technique_step — resolved via move_requested index,
//	        payload has no move_type), gate_redirect(technique_step),
//	        gate_take_over(technique_step — resolved via proposal_ready index),
//	        move_cancelled(flavor_direction — resolved via index),
//	        proposal_blocked(unknown — ghost move id, unresolvable)              = 5
//
// N = 11. Sessions = 2 (sess-a, sess-b; sess-c produced only a move_failed
// and counts as no H2 session). move_failed = 1 (seed_expand, sess-c) — never
// in N. The dish-synthetic-3 run is run_kind=harness and fully excluded (its
// gate_accept must NOT appear anywhere).
func TestFoldGateDynamicsOnSyntheticLog(t *testing.T) {
	got := FoldGateDynamics(loadFixtureEvents(t))

	assertDynamics(t, "Total", got.Total, Dynamics{
		Counts: map[string]int{
			eventlog.TypeGateAccept:       2,
			eventlog.TypeGateEdit:         1,
			eventlog.TypeGateRegenerate:   1,
			eventlog.TypeGateAlternatives: 1,
			eventlog.TypeGateRedirect:     1,
			eventlog.TypeGateTakeOver:     1,
			eventlog.TypeMoveCancelled:    1,
			eventlog.TypeProposalBlocked:  2,
			eventlog.TypeMoveAutoAdvanced: 1,
		},
		N:          11,
		MoveFailed: 1,
	})
	if got.Sessions != 2 {
		t.Errorf("Sessions = %d, want 2", got.Sessions)
	}

	wantByMoveType := map[string]Dynamics{
		llm.MoveTypeSeedExpand: {
			Counts:     map[string]int{eventlog.TypeGateAccept: 1},
			N:          1,
			MoveFailed: 1, // the sess-c retry exhaustion — isolated from N
		},
		llm.MoveTypeIngredientChange: {
			Counts: map[string]int{
				eventlog.TypeGateRegenerate: 1,
				eventlog.TypeGateEdit:       1,
			},
			N: 2,
		},
		llm.MoveTypeFlavorDirection: {
			Counts: map[string]int{
				eventlog.TypeGateAlternatives: 1,
				eventlog.TypeGateAccept:       1,
				eventlog.TypeMoveCancelled:    1,
			},
			N: 3,
		},
		llm.MoveTypeTechniqueStep: {
			Counts: map[string]int{
				eventlog.TypeProposalBlocked: 1,
				eventlog.TypeGateRedirect:    1,
				eventlog.TypeGateTakeOver:    1,
			},
			N: 3,
		},
		llm.MoveTypeNutritionRecompute: {
			Counts: map[string]int{eventlog.TypeMoveAutoAdvanced: 1},
			N:      1,
		},
		Unknown: {
			Counts: map[string]int{eventlog.TypeProposalBlocked: 1},
			N:      1,
		},
	}
	if len(got.ByMoveType) != len(wantByMoveType) {
		t.Errorf("ByMoveType has %d categories %v, want %d", len(got.ByMoveType), keysOf(got.ByMoveType), len(wantByMoveType))
	}
	for moveType, want := range wantByMoveType {
		assertDynamics(t, "ByMoveType["+moveType+"]", got.ByMoveType[moveType], want)
	}

	// Roll-up: creative = seed_expand(1) + ingredient_change(2) +
	// flavor_direction(3) + technique_step(3) = 9; deterministic =
	// nutrition_recompute(1); unknown = ghost blocked(1).
	wantByRollup := map[string]Dynamics{
		RollupCreative: {
			Counts: map[string]int{
				eventlog.TypeGateAccept:       2,
				eventlog.TypeGateEdit:         1,
				eventlog.TypeGateRegenerate:   1,
				eventlog.TypeGateAlternatives: 1,
				eventlog.TypeGateRedirect:     1,
				eventlog.TypeGateTakeOver:     1,
				eventlog.TypeMoveCancelled:    1,
				eventlog.TypeProposalBlocked:  1,
			},
			N:          9,
			MoveFailed: 1,
		},
		RollupDeterministic: {
			Counts: map[string]int{eventlog.TypeMoveAutoAdvanced: 1},
			N:      1,
		},
		Unknown: {
			Counts: map[string]int{eventlog.TypeProposalBlocked: 1},
			N:      1,
		},
	}
	if len(got.ByRollup) != len(wantByRollup) {
		t.Errorf("ByRollup has %d categories %v, want %d", len(got.ByRollup), keysOf(got.ByRollup), len(wantByRollup))
	}
	for rollup, want := range wantByRollup {
		assertDynamics(t, "ByRollup["+rollup+"]", got.ByRollup[rollup], want)
	}

	// Frozen-five derivation of the fixture's native totals (the native
	// distribution stays primary; this is the stated roll-up): accept 2,
	// edit 1, regenerate 1, reject 1 (cancel), redirect 1, plus additional
	// labeled rows alternatives 1, take_over 1, blocked 2, auto_advanced 1.
	wantFrozen := map[string]int{
		FrozenAccept:     2,
		FrozenEdit:       1,
		FrozenRegenerate: 1,
		FrozenReject:     1,
		FrozenRedirect:   1,
		"alternatives":   1,
		"take_over":      1,
		"blocked":        2,
		"auto_advanced":  1,
	}
	if gotFrozen := FrozenFiveRollup(got.Total.Counts); !reflect.DeepEqual(gotFrozen, wantFrozen) {
		t.Errorf("FrozenFiveRollup(Total.Counts):\n got %v\nwant %v", gotFrozen, wantFrozen)
	}
}

// Only run_kind=operator events count toward H2 (spec §4): an identical
// harness gate decision must change nothing.
func TestFoldGateDynamicsFiltersHarnessEvents(t *testing.T) {
	events := []eventlog.Event{
		synthEvent("sess-synth-1", eventlog.TypeMoveRequested, RunKindOperator, `{"move_id":"mv-1","move_type":"seed_expand"}`),
		synthEvent("sess-synth-1", eventlog.TypeGateAccept, RunKindOperator, `{"verb":"accept","proposal_id":"p-1","move_id":"mv-1","move_type":"seed_expand"}`),
		synthEvent("sess-synth-2", eventlog.TypeMoveRequested, RunKindHarness, `{"move_id":"mv-2","move_type":"seed_expand"}`),
		synthEvent("sess-synth-2", eventlog.TypeGateAccept, RunKindHarness, `{"verb":"accept","proposal_id":"p-2","move_id":"mv-2","move_type":"seed_expand"}`),
	}
	got := FoldGateDynamics(events)
	if got.Total.N != 1 {
		t.Errorf("Total.N = %d, want 1 (harness gate_accept excluded)", got.Total.N)
	}
	if got.Sessions != 1 {
		t.Errorf("Sessions = %d, want 1 (harness session excluded)", got.Sessions)
	}
}

// move_failed is tracked separately and never enters a gate-dynamics
// denominator (spec §4): a failure-only log has N=0 and no H2 sessions.
func TestFoldGateDynamicsIsolatesMoveFailed(t *testing.T) {
	events := []eventlog.Event{
		synthEvent("sess-synth-1", eventlog.TypeMoveRequested, RunKindOperator, `{"move_id":"mv-1","move_type":"scale_servings"}`),
		synthEvent("sess-synth-1", eventlog.TypeMoveFailed, RunKindOperator, `{"move_id":"mv-1","reason":"SYNTHETIC failure"}`),
	}
	got := FoldGateDynamics(events)
	if got.Total.N != 0 {
		t.Errorf("Total.N = %d, want 0", got.Total.N)
	}
	if got.Total.MoveFailed != 1 {
		t.Errorf("Total.MoveFailed = %d, want 1", got.Total.MoveFailed)
	}
	if got.Sessions != 0 {
		t.Errorf("Sessions = %d, want 0 (a failure is not a gate decision)", got.Sessions)
	}
	d := got.ByMoveType[llm.MoveTypeScaleServings]
	if d == nil || d.MoveFailed != 1 || d.N != 0 {
		t.Errorf("ByMoveType[scale_servings] = %+v, want MoveFailed=1 N=0", d)
	}
	rd := got.ByRollup[RollupDeterministic]
	if rd == nil || rd.MoveFailed != 1 || rd.N != 0 {
		t.Errorf("ByRollup[deterministic] = %+v, want MoveFailed=1 N=0", rd)
	}
}

// Sessions = distinct session_id values across counted gate decisions —
// H2's frozen session unit ("N gate decisions across S sessions").
func TestFoldGateDynamicsCountsDistinctSessions(t *testing.T) {
	events := make([]eventlog.Event, 0, 6)
	for i, sess := range []string{"sess-synth-1", "sess-synth-2", "sess-synth-1"} {
		mv := fmt.Sprintf("mv-%d", i)
		events = append(events,
			synthEvent(sess, eventlog.TypeMoveRequested, RunKindOperator,
				`{"move_id":"`+mv+`","move_type":"seed_expand"}`),
			synthEvent(sess, eventlog.TypeGateAccept, RunKindOperator,
				`{"verb":"accept","proposal_id":"p-`+mv+`","move_id":"`+mv+`","move_type":"seed_expand"}`),
		)
	}
	got := FoldGateDynamics(events)
	if got.Total.N != 3 {
		t.Errorf("Total.N = %d, want 3", got.Total.N)
	}
	if got.Sessions != 2 {
		t.Errorf("Sessions = %d, want 2 distinct session ids", got.Sessions)
	}
}

func TestFoldGateDynamicsEmptyLog(t *testing.T) {
	got := FoldGateDynamics(nil)
	if got.Total == nil || got.Total.N != 0 || got.Total.MoveFailed != 0 {
		t.Errorf("Total = %+v, want initialized zero Dynamics", got.Total)
	}
	if got.Sessions != 0 {
		t.Errorf("Sessions = %d, want 0", got.Sessions)
	}
	if len(got.ByMoveType) != 0 || len(got.ByRollup) != 0 {
		t.Errorf("expected empty category maps, got ByMoveType=%v ByRollup=%v",
			keysOf(got.ByMoveType), keysOf(got.ByRollup))
	}
}

func keysOf(m map[string]*Dynamics) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

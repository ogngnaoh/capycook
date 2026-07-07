package orchestrator

import (
	"context"
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
)

// TestMoveEvidenceAndEventsFollowArm: the configured arm drives both the
// Evidence block handed to the model (llm.BuildEvidence, spec §7 matrix) and
// the arm stamp on every appended event; run_kind stays operator.
func TestMoveEvidenceAndEventsFollowArm(t *testing.T) {
	cases := []struct {
		arm             string
		wantPairings    bool
		wantResolutions bool
	}{
		{llm.ArmUngrounded, false, false},
		{llm.ArmFlavorgraph, true, false},
		{llm.ArmGrounded, true, true},
		{llm.ArmNone, true, true}, // operator arm: full grounded behavior
	}
	for _, tc := range cases {
		t.Run(tc.arm, func(t *testing.T) {
			e := newEnvArm(t, tc.arm)
			e.createDish(t, "d1", false)
			e.seedVersion(t, "d1", safeDraft())
			if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeIngredientChange, "something brighter"); err != nil {
				t.Fatalf("Move: %v", err)
			}
			e.waitOutcome(t, OutcomeReady)

			req := e.llm.request(t, 0)
			want := llm.BuildEvidence(tc.arm, safeDraft(), grounding.Stub{})
			if !reflect.DeepEqual(req.Evidence, want) {
				t.Errorf("Evidence = %+v, want BuildEvidence(%q, ...) = %+v", req.Evidence, tc.arm, want)
			}
			if got := len(req.Evidence.Pairings) > 0; got != tc.wantPairings {
				t.Errorf("pairings present = %v, want %v", got, tc.wantPairings)
			}
			if got := len(req.Evidence.Resolutions) > 0; got != tc.wantResolutions {
				t.Errorf("resolutions present = %v, want %v", got, tc.wantResolutions)
			}

			evs := e.events(t, "d1")
			if len(evs) == 0 {
				t.Fatal("no events appended")
			}
			for _, ev := range evs {
				if ev.Arm != tc.arm || ev.RunKind != "operator" {
					t.Errorf("event %s arm/run_kind = %q/%q, want %q/operator",
						ev.Type, ev.Arm, ev.RunKind, tc.arm)
				}
			}
		})
	}
}

// TestBlockedStillBlocksUnderUngrounded: the safety gate is ON in every arm
// (spec §7 matrix) — stripping grounding evidence must not strip the screen.
// The seeded garlic-oil case still blocks, the event carries the arm, and the
// model really saw no evidence.
func TestBlockedStillBlocksUnderUngrounded(t *testing.T) {
	e := newEnvArm(t, llm.ArmUngrounded)
	e.createDish(t, "d1", false)
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeIngredientChange, "infuse a garlic oil for drizzling")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeBlocked)
	if out.MoveID != moveID || out.RuleID != "anaerobic-garlic-oil" {
		t.Errorf("blocked outcome = %+v, want move %q rule anaerobic-garlic-oil", out, moveID)
	}
	if st := e.orch.Status("d1"); st.State != StateBlocked {
		t.Errorf("state = %q, want %q", st.State, StateBlocked)
	}
	if ev := lastOfType(t, e.events(t, "d1"), eventlog.TypeProposalBlocked); ev.Arm != llm.ArmUngrounded {
		t.Errorf("proposal_blocked arm = %q, want %q", ev.Arm, llm.ArmUngrounded)
	}
	req := e.llm.request(t, 0)
	if len(req.Evidence.Pairings) != 0 || len(req.Evidence.Resolutions) != 0 {
		t.Errorf("ungrounded move carried evidence: %+v", req.Evidence)
	}
}

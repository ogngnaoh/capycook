package orchestrator

// Post-cook iterate flow (task 5.3, spec §8 / P0-8): moves launched against
// an explicit base version — the version the cook actually cooked — instead
// of the trunk head.

import (
	"context"
	"errors"
	"testing"

	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
)

// cookedAndHead seeds two versions: the "cooked" one and a distinct trunk
// head past it, returning the cooked version's id.
func cookedAndHead(t *testing.T, e *env) string {
	t.Helper()
	cooked := e.seedVersion(t, "d1", safeDraft())
	head := safeDraft()
	head.Title = "Trunk Head Plate"
	e.seedVersion(t, "d1", head)
	return cooked
}

// TestMoveFromUsesBaseVersionDraft: generation input is the base version's
// draft, not the trunk head's, and move_requested records base_version.
func TestMoveFromUsesBaseVersionDraft(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	cooked := cookedAndHead(t, e)

	_, err := e.orch.MoveFrom(context.Background(), "d1", session,
		llm.MoveTypeIterateFeedback, "less oil next time", cooked)
	if err != nil {
		t.Fatalf("MoveFrom: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)

	req := e.llm.request(t, 0)
	if req.Draft.Title != "Roast Carrot Plate" {
		t.Errorf("generation input title = %q, want the cooked version's %q", req.Draft.Title, "Roast Carrot Plate")
	}
	if req.Steer != "less oil next time" {
		t.Errorf("generation steer = %q, want the feedback text", req.Steer)
	}
	pl := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeMoveRequested))
	if pl["base_version"] != cooked {
		t.Errorf("move_requested base_version = %v, want %q", pl["base_version"], cooked)
	}
}

// TestAcceptParentsToBaseVersion: accepting a post-cook proposal applies the
// ops against the cooked draft and creates a sibling branch off it — parent
// = baseVersion, not the trunk head — and the dish pointer advances to it.
func TestAcceptParentsToBaseVersion(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	cooked := cookedAndHead(t, e)

	if _, err := e.orch.MoveFrom(context.Background(), "d1", session,
		llm.MoveTypeIterateFeedback, "brighter finish", cooked); err != nil {
		t.Fatalf("MoveFrom: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("accept: %v", err)
	}

	v, err := e.st.GetVersion(context.Background(), res.NewVersionID)
	if err != nil {
		t.Fatalf("GetVersion: %v", err)
	}
	if v.ParentVersionID == nil || *v.ParentVersionID != cooked {
		t.Errorf("new version parent = %v, want the cooked base %q", v.ParentVersionID, cooked)
	}
	dish, err := e.st.GetDish(context.Background(), "d1")
	if err != nil {
		t.Fatalf("GetDish: %v", err)
	}
	if dish.CurrentVersionID == nil || *dish.CurrentVersionID != res.NewVersionID {
		t.Errorf("dish current version = %v, want %q", dish.CurrentVersionID, res.NewVersionID)
	}
	// The ops applied against the cooked draft: its title survives, the
	// stub's iterate_feedback lemon arrived.
	d := e.versionDraft(t, res.NewVersionID)
	if d.Title != "Roast Carrot Plate" {
		t.Errorf("accepted title = %q, want the cooked version's (ops applied to the wrong base?)", d.Title)
	}
	hasLemon := false
	for _, ing := range d.Ingredients {
		if ing.Name == "lemon" {
			hasLemon = true
		}
	}
	if !hasLemon {
		t.Errorf("accepted draft ingredients = %+v, want the stub's lemon addition", d.Ingredients)
	}
}

// TestRegenerateKeepsBaseVersion: re-sampling a post-cook move (here from
// the blocked state) still generates against the cooked draft.
func TestRegenerateKeepsBaseVersion(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	cooked := cookedAndHead(t, e)

	moveID, err := e.orch.MoveFrom(context.Background(), "d1", session,
		llm.MoveTypeIterateFeedback, "make me a garlic oil", cooked)
	if err != nil {
		t.Fatalf("MoveFrom: %v", err)
	}
	e.waitOutcome(t, OutcomeBlocked)
	if _, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: moveID, Verb: VerbRegenerate,
	}); err != nil {
		t.Fatalf("regenerate: %v", err)
	}
	e.waitOutcome(t, OutcomeBlocked) // same steer, blocked again
	req := e.llm.request(t, 1)
	if req.Draft.Title != "Roast Carrot Plate" {
		t.Errorf("regenerated input title = %q, want the cooked version's", req.Draft.Title)
	}
}

// TestMoveFromInvalidBaseVersion: unknown ids and other dishes' versions are
// rejected with ErrUnknownBaseVersion before any event lands.
func TestMoveFromInvalidBaseVersion(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	e.createDish(t, "d2", true)
	foreign := e.seedVersion(t, "d2", safeDraft())

	if _, err := e.orch.MoveFrom(context.Background(), "d1", session,
		llm.MoveTypeIterateFeedback, "x", "ver_ghost"); !errors.Is(err, ErrUnknownBaseVersion) {
		t.Errorf("unknown id err = %v, want ErrUnknownBaseVersion", err)
	}
	if _, err := e.orch.MoveFrom(context.Background(), "d1", session,
		llm.MoveTypeIterateFeedback, "x", foreign); !errors.Is(err, ErrUnknownBaseVersion) {
		t.Errorf("foreign version err = %v, want ErrUnknownBaseVersion", err)
	}
	if evs := e.events(t, "d1"); len(evs) != 0 {
		t.Errorf("events after rejected moves = %d, want 0", len(evs))
	}
}

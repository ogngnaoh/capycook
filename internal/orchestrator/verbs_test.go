package orchestrator

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// readyProposal drives one steered creative move to awaiting_gate and
// returns the pending proposal.
func readyProposal(t *testing.T, e *env, dishID, moveType, steer string) proposal.Proposal {
	t.Helper()
	if _, err := e.orch.Move(context.Background(), dishID, session, moveType, steer); err != nil {
		t.Fatalf("Move(%s): %v", moveType, err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if len(out.Proposals) != 1 {
		t.Fatalf("got %d proposals, want 1", len(out.Proposals))
	}
	return out.Proposals[0]
}

// garlicOilDraft appends the seeded unsafe garlic-in-oil case to d.
func garlicOilDraft(d draft.Draft) draft.Draft {
	d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"})
	d.Steps = append(d.Steps, draft.Step{
		Text:      "Submerge crushed garlic in olive oil and leave at room temperature.",
		Technique: "infuse_oil",
		Why:       "slow infusion",
	})
	return d
}

// --- accept ---

func TestAcceptCreatesVersionAndRecomputesAnalysis(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	if res.Verb != VerbAccept || res.ProposalID != p.ID || res.NewVersionID == "" {
		t.Fatalf("result = %+v", res)
	}
	dish, err := e.st.GetDish(context.Background(), "d1")
	if err != nil {
		t.Fatalf("GetDish: %v", err)
	}
	if dish.CurrentVersionID == nil || *dish.CurrentVersionID != res.NewVersionID {
		t.Errorf("dish current version = %v, want %q", dish.CurrentVersionID, res.NewVersionID)
	}
	v, err := e.st.GetVersion(context.Background(), res.NewVersionID)
	if err != nil {
		t.Fatalf("GetVersion: %v", err)
	}
	if v.ParentVersionID != nil {
		t.Errorf("first version parent = %v, want nil", v.ParentVersionID)
	}
	d := e.versionDraft(t, res.NewVersionID)
	if d.Title != "Charred Carrot Salad with Herb Yogurt" {
		t.Errorf("accepted title = %q, want the seed_expand template title", d.Title)
	}
	// Analysis is recomputed via the services stubs into the snapshot — this
	// in-accept recompute also satisfies the post-accept deterministic
	// auto-enqueue in v0.
	if d.Analysis.Nutrition.Calories != 420 || d.Analysis.Cost.TotalUSD != 12.4 {
		t.Errorf("snapshot analysis = %+v, want services-stub values (420 kcal, $12.4)", d.Analysis)
	}
	evs := e.events(t, "d1")
	pl := payloadMap(t, lastOfType(t, evs, eventlog.TypeGateAccept))
	if pl["proposal_id"] != p.ID || pl["new_version_id"] != res.NewVersionID || pl["autonomy_dial"] != true {
		t.Errorf("gate_accept payload = %v", pl)
	}
	if st := e.orch.Status("d1"); st.State != StateIdle || len(st.Pending) != 0 {
		t.Errorf("Status after accept = %+v, want idle", st)
	}
}

// TestGateIdempotentOnProposalID: any duplicate verb call for an
// already-resolved proposal id is a no-op returning the prior outcome — no
// event, no version, no error.
func TestGateIdempotentOnProposalID(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	first, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	versions, _ := e.st.ListVersions(context.Background(), "d1")
	eventsBefore := len(e.events(t, "d1"))

	dupAccept, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbAccept,
	})
	if err != nil || !reflect.DeepEqual(dupAccept, first) {
		t.Errorf("duplicate accept = %+v, %v; want the prior outcome %+v, nil", dupAccept, err, first)
	}
	// Even a different verb on the resolved id is a no-op returning the
	// prior outcome (double-clicked buttons must not double-fire).
	dupRegen, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbRegenerate,
	})
	if err != nil || !reflect.DeepEqual(dupRegen, first) {
		t.Errorf("regenerate on resolved id = %+v, %v; want the prior outcome, nil", dupRegen, err)
	}
	versionsAfter, _ := e.st.ListVersions(context.Background(), "d1")
	if len(versionsAfter) != len(versions) {
		t.Errorf("versions grew from %d to %d on duplicate verbs", len(versions), len(versionsAfter))
	}
	if got := len(e.events(t, "d1")); got != eventsBefore {
		t.Errorf("events grew from %d to %d on duplicate verbs", eventsBefore, got)
	}
}

func TestDoubleAcceptConcurrent(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	var wg sync.WaitGroup
	results := make([]GateResult, 2)
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = e.orch.Gate(context.Background(), GateRequest{
				DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbAccept,
			})
		}(i)
	}
	wg.Wait()
	if errs[0] != nil || errs[1] != nil {
		t.Fatalf("errors = %v, %v; want both nil", errs[0], errs[1])
	}
	if results[0].NewVersionID == "" || results[0].NewVersionID != results[1].NewVersionID {
		t.Errorf("results = %+v vs %+v, want the same version", results[0], results[1])
	}
	versions, _ := e.st.ListVersions(context.Background(), "d1")
	if len(versions) != 1 {
		t.Errorf("got %d versions, want exactly 1", len(versions))
	}
	if got := countType(e.eventTypes(t, "d1"), eventlog.TypeGateAccept); got != 1 {
		t.Errorf("gate_accept count = %d, want exactly 1", got)
	}
}

func TestGateUnknownOrStaleProposal(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	// idle: nothing pending at all.
	if _, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: "pr_ghost", Verb: VerbAccept}); !errors.Is(err, ErrUnknownProposal) {
		t.Errorf("accept while idle err = %v, want ErrUnknownProposal", err)
	}
	// awaiting_gate: wrong id.
	readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	if _, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: "pr_ghost", Verb: VerbAccept}); !errors.Is(err, ErrUnknownProposal) {
		t.Errorf("accept with wrong id err = %v, want ErrUnknownProposal", err)
	}
}

func TestGateUnknownVerb(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	if _, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: "reject"}); !errors.Is(err, ErrUnknownVerb) {
		t.Errorf("err = %v, want ErrUnknownVerb", err)
	}
}

// --- edit ---

func TestEditCleanAppliesAsEditedAccept(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	cur := emptyDraft()
	proposed, err := cur.Apply(p.Change)
	if err != nil {
		t.Fatalf("apply proposal: %v", err)
	}
	edited := proposed
	edited.Title = "My Retitled Salad"
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbEdit,
		EditOps: proposal.ComputeDiff(cur, edited),
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if res.Verb != VerbEdit || res.NewVersionID == "" || res.Overridden {
		t.Fatalf("result = %+v, want an un-overridden edit with a new version", res)
	}
	if got := e.versionDraft(t, res.NewVersionID).Title; got != "My Retitled Salad" {
		t.Errorf("edited title = %q, want the user's value", got)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeGateEdit) != 1 || countType(types, eventlog.TypeSafetyWarningOverridden) != 0 {
		t.Errorf("event types = %v, want one gate_edit and no override", types)
	}
	if st := e.orch.Status("d1"); st.State != StateIdle {
		t.Errorf("state = %q, want idle", st.State)
	}
}

func TestEditWarnRequiresConfirmOverride(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	cur := emptyDraft()
	proposed, err := cur.Apply(p.Change)
	if err != nil {
		t.Fatalf("apply proposal: %v", err)
	}
	editOps := proposal.ComputeDiff(cur, garlicOilDraft(proposed))

	// Without confirmOverride: rejected, nothing resolved, nothing appended.
	eventsBefore := len(e.events(t, "d1"))
	_, err = e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbEdit, EditOps: editOps,
	})
	if !errors.Is(err, ErrConfirmRequired) {
		t.Fatalf("edit without confirm err = %v, want ErrConfirmRequired", err)
	}
	if got := len(e.events(t, "d1")); got != eventsBefore {
		t.Errorf("events grew from %d to %d on rejected edit", eventsBefore, got)
	}
	if st := e.orch.Status("d1"); st.State != StateAwaitingGate || len(st.Pending) != 1 {
		t.Fatalf("Status = %+v, want the proposal still pending", st)
	}

	// With confirmOverride: override recorded, then the edited accept lands.
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbEdit,
		EditOps: editOps, ConfirmOverride: true,
	})
	if err != nil {
		t.Fatalf("edit with confirm: %v", err)
	}
	if !res.Overridden || res.NewVersionID == "" {
		t.Fatalf("result = %+v, want overridden with a new version", res)
	}
	types := e.eventTypes(t, "d1")
	iOverride := -1
	iEdit := -1
	for i, tt := range types {
		switch tt {
		case eventlog.TypeSafetyWarningOverridden:
			iOverride = i
		case eventlog.TypeGateEdit:
			iEdit = i
		}
	}
	if iOverride == -1 || iEdit == -1 || iOverride > iEdit {
		t.Errorf("event types = %v, want safety_warning_overridden before gate_edit", types)
	}
	pl := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeSafetyWarningOverridden))
	if pl["proposal_id"] != p.ID || pl["verb"] != VerbEdit {
		t.Errorf("override payload = %v", pl)
	}
	rules, _ := pl["rule_ids"].([]any)
	if len(rules) != 1 || rules[0] != "anaerobic-garlic-oil" {
		t.Errorf("override rule_ids = %v, want [anaerobic-garlic-oil]", pl["rule_ids"])
	}
	d := e.versionDraft(t, res.NewVersionID)
	if !strings.Contains(strings.ToLower(d.Ingredients[len(d.Ingredients)-1].Name), "garlic") {
		t.Errorf("edited draft missing the user's garlic ingredient: %+v", d.Ingredients)
	}
}

// --- regenerate ---

func TestRegenerateResamples(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeFlavorDirection, "make it smoky")
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbRegenerate,
	})
	if err != nil {
		t.Fatalf("regenerate: %v", err)
	}
	if res.NewMoveID == "" || res.NewMoveID == p.MoveID {
		t.Fatalf("result = %+v, want a fresh move id", res)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if out.MoveID != res.NewMoveID || out.Proposals[0].ID == p.ID {
		t.Errorf("regenerated outcome = %+v, want a fresh proposal under move %q", out, res.NewMoveID)
	}
	// Pure re-sample: same move type, same steer, no rejection memory.
	req := e.llm.request(t, 1)
	if req.MoveType != llm.MoveTypeFlavorDirection || req.Steer != "make it smoky" {
		t.Errorf("regenerated request = %s %q, want the original move type and steer", req.MoveType, req.Steer)
	}
	if got := countType(e.eventTypes(t, "d1"), eventlog.TypeGateRegenerate); got != 1 {
		t.Errorf("gate_regenerate count = %d, want 1", got)
	}
	// A double-clicked regenerate must not be two paid calls.
	dup, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbRegenerate,
	})
	if err != nil || dup.NewMoveID != res.NewMoveID {
		t.Errorf("duplicate regenerate = %+v, %v; want the prior outcome", dup, err)
	}
	if e.llm.calls() != 2 {
		t.Errorf("llm calls = %d, want 2 (duplicate must not re-sample)", e.llm.calls())
	}
	if got := countType(e.eventTypes(t, "d1"), eventlog.TypeGateRegenerate); got != 1 {
		t.Errorf("gate_regenerate count after duplicate = %d, want 1", got)
	}
}

// --- alternatives ---

func TestAlternativesTwoCardsSiblingAccept(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	v1 := e.seedVersion(t, "d1", safeDraft())
	p := readyProposal(t, e, "d1", llm.MoveTypeIngredientChange, "")
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbAlternatives,
	})
	if err != nil {
		t.Fatalf("alternatives: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if len(out.Proposals) != 2 {
		t.Fatalf("got %d proposals, want 2 alternative cards", len(out.Proposals))
	}
	if out.Proposals[0].ID == out.Proposals[1].ID {
		t.Error("alternative cards share an id")
	}
	for _, alt := range out.Proposals {
		if alt.MoveID != res.NewMoveID {
			t.Errorf("alternative MoveID = %q, want %q", alt.MoveID, res.NewMoveID)
		}
	}
	if st := e.orch.Status("d1"); len(st.Pending) != 2 {
		t.Fatalf("pending = %d cards, want 2", len(st.Pending))
	}
	if got := countType(e.eventTypes(t, "d1"), eventlog.TypeProposalReady); got != 3 { // 1 original + 2 alternatives
		t.Errorf("proposal_ready count = %d, want 3", got)
	}

	// Accepting one creates a SIBLING version: parent is the version that
	// was current when the alternatives were generated.
	chosen := out.Proposals[1]
	acceptRes, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: chosen.ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("accept alternative: %v", err)
	}
	v, err := e.st.GetVersion(context.Background(), acceptRes.NewVersionID)
	if err != nil {
		t.Fatalf("GetVersion: %v", err)
	}
	if v.ParentVersionID == nil || *v.ParentVersionID != v1 {
		t.Errorf("accepted alternative parent = %v, want %q", v.ParentVersionID, v1)
	}
	// The un-chosen card went stale with the gate resolution.
	if _, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept,
	}); !errors.Is(err, ErrUnknownProposal) {
		t.Errorf("accept of discarded sibling err = %v, want ErrUnknownProposal", err)
	}
}

func TestAlternativesRejectedForDeterministicMove(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", false) // dial off so the deterministic move pends
	e.seedVersion(t, "d1", safeDraft())
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeCostRecompute, ""); err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if _, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAlternatives,
	}); !errors.Is(err, ErrVerbNotAllowed) {
		t.Errorf("alternatives on deterministic proposal err = %v, want ErrVerbNotAllowed", err)
	}
}

// --- redirect ---

func TestRedirectFromAwaitingGate(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeFlavorDirection, "go smoky")
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbRedirect, Steer: "no — go bright and acidic",
	})
	if err != nil {
		t.Fatalf("redirect: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if out.MoveID != res.NewMoveID {
		t.Errorf("outcome move = %q, want %q", out.MoveID, res.NewMoveID)
	}
	if req := e.llm.request(t, 1); req.Steer != "no — go bright and acidic" {
		t.Errorf("redirected Steer = %q", req.Steer)
	}
	pl := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeGateRedirect))
	if pl["steer"] != "no — go bright and acidic" || pl["proposal_id"] != p.ID {
		t.Errorf("gate_redirect payload = %v", pl)
	}
	// The old card is gone; the fresh proposal pends.
	st := e.orch.Status("d1")
	if len(st.Pending) != 1 || st.Pending[0].ID == p.ID {
		t.Errorf("pending = %+v, want only the fresh proposal", st.Pending)
	}
}

func TestRedirectRequiresSteer(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeFlavorDirection, "go smoky")
	if _, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbRedirect,
	}); err == nil {
		t.Fatal("redirect without steer succeeded, want an error")
	}
}

// TestRedirectCancelsInFlightMove: redirect during proposing cancels the
// in-flight generation and re-runs with the fresh steer.
func TestRedirectCancelsInFlightMove(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	started := make(chan struct{})
	firstCancelled := make(chan error, 1)
	call := 0
	e.llm.setFn(func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
		e.llm.mu.Lock()
		call++
		n := call
		e.llm.mu.Unlock()
		if n == 1 {
			close(started)
			<-ctx.Done()
			firstCancelled <- ctx.Err()
			return proposal.Proposal{}, ctx.Err()
		}
		return llm.Stub{}.GenerateMove(ctx, req)
	})
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeFlavorDirection, "original direction")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	<-started
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: moveID, Verb: VerbRedirect, Steer: "new direction",
	})
	if err != nil {
		t.Fatalf("redirect during proposing: %v", err)
	}
	if cErr := <-firstCancelled; !errors.Is(cErr, context.Canceled) {
		t.Errorf("first generation ctx err = %v, want context.Canceled", cErr)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if out.MoveID != res.NewMoveID {
		t.Errorf("outcome move = %q, want %q", out.MoveID, res.NewMoveID)
	}
	if req := e.llm.request(t, 1); req.Steer != "new direction" {
		t.Errorf("second request steer = %q, want the redirect steer", req.Steer)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeGateRedirect) != 1 || countType(types, eventlog.TypeProposalReady) != 1 {
		t.Errorf("event types = %v, want one gate_redirect and one proposal_ready", types)
	}
}

// --- take_over ---

func TestTakeOverAppliesUserDraft(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	user := safeDraft()
	user.Title = "Hand-Written Carrot Plate"
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbTakeOver, Draft: &user,
	})
	if err != nil {
		t.Fatalf("take_over: %v", err)
	}
	if res.Verb != VerbTakeOver || res.NewVersionID == "" || res.Overridden {
		t.Fatalf("result = %+v", res)
	}
	d := e.versionDraft(t, res.NewVersionID)
	if d.Title != "Hand-Written Carrot Plate" || len(d.Ingredients) != len(user.Ingredients) {
		t.Errorf("stored draft = %q with %d ingredients, want the user's draft", d.Title, len(d.Ingredients))
	}
	if d.Analysis.Nutrition.Calories != 420 {
		t.Errorf("take_over snapshot analysis calories = %v, want recomputed 420", d.Analysis.Nutrition.Calories)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeGateTakeOver) != 1 || countType(types, eventlog.TypeSafetyWarningOverridden) != 0 {
		t.Errorf("event types = %v, want one gate_take_over and no override", types)
	}
	if st := e.orch.Status("d1"); st.State != StateIdle {
		t.Errorf("state = %q, want idle", st.State)
	}
}

func TestTakeOverWarnRequiresConfirmOverride(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	user := garlicOilDraft(safeDraft())
	if _, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbTakeOver, Draft: &user,
	}); !errors.Is(err, ErrConfirmRequired) {
		t.Fatalf("take_over without confirm err = %v, want ErrConfirmRequired", err)
	}
	if st := e.orch.Status("d1"); st.State != StateAwaitingGate || len(st.Pending) != 1 {
		t.Fatalf("Status = %+v, want the proposal still pending", st)
	}
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbTakeOver,
		Draft: &user, ConfirmOverride: true,
	})
	if err != nil {
		t.Fatalf("take_over with confirm: %v", err)
	}
	if !res.Overridden || res.NewVersionID == "" {
		t.Fatalf("result = %+v, want overridden with a new version", res)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeSafetyWarningOverridden) != 1 || countType(types, eventlog.TypeGateTakeOver) != 1 {
		t.Errorf("event types = %v, want one override and one gate_take_over", types)
	}
	pl := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeSafetyWarningOverridden))
	if pl["verb"] != VerbTakeOver {
		t.Errorf("override payload verb = %v, want take_over", pl["verb"])
	}
}

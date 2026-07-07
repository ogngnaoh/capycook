package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/transport"
)

const session = "sess-httpapi"

// fakeLLM delegates to the deterministic llm.Stub unless a test swaps in a
// blocking fn (single-flight and cancel races).
type fakeLLM struct {
	mu sync.Mutex
	fn func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error)
}

func (f *fakeLLM) GenerateMove(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
	f.mu.Lock()
	fn := f.fn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return llm.Stub{}.GenerateMove(ctx, req)
}

func (f *fakeLLM) setFn(fn func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error)) {
	f.mu.Lock()
	f.fn = fn
	f.mu.Unlock()
}

type env struct {
	st  *store.SQLite
	log *eventlog.Log
	llm *fakeLLM
	hub *transport.Hub
	api *API
	h   http.Handler
}

func newEnv(t *testing.T) *env {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "httpapi.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	lg := eventlog.New(st)
	hub := transport.New(transport.Options{TokenCadence: time.Millisecond, Heartbeat: time.Hour})
	t.Cleanup(hub.Close)
	fl := &fakeLLM{}
	orch := orchestrator.New(orchestrator.Deps{
		Store:     st,
		Log:       lg,
		LLM:       fl,
		Safety:    services.StubSafetyGate{},
		Nutrition: services.StubNutrition{},
		Cost:      services.StubCost{},
		Grounding: grounding.Stub{},
		Notify:    hub.Notify,
	})
	api := New(st, lg, orch, hub)
	return &env{st: st, log: lg, llm: fl, hub: hub, api: api, h: api.Handler(nil)}
}

// do runs one request through the handler. A nil body sends no body, a
// string body is sent raw (invalid-JSON cases), anything else is
// JSON-marshaled. sess "" omits the X-Session-Id header.
func (e *env) do(method, path, sess string, body any) *httptest.ResponseRecorder {
	var rd *bytes.Reader
	switch b := body.(type) {
	case nil:
		rd = bytes.NewReader(nil)
	case string:
		rd = bytes.NewReader([]byte(b))
	default:
		raw, err := json.Marshal(body)
		if err != nil {
			panic(err)
		}
		rd = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, rd)
	if sess != "" {
		req.Header.Set("X-Session-Id", sess)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %T from %q: %v", v, rec.Body.String(), err)
	}
	return v
}

func testConstraints() draft.Constraints {
	return draft.Constraints{
		Dietary: []string{}, Allergens: []string{}, Equipment: []string{},
		Skill: "beginner", Servings: 2, OnHand: []string{}, Cuisine: "western",
	}
}

func (e *env) createDish(t *testing.T) string {
	t.Helper()
	rec := e.do("POST", "/api/dishes", session, createDishRequest{Seed: "charred carrots", Constraints: testConstraints()})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create dish: status %d, body %s", rec.Code, rec.Body.String())
	}
	return decode[dishDetail](t, rec).ID
}

// waitFor polls GET /api/dishes/{id} until cond holds (async moves land via
// the orchestrator's goroutine).
func (e *env) waitFor(t *testing.T, dishID string, cond func(dishDetail) bool) dishDetail {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var det dishDetail
	for {
		rec := e.do("GET", "/api/dishes/"+dishID, "", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET dish: status %d, body %s", rec.Code, rec.Body.String())
		}
		det = decode[dishDetail](t, rec)
		if cond(det) {
			return det
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for condition; last detail %+v", det)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// toGate runs one creative move to awaiting_gate and returns (moveID, the
// pending proposal).
func (e *env) toGate(t *testing.T, dishID, moveType, steer string) (string, proposal.Proposal) {
	t.Helper()
	rec := e.do("POST", "/api/dishes/"+dishID+"/move", session, moveRequest{MoveType: moveType, Steer: steer})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("move: status %d, body %s", rec.Code, rec.Body.String())
	}
	mv := decode[moveResponse](t, rec)
	if mv.MoveID == "" {
		t.Fatal("move response has no moveId")
	}
	det := e.waitFor(t, dishID, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })
	if det.PendingProposal == nil {
		t.Fatalf("awaiting_gate without pendingProposal: %+v", det)
	}
	return mv.MoveID, *det.PendingProposal
}

func (e *env) accept(t *testing.T, dishID, proposalID string) gateResponse {
	t.Helper()
	rec := e.do("POST", "/api/dishes/"+dishID+"/gate", session, gateRequest{ProposalID: proposalID, Verb: orchestrator.VerbAccept})
	if rec.Code != http.StatusOK {
		t.Fatalf("gate accept: status %d, body %s", rec.Code, rec.Body.String())
	}
	return decode[gateResponse](t, rec)
}

func (e *env) events(t *testing.T, dishID string) []eventlog.Event {
	t.Helper()
	evs, err := e.log.Replay(context.Background(), dishID)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	return evs
}

func countType(evs []eventlog.Event, typ string) int {
	n := 0
	for _, e := range evs {
		if e.Type == typ {
			n++
		}
	}
	return n
}

// --- tests ---

func TestHealthz(t *testing.T) {
	e := newEnv(t)
	rec := e.do("GET", "/healthz", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"status":"ok"}` {
		t.Fatalf("body = %q, want {\"status\":\"ok\"}", got)
	}
}

func TestSPAFallthrough(t *testing.T) {
	e := newEnv(t)
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("spa-home"))
	})
	h := e.api.Handler(spa)

	req := httptest.NewRequest("GET", "/dishes/some-client-route", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Body.String() != "spa-home" {
		t.Fatalf("SPA fallback body = %q, want spa-home", rec.Body.String())
	}

	req = httptest.NewRequest("GET", "/healthz", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"ok"`) {
		t.Fatalf("API route did not win over SPA: %q", rec.Body.String())
	}
}

func TestCreateDish(t *testing.T) {
	e := newEnv(t)
	rec := e.do("POST", "/api/dishes", session, createDishRequest{Seed: "charred carrots", Constraints: testConstraints()})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body %s)", rec.Code, rec.Body.String())
	}
	det := decode[dishDetail](t, rec)
	if det.ID == "" {
		t.Fatal("no dish id in response")
	}
	if det.State != orchestrator.StateIdle {
		t.Fatalf("state = %q, want idle", det.State)
	}
	if !det.AutonomyDial {
		t.Fatal("autonomy dial should default ON")
	}
	if det.Draft.Constraints.Servings != 2 {
		t.Fatalf("draft constraints not echoed: %+v", det.Draft.Constraints)
	}
	if det.PendingProposal != nil {
		t.Fatal("fresh dish must not have a pending proposal")
	}
	evs := e.events(t, det.ID)
	if len(evs) != 1 || evs[0].Type != eventlog.TypeDishCreated {
		t.Fatalf("events = %+v, want exactly one dish_created", evs)
	}
	if evs[0].SessionID != session {
		t.Fatalf("dish_created session = %q, want %q", evs[0].SessionID, session)
	}
	if !bytes.Contains(evs[0].Payload, []byte("charred carrots")) {
		t.Fatalf("dish_created payload missing seed: %s", evs[0].Payload)
	}
}

func TestCreateDishDialOff(t *testing.T) {
	e := newEnv(t)
	off := false
	rec := e.do("POST", "/api/dishes", session, createDishRequest{Seed: "x", Constraints: testConstraints(), AutonomyDial: &off})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rec.Code)
	}
	if det := decode[dishDetail](t, rec); det.AutonomyDial {
		t.Fatal("autonomy_dial:false ignored on create")
	}
}

func TestCreateDishValidation(t *testing.T) {
	e := newEnv(t)
	cases := []struct {
		name string
		sess string
		body any
	}{
		{"missing seed", session, createDishRequest{Constraints: testConstraints()}},
		{"missing session", "", createDishRequest{Seed: "x", Constraints: testConstraints()}},
		{"invalid json", session, `{`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := e.do("POST", "/api/dishes", tc.sess, tc.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestListDishes(t *testing.T) {
	e := newEnv(t)
	rec := e.do("GET", "/api/dishes", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Fatalf("empty index = %q, want []", got)
	}

	id := e.createDish(t)
	list := decode[[]dishSummary](t, e.do("GET", "/api/dishes", "", nil))
	if len(list) != 1 || list[0].ID != id {
		t.Fatalf("index = %+v, want the one dish", list)
	}
	if list[0].Title != "charred carrots" {
		t.Fatalf("title = %q, want seed fallback", list[0].Title)
	}
	if list[0].UpdatedAt.IsZero() {
		t.Fatal("updated_at is zero")
	}

	// After a first accepted version the index shows the draft title.
	_, prop := e.toGate(t, id, llm.MoveTypeSeedExpand, "")
	e.accept(t, id, prop.ID)
	list = decode[[]dishSummary](t, e.do("GET", "/api/dishes", "", nil))
	if list[0].Title != "Charred Carrot Salad with Herb Yogurt" {
		t.Fatalf("title = %q, want the accepted draft title", list[0].Title)
	}
}

func TestUnknownDishIs404(t *testing.T) {
	e := newEnv(t)
	cases := []struct{ method, path string }{
		{"GET", "/api/dishes/nope"},
		{"PATCH", "/api/dishes/nope"},
		{"POST", "/api/dishes/nope/move"},
		{"POST", "/api/dishes/nope/cancel"},
		{"POST", "/api/dishes/nope/gate"},
		{"GET", "/api/dishes/nope/versions"},
		{"POST", "/api/dishes/nope/promote"},
		{"GET", "/api/dishes/nope/stream"},
	}
	for _, tc := range cases {
		if rec := e.do(tc.method, tc.path, session, nil); rec.Code != http.StatusNotFound {
			t.Errorf("%s %s: status = %d, want 404", tc.method, tc.path, rec.Code)
		}
	}
}

func TestMutatingRoutesRequireSessionID(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	cases := []struct{ method, path string }{
		{"POST", "/api/dishes"},
		{"PATCH", "/api/dishes/" + id},
		{"POST", "/api/dishes/" + id + "/move"},
		{"POST", "/api/dishes/" + id + "/cancel"},
		{"POST", "/api/dishes/" + id + "/gate"},
		{"POST", "/api/dishes/" + id + "/promote"},
	}
	for _, tc := range cases {
		if rec := e.do(tc.method, tc.path, "", nil); rec.Code != http.StatusBadRequest {
			t.Errorf("%s %s without X-Session-Id: status = %d, want 400", tc.method, tc.path, rec.Code)
		}
	}
}

func TestMoveLifecycle(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	moveID, prop := e.toGate(t, id, llm.MoveTypeTechniqueStep, "more char")
	if prop.MoveID != moveID {
		t.Fatalf("pending proposal move_id = %q, want %q", prop.MoveID, moveID)
	}
	evs := e.events(t, id)
	if countType(evs, eventlog.TypeMoveRequested) != 1 || countType(evs, eventlog.TypeProposalReady) != 1 {
		t.Fatalf("events = %+v, want move_requested + proposal_ready", evs)
	}
}

func TestMoveValidation(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	rec := e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: "banana"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad move type: status = %d, want 400", rec.Code)
	}
}

func TestMoveDefaultMoveType(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)

	// No version yet: default move expands the seed.
	rec := e.do("POST", "/api/dishes/"+id+"/move", session, struct{}{})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("default move: status = %d, want 202 (body %s)", rec.Code, rec.Body.String())
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })
	if det.PendingProposal.MoveType != llm.MoveTypeSeedExpand {
		t.Fatalf("default move type = %q, want seed_expand", det.PendingProposal.MoveType)
	}
	e.accept(t, id, det.PendingProposal.ID)

	// With a version: default move iterates on feedback.
	rec = e.do("POST", "/api/dishes/"+id+"/move", session, struct{}{})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("default move: status = %d, want 202", rec.Code)
	}
	det = e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })
	if det.PendingProposal.MoveType != llm.MoveTypeIterateFeedback {
		t.Fatalf("default move type = %q, want iterate_feedback", det.PendingProposal.MoveType)
	}
}

func TestMoveSingleFlight409AndCancel(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	release := make(chan struct{})
	e.llm.setFn(func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
		select {
		case <-release:
			return llm.Stub{}.GenerateMove(ctx, req)
		case <-ctx.Done():
			return proposal.Proposal{}, ctx.Err()
		}
	})
	defer close(release)

	rec := e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeTechniqueStep})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("first move: status = %d, want 202", rec.Code)
	}
	rec = e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeTechniqueStep})
	if rec.Code != http.StatusConflict {
		t.Fatalf("second move while in flight: status = %d, want 409 (body %s)", rec.Code, rec.Body.String())
	}

	rec = e.do("POST", "/api/dishes/"+id+"/cancel", session, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel: status = %d, want 200", rec.Code)
	}
	if !decode[cancelResponse](t, rec).Cancelled {
		t.Fatal("cancel of an in-flight move reported cancelled=false")
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateIdle })
	if det.InFlightMoveID != "" {
		t.Fatalf("in-flight move id survived cancel: %+v", det)
	}
	if countType(e.events(t, id), eventlog.TypeMoveCancelled) != 1 {
		t.Fatal("no move_cancelled event after cancel")
	}

	// A pending proposal also blocks new moves with 409.
	e.llm.setFn(nil)
	_, _ = e.toGate(t, id, llm.MoveTypeTechniqueStep, "")
	rec = e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeTechniqueStep})
	if rec.Code != http.StatusConflict {
		t.Fatalf("move while awaiting gate: status = %d, want 409", rec.Code)
	}
}

func TestCancelIdleIsNoop(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	rec := e.do("POST", "/api/dishes/"+id+"/cancel", session, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel idle: status = %d, want 200", rec.Code)
	}
	if decode[cancelResponse](t, rec).Cancelled {
		t.Fatal("idle cancel reported cancelled=true")
	}
}

func TestGateAcceptAndIdempotency(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	_, prop := e.toGate(t, id, llm.MoveTypeSeedExpand, "")

	res := e.accept(t, id, prop.ID)
	if res.NewVersionID == "" {
		t.Fatal("accept produced no newVersionId")
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateIdle })
	if det.Draft.Title == "" {
		t.Fatal("accepted draft has no title")
	}
	if det.CurrentVersionID == nil || *det.CurrentVersionID != res.NewVersionID {
		t.Fatalf("currentVersionId = %v, want %q", det.CurrentVersionID, res.NewVersionID)
	}

	// Duplicate gate call — even with a different verb — is a no-op returning
	// the prior outcome: no second event, no second version.
	dup := e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{ProposalID: prop.ID, Verb: orchestrator.VerbRegenerate})
	if dup.Code != http.StatusOK {
		t.Fatalf("duplicate gate: status = %d, want 200 (body %s)", dup.Code, dup.Body.String())
	}
	prior := decode[gateResponse](t, dup)
	if prior.Verb != orchestrator.VerbAccept || prior.NewVersionID != res.NewVersionID {
		t.Fatalf("duplicate gate result = %+v, want the prior accept", prior)
	}
	evs := e.events(t, id)
	if countType(evs, eventlog.TypeGateAccept) != 1 {
		t.Fatalf("gate_accept count = %d, want 1", countType(evs, eventlog.TypeGateAccept))
	}
	vers := decode[versionsResponse](t, e.do("GET", "/api/dishes/"+id+"/versions", "", nil))
	if len(vers.Versions) != 1 {
		t.Fatalf("version count = %d, want 1", len(vers.Versions))
	}
}

func TestGateValidation(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	cases := []struct {
		name string
		body gateRequest
		want int
	}{
		{"unknown proposal", gateRequest{ProposalID: "nope", Verb: orchestrator.VerbAccept}, http.StatusNotFound},
		{"unknown verb", gateRequest{ProposalID: "x", Verb: "yolo"}, http.StatusBadRequest},
		{"missing proposalId", gateRequest{Verb: orchestrator.VerbAccept}, http.StatusBadRequest},
		{"redirect without steer", gateRequest{ProposalID: "x", Verb: orchestrator.VerbRedirect}, http.StatusBadRequest},
		{"edit without ops", gateRequest{ProposalID: "x", Verb: orchestrator.VerbEdit}, http.StatusBadRequest},
		{"take_over without draft", gateRequest{ProposalID: "x", Verb: orchestrator.VerbTakeOver}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := e.do("POST", "/api/dishes/"+id+"/gate", session, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestGateRedirectRespawns(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	_, prop := e.toGate(t, id, llm.MoveTypeFlavorDirection, "")

	rec := e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{
		ProposalID: prop.ID, Verb: orchestrator.VerbRedirect, Edit: &gateEdit{Steer: "brighter, more acid"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("redirect: status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	res := decode[gateResponse](t, rec)
	if res.NewMoveID == "" {
		t.Fatal("redirect produced no newMoveId")
	}
	det := e.waitFor(t, id, func(d dishDetail) bool {
		return d.State == orchestrator.StateAwaitingGate && d.PendingProposal != nil && d.PendingProposal.MoveID == res.NewMoveID
	})
	if det.PendingProposal.ID == prop.ID {
		t.Fatal("redirect did not replace the pending proposal")
	}
	if countType(e.events(t, id), eventlog.TypeGateRedirect) != 1 {
		t.Fatal("no gate_redirect event")
	}
}

func TestGateAlternativesPendsTwoCards(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	_, prop := e.toGate(t, id, llm.MoveTypeFlavorDirection, "")

	rec := e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{ProposalID: prop.ID, Verb: orchestrator.VerbAlternatives})
	if rec.Code != http.StatusOK {
		t.Fatalf("alternatives: status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return len(d.PendingProposals) == 2 })
	if det.PendingProposal == nil || det.PendingProposal.ID != det.PendingProposals[0].ID {
		t.Fatalf("pendingProposal should mirror the first card: %+v", det)
	}
	e.accept(t, id, det.PendingProposals[1].ID)
}

func TestGateEditWarnAndConfirm(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	_, prop := e.toGate(t, id, llm.MoveTypeTechniqueStep, "")

	garlic, err := json.Marshal([]draft.Ingredient{{Name: "garlic", Qty: 4, Unit: "clove"}})
	if err != nil {
		t.Fatal(err)
	}
	infuse, err := json.Marshal([]draft.Step{{
		Text: "Crush the garlic, submerge in olive oil, leave at room temperature.", Technique: "infuse_oil", Why: "slow infusion",
	}})
	if err != nil {
		t.Fatal(err)
	}
	ops := []proposal.Op{
		{Op: "replace", Path: "/ingredients", Value: garlic},
		{Op: "replace", Path: "/steps", Value: infuse},
	}

	// Human-authored unsafe edit without the override: 409, nothing recorded.
	rec := e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{
		ProposalID: prop.ID, Verb: orchestrator.VerbEdit, Edit: &gateEdit{Ops: ops},
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("unsafe edit without override: status = %d, want 409 (body %s)", rec.Code, rec.Body.String())
	}
	if n := countType(e.events(t, id), eventlog.TypeSafetyWarningOverridden); n != 0 {
		t.Fatalf("safety_warning_overridden count = %d, want 0 before confirm", n)
	}

	// With confirmOverride the edit lands and the override is recorded first.
	rec = e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{
		ProposalID: prop.ID, Verb: orchestrator.VerbEdit, Edit: &gateEdit{Ops: ops}, ConfirmOverride: true,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("confirmed edit: status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	res := decode[gateResponse](t, rec)
	if res.NewVersionID == "" || !res.Overridden {
		t.Fatalf("confirmed edit result = %+v, want newVersionId + overridden", res)
	}
	evs := e.events(t, id)
	if countType(evs, eventlog.TypeSafetyWarningOverridden) != 1 || countType(evs, eventlog.TypeGateEdit) != 1 {
		t.Fatalf("events = %+v, want one override + one gate_edit", evs)
	}
}

func TestBlockedFlow(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)

	rec := e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeTechniqueStep, Steer: "make garlic oil please"})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("move: status = %d, want 202", rec.Code)
	}
	mv := decode[moveResponse](t, rec)
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateBlocked })
	if det.PendingProposal != nil {
		t.Fatal("blocked dish must not expose a proposal")
	}
	if det.Blocked == nil || det.Blocked.RuleID != "anaerobic-garlic-oil" || det.Blocked.MoveID != mv.MoveID {
		t.Fatalf("blocked info = %+v, want the seeded rule on move %s", det.Blocked, mv.MoveID)
	}
	// The blocked change's ops re-sync so the workbench can gray the held move.
	if len(det.Blocked.Ops) == 0 {
		t.Fatal("blocked info must carry the blocked change ops")
	}

	// Only regenerate/redirect are allowed while blocked.
	rec = e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{ProposalID: mv.MoveID, Verb: orchestrator.VerbAccept})
	if rec.Code != http.StatusConflict {
		t.Fatalf("accept while blocked: status = %d, want 409", rec.Code)
	}

	// Redirect with fresh steer clears the block.
	rec = e.do("POST", "/api/dishes/"+id+"/gate", session, gateRequest{
		ProposalID: mv.MoveID, Verb: orchestrator.VerbRedirect, Edit: &gateEdit{Steer: "use vinegar instead"},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("redirect from blocked: status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })
}

func TestVersionsAndPromote(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	_, p1 := e.toGate(t, id, llm.MoveTypeTechniqueStep, "")
	v1 := e.accept(t, id, p1.ID).NewVersionID
	_, p2 := e.toGate(t, id, llm.MoveTypeFlavorDirection, "")
	v2 := e.accept(t, id, p2.ID).NewVersionID

	vers := decode[versionsResponse](t, e.do("GET", "/api/dishes/"+id+"/versions", "", nil))
	if len(vers.Versions) != 2 {
		t.Fatalf("version count = %d, want 2", len(vers.Versions))
	}
	if vers.Versions[0].ID != v1 || vers.Versions[1].ID != v2 {
		t.Fatalf("version order = %+v, want [%s %s]", vers.Versions, v1, v2)
	}
	if vers.Versions[1].ParentVersionID == nil || *vers.Versions[1].ParentVersionID != v1 {
		t.Fatalf("v2 parent = %v, want %s", vers.Versions[1].ParentVersionID, v1)
	}
	if vers.CurrentVersionID == nil || *vers.CurrentVersionID != v2 {
		t.Fatalf("currentVersionId = %v, want %s", vers.CurrentVersionID, v2)
	}

	// Promote reassigns the trunk pointer and appends branch_promoted.
	rec := e.do("POST", "/api/dishes/"+id+"/promote", session, promoteRequest{VersionID: v1})
	if rec.Code != http.StatusOK {
		t.Fatalf("promote: status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if res := decode[promoteResponse](t, rec); res.CurrentVersionID != v1 {
		t.Fatalf("promote response = %+v, want currentVersionId %s", res, v1)
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.CurrentVersionID != nil && *d.CurrentVersionID == v1 })
	if !reflect.DeepEqual(det.Draft, vers.Versions[0].Draft) {
		t.Fatalf("draft after promote = %+v, want the v1 snapshot %+v", det.Draft, vers.Versions[0].Draft)
	}
	evs := e.events(t, id)
	if countType(evs, eventlog.TypeBranchPromoted) != 1 {
		t.Fatal("no branch_promoted event")
	}

	// Unknown versions and other dishes' versions 404.
	if rec := e.do("POST", "/api/dishes/"+id+"/promote", session, promoteRequest{VersionID: "nope"}); rec.Code != http.StatusNotFound {
		t.Fatalf("promote unknown version: status = %d, want 404", rec.Code)
	}
	otherID := e.createDish(t)
	_, po := e.toGate(t, otherID, llm.MoveTypeTechniqueStep, "")
	vo := e.accept(t, otherID, po.ID).NewVersionID
	if rec := e.do("POST", "/api/dishes/"+id+"/promote", session, promoteRequest{VersionID: vo}); rec.Code != http.StatusNotFound {
		t.Fatalf("promote foreign version: status = %d, want 404", rec.Code)
	}
}

func TestDialToggle(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)

	// Dial ON (default): deterministic moves auto-advance into a version.
	rec := e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeScaleServings})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("deterministic move: status = %d, want 202 (body %s)", rec.Code, rec.Body.String())
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateIdle && d.CurrentVersionID != nil })
	if det.Draft.Constraints.Servings != 4 {
		t.Fatalf("servings = %d, want 4 after auto-advanced scale", det.Draft.Constraints.Servings)
	}
	if countType(e.events(t, id), eventlog.TypeMoveAutoAdvanced) != 1 {
		t.Fatal("no move_auto_advanced event with the dial ON")
	}

	// Flip the dial OFF: the same move now pends at the gate.
	off := false
	rec = e.do("PATCH", "/api/dishes/"+id, session, dialRequest{AutonomyDial: &off})
	if rec.Code != http.StatusOK {
		t.Fatalf("dial PATCH: status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if res := decode[dialResponse](t, rec); res.AutonomyDial {
		t.Fatal("dial PATCH did not report OFF")
	}
	det = e.waitFor(t, id, func(d dishDetail) bool { return !d.AutonomyDial })

	rec = e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeScaleServings})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("deterministic move dial OFF: status = %d, want 202", rec.Code)
	}
	det = e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })
	if det.PendingProposal == nil || det.PendingProposal.Confidence != 1.0 {
		t.Fatalf("pending deterministic proposal = %+v, want confidence 1.0", det.PendingProposal)
	}

	// The field is required.
	if rec := e.do("PATCH", "/api/dishes/"+id, session, struct{}{}); rec.Code != http.StatusBadRequest {
		t.Fatalf("PATCH without autonomy_dial: status = %d, want 400", rec.Code)
	}
}

func TestSessionIDStampedPerRequest(t *testing.T) {
	e := newEnv(t)
	rec := e.do("POST", "/api/dishes", "sess-A", createDishRequest{Seed: "x", Constraints: testConstraints()})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status = %d", rec.Code)
	}
	id := decode[dishDetail](t, rec).ID

	rec = e.do("POST", "/api/dishes/"+id+"/move", "sess-B", moveRequest{MoveType: llm.MoveTypeTechniqueStep})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("move: status = %d", rec.Code)
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })

	rec = e.do("POST", "/api/dishes/"+id+"/gate", "sess-C", gateRequest{ProposalID: det.PendingProposal.ID, Verb: orchestrator.VerbAccept})
	if rec.Code != http.StatusOK {
		t.Fatalf("gate: status = %d", rec.Code)
	}

	want := map[string]string{
		eventlog.TypeDishCreated:   "sess-A",
		eventlog.TypeMoveRequested: "sess-B",
		eventlog.TypeGateAccept:    "sess-C",
	}
	for _, ev := range e.events(t, id) {
		if sess, ok := want[ev.Type]; ok && ev.SessionID != sess {
			t.Errorf("%s session = %q, want %q", ev.Type, ev.SessionID, sess)
		}
	}
}

func TestStreamDeliversTokensThenProposalReady(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	srv := httptest.NewServer(e.h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/dishes/" + id + "/stream")
	if err != nil {
		t.Fatalf("GET stream: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("stream status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("stream content-type = %q", ct)
	}

	lines := make(chan string, 256)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	waitLine := func(want string) {
		t.Helper()
		deadline := time.After(5 * time.Second)
		for {
			select {
			case line, ok := <-lines:
				if !ok {
					t.Fatalf("stream closed before %q", want)
				}
				if line == want {
					return
				}
			case <-deadline:
				t.Fatalf("timed out waiting for line %q", want)
			}
		}
	}
	waitLine(": connected")

	rec := e.do("POST", "/api/dishes/"+id+"/move", session, moveRequest{MoveType: llm.MoveTypeTechniqueStep})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("move: status = %d, want 202", rec.Code)
	}

	// Rationale tokens stream first, then the full proposal.
	sawToken := false
	deadline := time.After(5 * time.Second)
	for {
		select {
		case line, ok := <-lines:
			if !ok {
				t.Fatal("stream closed before proposal-ready")
			}
			if line == "event: "+transport.EventToken {
				sawToken = true
			}
			if line == "event: "+transport.EventProposalReady {
				if !sawToken {
					t.Fatal("proposal-ready arrived before any token")
				}
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for proposal-ready on the stream")
		}
	}
}

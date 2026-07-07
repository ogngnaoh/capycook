package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/store"
)

// --- wire shapes (pinned keys verbatim; everything else camelCase) ---

// dishSummary is one row of GET /api/dishes (pinned keys: id, title,
// updated_at). Title falls back to the seed until a version exists;
// updated_at is the current version's creation time, else the dish's.
type dishSummary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}

// createDishRequest is POST /api/dishes. autonomy_dial (snake_case, like
// the constraints keys it sits beside) defaults to ON when absent (spec §4).
type createDishRequest struct {
	Seed         string            `json:"seed"`
	Constraints  draft.Constraints `json:"constraints"`
	AutonomyDial *bool             `json:"autonomy_dial"`
}

// dialRequest is PATCH /api/dishes/{id} — the header-toggle surface. The
// field is required; a PATCH without it is a 400.
type dialRequest struct {
	AutonomyDial *bool `json:"autonomy_dial"`
}

type dialResponse struct {
	ID           string `json:"id"`
	AutonomyDial bool   `json:"autonomyDial"`
}

// blockedInfo mirrors the proposal-blocked SSE payload so a GET re-sync
// reconstructs the blocked pane, including the held change's ops (ops only,
// never the discarded proposal) so the hold pane can gray the blocked move.
type blockedInfo struct {
	MoveID string        `json:"moveId"`
	Reason string        `json:"reason"`
	RuleID string        `json:"ruleId"`
	Ops    []proposal.Op `json:"ops"`
}

// dishDetail is GET /api/dishes/{id}: the pinned {draft, state,
// pendingProposal?} plus the re-sync context the workbench needs.
// pendingProposal is the first pending card; pendingProposals carries all
// of them (two after gate alternatives).
type dishDetail struct {
	ID               string              `json:"id"`
	Seed             string              `json:"seed"`
	AutonomyDial     bool                `json:"autonomyDial"`
	CurrentVersionID *string             `json:"currentVersionId"`
	CreatedAt        time.Time           `json:"createdAt"`
	State            string              `json:"state"`
	Draft            draft.Draft         `json:"draft"`
	PendingProposal  *proposal.Proposal  `json:"pendingProposal,omitempty"`
	PendingProposals []proposal.Proposal `json:"pendingProposals,omitempty"`
	InFlightMoveID   string              `json:"inFlightMoveId,omitempty"`
	Blocked          *blockedInfo        `json:"blocked,omitempty"`
}

// moveRequest is POST /move. baseVersion (additive, spec §8 post-cook flow)
// runs the move against that version's draft instead of the trunk head;
// accepting the proposal parents the new version to it.
type moveRequest struct {
	MoveType    string `json:"moveType"`
	Steer       string `json:"steer"`
	BaseVersion string `json:"baseVersion"`
}

type moveResponse struct {
	MoveID string `json:"moveId"`
}

type cancelResponse struct {
	Cancelled bool `json:"cancelled"`
}

// gateEdit carries the verb-specific payload under the pinned edit? key:
// ops for edit, draft for take_over, steer for redirect.
type gateEdit struct {
	Ops   []proposal.Op `json:"ops,omitempty"`
	Draft *draft.Draft  `json:"draft,omitempty"`
	Steer string        `json:"steer,omitempty"`
}

type gateRequest struct {
	ProposalID      string    `json:"proposalId"`
	Verb            string    `json:"verb"`
	Edit            *gateEdit `json:"edit,omitempty"`
	ConfirmOverride bool      `json:"confirmOverride"`
}

type gateResponse struct {
	Verb         string `json:"verb"`
	ProposalID   string `json:"proposalId"`
	NewVersionID string `json:"newVersionId,omitempty"`
	NewMoveID    string `json:"newMoveId,omitempty"`
	Overridden   bool   `json:"overridden,omitempty"`
}

type versionItem struct {
	ID              string      `json:"id"`
	ParentVersionID *string     `json:"parentVersionId"`
	CreatedAt       time.Time   `json:"createdAt"`
	Draft           draft.Draft `json:"draft"`
}

type versionsResponse struct {
	CurrentVersionID *string       `json:"currentVersionId"`
	Versions         []versionItem `json:"versions"`
}

type promoteRequest struct {
	VersionID string `json:"versionId"`
}

type promoteResponse struct {
	CurrentVersionID string `json:"currentVersionId"`
}

// Event payloads httpapi authors (snake_case, matching the orchestrator's).
type dishCreatedPayload struct {
	Seed         string            `json:"seed"`
	AutonomyDial bool              `json:"autonomy_dial"`
	Constraints  draft.Constraints `json:"constraints"`
}

type branchPromotedPayload struct {
	VersionID         string  `json:"version_id"`
	PreviousVersionID *string `json:"previous_version_id"`
}

// --- handlers ---

func (a *API) handleListDishes(w http.ResponseWriter, r *http.Request) {
	dishes, err := a.store.ListDishes(r.Context())
	if err != nil {
		internalError(w, "list dishes", err)
		return
	}
	out := make([]dishSummary, 0, len(dishes))
	for _, d := range dishes {
		s := dishSummary{ID: d.ID, Title: d.Seed, UpdatedAt: d.CreatedAt}
		if d.CurrentVersionID != nil {
			v, err := a.store.GetVersion(r.Context(), *d.CurrentVersionID)
			if err != nil {
				internalError(w, "load current version", err)
				return
			}
			s.UpdatedAt = v.CreatedAt
			var dd draft.Draft
			if err := json.Unmarshal([]byte(v.DraftJSON), &dd); err == nil && dd.Title != "" {
				s.Title = dd.Title
			}
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) handleCreateDish(w http.ResponseWriter, r *http.Request) {
	session, ok := a.session(w, r)
	if !ok {
		return
	}
	var req createDishRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Seed) == "" {
		writeError(w, http.StatusBadRequest, "seed is required")
		return
	}
	dial := true
	if req.AutonomyDial != nil {
		dial = *req.AutonomyDial
	}
	rawConstraints, err := json.Marshal(req.Constraints)
	if err != nil {
		internalError(w, "marshal constraints", err)
		return
	}
	d := store.Dish{ID: newID("dish"), Seed: req.Seed, ConstraintsJSON: string(rawConstraints), AutonomyDial: dial}
	if err := a.store.CreateDish(r.Context(), d); err != nil {
		internalError(w, "create dish", err)
		return
	}
	if err := a.appendEvent(r.Context(), d.ID, session, eventlog.TypeDishCreated,
		dishCreatedPayload{Seed: req.Seed, AutonomyDial: dial, Constraints: req.Constraints}); err != nil {
		internalError(w, "append dish_created", err)
		return
	}
	stored, err := a.store.GetDish(r.Context(), d.ID)
	if err != nil {
		internalError(w, "reload dish", err)
		return
	}
	det, err := a.detail(r.Context(), stored)
	if err != nil {
		internalError(w, "build dish detail", err)
		return
	}
	writeJSON(w, http.StatusCreated, det)
}

func (a *API) handleGetDish(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	det, err := a.detail(r.Context(), dish)
	if err != nil {
		internalError(w, "build dish detail", err)
		return
	}
	writeJSON(w, http.StatusOK, det)
}

func (a *API) handlePatchDish(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	if _, ok := a.session(w, r); !ok {
		return
	}
	var req dialRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.AutonomyDial == nil {
		writeError(w, http.StatusBadRequest, "autonomy_dial is required")
		return
	}
	dish.AutonomyDial = *req.AutonomyDial
	if err := a.store.UpdateDish(r.Context(), dish); err != nil {
		internalError(w, "update dish", err)
		return
	}
	writeJSON(w, http.StatusOK, dialResponse{ID: dish.ID, AutonomyDial: dish.AutonomyDial})
}

func (a *API) handleMove(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	session, ok := a.session(w, r)
	if !ok {
		return
	}
	var req moveRequest
	if !decodeBody(w, r, &req) {
		return
	}
	moveType := strings.TrimSpace(req.MoveType)
	if moveType == "" {
		// Default move: expand the seed while no version exists, iterate on
		// feedback after.
		moveType = llm.MoveTypeSeedExpand
		if dish.CurrentVersionID != nil {
			moveType = llm.MoveTypeIterateFeedback
		}
	}
	moveID, err := a.orch.MoveFrom(r.Context(), dish.ID, session, moveType, req.Steer, strings.TrimSpace(req.BaseVersion))
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, moveResponse{MoveID: moveID})
}

func (a *API) handleCancel(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	session, ok := a.session(w, r)
	if !ok {
		return
	}
	cancelled, err := a.orch.Cancel(r.Context(), dish.ID, session)
	if err != nil {
		// The in-memory transition already stands; only the event append
		// failed. Log and report the cancel.
		slog.Error("httpapi: cancel event append failed", "dish", dish.ID, "err", err)
	}
	// Also interrupt a rationale replay already streaming (the window after
	// the orchestrator committed the move and its own Cancel is a no-op).
	interrupted := a.hub.Cancel(dish.ID)
	writeJSON(w, http.StatusOK, cancelResponse{Cancelled: cancelled || interrupted})
}

func (a *API) handleGate(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	session, ok := a.session(w, r)
	if !ok {
		return
	}
	var req gateRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.ProposalID == "" {
		writeError(w, http.StatusBadRequest, "proposalId is required")
		return
	}
	greq := orchestrator.GateRequest{
		DishID:          dish.ID,
		SessionID:       session,
		ProposalID:      req.ProposalID,
		Verb:            req.Verb,
		ConfirmOverride: req.ConfirmOverride,
	}
	// Verb-specific payloads ride under edit; validate here so the
	// orchestrator's non-sentinel errors never surface as 500s.
	switch req.Verb {
	case orchestrator.VerbEdit:
		if req.Edit == nil || len(req.Edit.Ops) == 0 {
			writeError(w, http.StatusBadRequest, "edit requires edit.ops")
			return
		}
		greq.EditOps = req.Edit.Ops
	case orchestrator.VerbTakeOver:
		if req.Edit == nil || req.Edit.Draft == nil {
			writeError(w, http.StatusBadRequest, "take_over requires edit.draft")
			return
		}
		greq.Draft = req.Edit.Draft
	case orchestrator.VerbRedirect:
		if req.Edit == nil || strings.TrimSpace(req.Edit.Steer) == "" {
			writeError(w, http.StatusBadRequest, "redirect requires edit.steer")
			return
		}
		greq.Steer = req.Edit.Steer
	}
	res, err := a.orch.Gate(r.Context(), greq)
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, gateResponse{
		Verb:         res.Verb,
		ProposalID:   res.ProposalID,
		NewVersionID: res.NewVersionID,
		NewMoveID:    res.NewMoveID,
		Overridden:   res.Overridden,
	})
}

func (a *API) handleVersions(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	vers, err := a.store.ListVersions(r.Context(), dish.ID)
	if err != nil {
		internalError(w, "list versions", err)
		return
	}
	items := make([]versionItem, 0, len(vers))
	for _, v := range vers {
		var d draft.Draft
		if err := json.Unmarshal([]byte(v.DraftJSON), &d); err != nil {
			internalError(w, "parse version draft", err)
			return
		}
		items = append(items, versionItem{ID: v.ID, ParentVersionID: v.ParentVersionID, CreatedAt: v.CreatedAt, Draft: d})
	}
	writeJSON(w, http.StatusOK, versionsResponse{CurrentVersionID: dish.CurrentVersionID, Versions: items})
}

func (a *API) handlePromote(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	session, ok := a.session(w, r)
	if !ok {
		return
	}
	var req promoteRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.VersionID == "" {
		writeError(w, http.StatusBadRequest, "versionId is required")
		return
	}
	v, err := a.store.GetVersion(r.Context(), req.VersionID)
	if errors.Is(err, store.ErrNotFound) || (err == nil && v.DishID != dish.ID) {
		writeError(w, http.StatusNotFound, "unknown version for this dish")
		return
	}
	if err != nil {
		internalError(w, "load version", err)
		return
	}
	prev := dish.CurrentVersionID
	dish.CurrentVersionID = &req.VersionID
	if err := a.store.UpdateDish(r.Context(), dish); err != nil {
		internalError(w, "reassign current version", err)
		return
	}
	if err := a.appendEvent(r.Context(), dish.ID, session, eventlog.TypeBranchPromoted,
		branchPromotedPayload{VersionID: req.VersionID, PreviousVersionID: prev}); err != nil {
		internalError(w, "append branch_promoted", err)
		return
	}
	writeJSON(w, http.StatusOK, promoteResponse{CurrentVersionID: req.VersionID})
}

func (a *API) handleStream(w http.ResponseWriter, r *http.Request) {
	dish, ok := a.dish(w, r)
	if !ok {
		return
	}
	a.hub.ServeStream(w, r, dish.ID)
}

// --- view assembly ---

// detail assembles the dishDetail view: the stored dish, its current draft,
// and the orchestrator's in-memory gate status.
func (a *API) detail(ctx context.Context, dish store.Dish) (dishDetail, error) {
	cur, err := a.currentDraft(ctx, dish)
	if err != nil {
		return dishDetail{}, err
	}
	st := a.orch.Status(dish.ID)
	out := dishDetail{
		ID:               dish.ID,
		Seed:             dish.Seed,
		AutonomyDial:     dish.AutonomyDial,
		CurrentVersionID: dish.CurrentVersionID,
		CreatedAt:        dish.CreatedAt,
		State:            st.State,
		Draft:            cur,
		InFlightMoveID:   st.InFlightMoveID,
	}
	if len(st.Pending) > 0 {
		out.PendingProposal = &st.Pending[0]
		out.PendingProposals = st.Pending
	}
	if st.BlockedMoveID != "" {
		out.Blocked = &blockedInfo{MoveID: st.BlockedMoveID, Reason: st.BlockedReason, RuleID: st.BlockedRuleID, Ops: st.BlockedOps}
	}
	return out, nil
}

// currentDraft mirrors the orchestrator's resolution: the current version's
// snapshot, or — before any version exists — an empty draft carrying the
// dish's constraints.
func (a *API) currentDraft(ctx context.Context, dish store.Dish) (draft.Draft, error) {
	if dish.CurrentVersionID == nil {
		var d draft.Draft
		if dish.ConstraintsJSON != "" {
			if err := json.Unmarshal([]byte(dish.ConstraintsJSON), &d.Constraints); err != nil {
				return draft.Draft{}, fmt.Errorf("httpapi: parse dish constraints: %w", err)
			}
		}
		return d, nil
	}
	v, err := a.store.GetVersion(ctx, *dish.CurrentVersionID)
	if err != nil {
		return draft.Draft{}, fmt.Errorf("httpapi: load current version: %w", err)
	}
	var d draft.Draft
	if err := json.Unmarshal([]byte(v.DraftJSON), &d); err != nil {
		return draft.Draft{}, fmt.Errorf("httpapi: parse version draft: %w", err)
	}
	return d, nil
}

// --- plumbing ---

// session reads the client-minted X-Session-Id header every mutating
// request must carry (spec §4 session rule); missing means 400.
func (a *API) session(w http.ResponseWriter, r *http.Request) (string, bool) {
	s := strings.TrimSpace(r.Header.Get("X-Session-Id"))
	if s == "" {
		writeError(w, http.StatusBadRequest, "missing X-Session-Id header")
		return "", false
	}
	return s, true
}

// dish resolves the {id} path segment to a stored dish; unknown ids 404.
func (a *API) dish(w http.ResponseWriter, r *http.Request) (store.Dish, bool) {
	d, err := a.store.GetDish(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "unknown dish")
		return store.Dish{}, false
	}
	if err != nil {
		internalError(w, "load dish", err)
		return store.Dish{}, false
	}
	return d, true
}

// appendEvent appends one httpapi-authored event (dish_created,
// branch_promoted), stamped operator/none like the orchestrator's defaults.
func (a *API) appendEvent(ctx context.Context, dishID, sessionID, eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("httpapi: marshal %s payload: %w", eventType, err)
	}
	return a.log.Append(ctx, eventlog.Event{
		DishID: dishID, SessionID: sessionID, Type: eventType,
		Payload: raw, Arm: "none", RunKind: "operator",
	})
}

// decodeBody decodes r's JSON body into v; an empty body leaves v zero
// (moveType, steer, and the cancel body are all optional).
func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	err := json.NewDecoder(r.Body).Decode(v)
	if err == nil || errors.Is(err, io.EOF) {
		return true
	}
	writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
	return false
}

// writeDomainError maps orchestrator sentinels onto the pinned status
// codes: 409 for state conflicts (single-flight, awaiting gate, blocked-
// state verb rules, confirm-required), 404 for unknown ids, 400 for bad
// enums.
func writeDomainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, orchestrator.ErrInFlight),
		errors.Is(err, orchestrator.ErrAwaitingGate),
		errors.Is(err, orchestrator.ErrBlocked),
		errors.Is(err, orchestrator.ErrVerbNotAllowed),
		errors.Is(err, orchestrator.ErrConfirmRequired):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, orchestrator.ErrUnknownProposal),
		errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, orchestrator.ErrUnknownMoveType),
		errors.Is(err, orchestrator.ErrUnknownVerb),
		errors.Is(err, orchestrator.ErrUnknownBaseVersion):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		internalError(w, "domain call", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("httpapi: encode response", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func internalError(w http.ResponseWriter, op string, err error) {
	slog.Error("httpapi: "+op, "err", err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

func newID(prefix string) string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("httpapi: crypto/rand: %v", err)) // unreachable on supported platforms
	}
	return prefix + "_" + hex.EncodeToString(b[:])
}

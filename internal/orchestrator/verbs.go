package orchestrator

import (
	"context"
	"fmt"
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/store"
)

// Gate verb wire names (spec §4).
const (
	VerbAccept       = "accept"
	VerbEdit         = "edit"
	VerbRegenerate   = "regenerate"
	VerbAlternatives = "alternatives"
	VerbRedirect     = "redirect"
	VerbTakeOver     = "take_over"
)

// GateRequest is one gate verb call.
type GateRequest struct {
	DishID    string
	SessionID string
	// ProposalID is the gate target and the idempotency key: a pending
	// proposal id in awaiting_gate; the blocked move id in blocked
	// (regenerate/redirect only — proposal-blocked SSE carries the move
	// id); the in-flight move id in proposing (redirect only).
	ProposalID string
	Verb       string
	// EditOps is the user-modified change set (verb edit): the proposal's
	// ops with the user's values, still relative to the current draft.
	EditOps []proposal.Op
	// Draft is the user's directly edited draft (verb take_over); the diff
	// against the current version is synthesized via ComputeDiff.
	Draft *draft.Draft
	// Steer is the fresh steering text (verb redirect).
	Steer string
	// ConfirmOverride acknowledges a safety warning on edit/take_over
	// (human-authored writes warn-and-confirm rather than hard-block).
	ConfirmOverride bool
}

// GateResult is a resolved gate verb — also the memoized value returned for
// any duplicate call on the same ProposalID.
type GateResult struct {
	Verb         string
	ProposalID   string
	NewVersionID string // accept | edit | take_over
	NewMoveID    string // regenerate | alternatives | redirect
	Overridden   bool   // a safety warning was overridden (edit | take_over)
}

// Gate applies one verb to the dish's gate. Every verb is idempotent keyed
// on ProposalID: a duplicate call for an already-resolved id — even with a
// different verb — is a no-op returning the prior outcome (no event, no
// version, no error). Unknown or stale ids (never pending, or discarded
// without being resolved) return ErrUnknownProposal.
func (o *Orchestrator) Gate(ctx context.Context, req GateRequest) (GateResult, error) {
	switch req.Verb {
	case VerbAccept, VerbEdit, VerbRegenerate, VerbAlternatives, VerbRedirect, VerbTakeOver:
	default:
		return GateResult{}, fmt.Errorf("%w: %q", ErrUnknownVerb, req.Verb)
	}
	o.mu.Lock()
	ds := o.ds(req.DishID)
	if prior, ok := ds.resolved[req.ProposalID]; ok {
		o.mu.Unlock()
		return prior, nil
	}
	res, out, err := o.gateLocked(ctx, ds, req)
	o.mu.Unlock()
	if out != nil {
		o.emit(*out)
	}
	return res, err
}

// gateLocked is the verb × state switch. Caller holds mu.
func (o *Orchestrator) gateLocked(ctx context.Context, ds *dishState, req GateRequest) (GateResult, *Outcome, error) {
	switch ds.state {
	case StateAwaitingGate:
		pp, ok := ds.findPending(req.ProposalID)
		if !ok {
			return GateResult{}, nil, ErrUnknownProposal
		}
		switch req.Verb {
		case VerbAccept:
			return o.gateAccept(ctx, ds, req, pp)
		case VerbEdit:
			return o.gateEdit(ctx, ds, req, pp)
		case VerbTakeOver:
			return o.gateTakeOver(ctx, ds, req)
		case VerbRegenerate:
			// Pure re-sample: original move type and steer, no rejection
			// memory (R2 deferral).
			return o.respawn(ctx, ds, req, eventlog.TypeGateRegenerate, pp.moveType, pp.steer, pp.baseVersion, 1)
		case VerbRedirect:
			if strings.TrimSpace(req.Steer) == "" {
				return GateResult{}, nil, fmt.Errorf("orchestrator: redirect requires steer text")
			}
			return o.respawn(ctx, ds, req, eventlog.TypeGateRedirect, pp.moveType, req.Steer, pp.baseVersion, 1)
		case VerbAlternatives:
			if IsDeterministic(pp.moveType) {
				// Two samples of a deterministic computation are one card.
				return GateResult{}, nil, fmt.Errorf("%w: alternatives needs a creative move", ErrVerbNotAllowed)
			}
			return o.respawn(ctx, ds, req, eventlog.TypeGateAlternatives, pp.moveType, pp.steer, pp.baseVersion, 2)
		}

	case StateProposing:
		if ds.inflight == nil || ds.inflight.moveID != req.ProposalID {
			return GateResult{}, nil, ErrUnknownProposal
		}
		if req.Verb != VerbRedirect {
			return GateResult{}, nil, fmt.Errorf("%w: %s while a move is in flight", ErrVerbNotAllowed, req.Verb)
		}
		if strings.TrimSpace(req.Steer) == "" {
			return GateResult{}, nil, fmt.Errorf("orchestrator: redirect requires steer text")
		}
		// Redirect cancels the in-flight move and re-runs it with the fresh
		// steer; gate_redirect records the whole thing — no separate
		// move_cancelled event. Capture the move type before respawn detaches
		// the in-flight record.
		return o.respawn(ctx, ds, req, eventlog.TypeGateRedirect, ds.inflight.moveType, req.Steer, ds.inflight.baseVersion, 1)

	case StateBlocked:
		if ds.blocked == nil || ds.blocked.moveID != req.ProposalID {
			return GateResult{}, nil, ErrUnknownProposal
		}
		switch req.Verb {
		case VerbRegenerate:
			return o.respawn(ctx, ds, req, eventlog.TypeGateRegenerate, ds.blocked.moveType, ds.blocked.steer, ds.blocked.baseVersion, 1)
		case VerbRedirect:
			if strings.TrimSpace(req.Steer) == "" {
				return GateResult{}, nil, fmt.Errorf("orchestrator: redirect requires steer text")
			}
			return o.respawn(ctx, ds, req, eventlog.TypeGateRedirect, ds.blocked.moveType, req.Steer, ds.blocked.baseVersion, 1)
		default:
			return GateResult{}, nil, fmt.Errorf("%w: %s while blocked (regenerate or redirect only)", ErrVerbNotAllowed, req.Verb)
		}
	}
	// idle: nothing at the gate.
	return GateResult{}, nil, ErrUnknownProposal
}

// gateAccept applies the pending proposal's diff, recomputes analysis into
// the snapshot, appends the new version (parent = current, or the cooked
// base version for a post-cook move), advances the dish pointer, and
// records gate_accept.
func (o *Orchestrator) gateAccept(ctx context.Context, ds *dishState, req GateRequest, pp pendingProposal) (GateResult, *Outcome, error) {
	dish, err := o.store.GetDish(ctx, req.DishID)
	if err != nil {
		return GateResult{}, nil, fmt.Errorf("orchestrator: load dish %s: %w", req.DishID, err)
	}
	cur, err := o.moveBaseDraft(ctx, dish, pp.baseVersion)
	if err != nil {
		return GateResult{}, nil, err
	}
	applied, err := cur.Apply(pp.prop.Change)
	if err != nil {
		return GateResult{}, nil, fmt.Errorf("orchestrator: apply proposal: %w", err)
	}
	verID, err := o.commitVersion(ctx, dish, applied, pp.baseVersion, pp.prop.Rationale, store.VersionOriginAccepted)
	if err != nil {
		return GateResult{}, nil, err
	}
	if err := o.append(ctx, req.DishID, req.SessionID, eventlog.TypeGateAccept, gatePayload{
		Verb: VerbAccept, ProposalID: pp.prop.ID, MoveID: pp.prop.MoveID, MoveType: pp.moveType,
		NewVersionID: verID, AutonomyDial: dish.AutonomyDial, Rationale: pp.prop.Rationale,
	}); err != nil {
		return GateResult{}, nil, err
	}
	res := GateResult{Verb: VerbAccept, ProposalID: req.ProposalID, NewVersionID: verID}
	ds.resolveToIdle(req.ProposalID, res)
	return res, nil, nil
}

// gateEdit screens the user-modified ops (warn-and-confirm on a hit), then
// applies them as an edited accept.
func (o *Orchestrator) gateEdit(ctx context.Context, ds *dishState, req GateRequest, pp pendingProposal) (GateResult, *Outcome, error) {
	if len(req.EditOps) == 0 {
		return GateResult{}, nil, fmt.Errorf("orchestrator: edit requires the edited change set")
	}
	dish, err := o.store.GetDish(ctx, req.DishID)
	if err != nil {
		return GateResult{}, nil, fmt.Errorf("orchestrator: load dish %s: %w", req.DishID, err)
	}
	cur, err := o.moveBaseDraft(ctx, dish, pp.baseVersion)
	if err != nil {
		return GateResult{}, nil, err
	}
	// Same enrichment as generated proposals: resolved ids ride the ops so
	// the warn-and-confirm screen keys allergens on them.
	ops := o.enrichOps(cur, req.EditOps)
	overridden, err := o.screenHumanWrite(ctx, cur, ops, req)
	if err != nil {
		return GateResult{}, nil, err
	}
	applied, err := cur.Apply(ops)
	if err != nil {
		return GateResult{}, nil, fmt.Errorf("orchestrator: apply edited ops: %w", err)
	}
	verID, err := o.commitVersion(ctx, dish, applied, pp.baseVersion, pp.prop.Rationale, store.VersionOriginAccepted)
	if err != nil {
		return GateResult{}, nil, err
	}
	if err := o.append(ctx, req.DishID, req.SessionID, eventlog.TypeGateEdit, gatePayload{
		Verb: VerbEdit, ProposalID: pp.prop.ID, MoveID: pp.prop.MoveID, MoveType: pp.moveType,
		NewVersionID: verID, AutonomyDial: dish.AutonomyDial, Rationale: pp.prop.Rationale,
	}); err != nil {
		return GateResult{}, nil, err
	}
	res := GateResult{Verb: VerbEdit, ProposalID: req.ProposalID, NewVersionID: verID, Overridden: overridden}
	ds.resolveToIdle(req.ProposalID, res)
	return res, nil, nil
}

// gateTakeOver stores the user's directly edited draft: screened
// (warn-and-confirm), diffed synthetically via ComputeDiff, committed as a
// new version.
func (o *Orchestrator) gateTakeOver(ctx context.Context, ds *dishState, req GateRequest) (GateResult, *Outcome, error) {
	if req.Draft == nil {
		return GateResult{}, nil, fmt.Errorf("orchestrator: take_over requires the edited draft")
	}
	dish, err := o.store.GetDish(ctx, req.DishID)
	if err != nil {
		return GateResult{}, nil, fmt.Errorf("orchestrator: load dish %s: %w", req.DishID, err)
	}
	cur, err := o.currentDraft(ctx, dish)
	if err != nil {
		return GateResult{}, nil, err
	}
	// Resolve ids onto the user's draft before diffing/screening, mirroring
	// the enrichment every generated change set gets.
	userDraft := o.resolveDraft(*req.Draft)
	ops := proposal.ComputeDiff(cur, userDraft)
	overridden, err := o.screenHumanWrite(ctx, cur, ops, req)
	if err != nil {
		return GateResult{}, nil, err
	}
	// No proposal sits behind a take_over — the cook wrote the draft
	// directly — so the "why" recorded is a fixed note rather than any
	// model's prose (BC-D-12 still recovers something on this trial, never
	// a blank).
	const takeOverRationale = "Directly edited by the cook."
	verID, err := o.commitVersion(ctx, dish, userDraft, "", takeOverRationale, store.VersionOriginAccepted)
	if err != nil {
		return GateResult{}, nil, err
	}
	if err := o.append(ctx, req.DishID, req.SessionID, eventlog.TypeGateTakeOver, gatePayload{
		Verb: VerbTakeOver, ProposalID: req.ProposalID,
		NewVersionID: verID, AutonomyDial: dish.AutonomyDial, Rationale: takeOverRationale,
	}); err != nil {
		return GateResult{}, nil, err
	}
	res := GateResult{Verb: VerbTakeOver, ProposalID: req.ProposalID, NewVersionID: verID, Overridden: overridden}
	ds.resolveToIdle(req.ProposalID, res)
	return res, nil, nil
}

// screenHumanWrite runs the safety gate over a human-authored change.
// Asymmetric to agent proposals (which hard-block): a hit here warns, and
// proceeding requires ConfirmOverride, recorded as safety_warning_overridden
// BEFORE the write lands. Without the flag nothing happens — no event, no
// resolution — so the caller can retry.
func (o *Orchestrator) screenHumanWrite(ctx context.Context, cur draft.Draft, ops []proposal.Op, req GateRequest) (bool, error) {
	verdict := o.safety.Screen(cur, ops)
	if verdict.Status != "blocked" {
		return false, nil
	}
	if !req.ConfirmOverride {
		return false, fmt.Errorf("%w: %s", ErrConfirmRequired, strings.Join(verdict.Reasons, "; "))
	}
	if err := o.append(ctx, req.DishID, req.SessionID, eventlog.TypeSafetyWarningOverridden, overridePayload{
		ProposalID: req.ProposalID, Verb: req.Verb,
		Reasons: verdict.Reasons, RuleIDs: verdict.RuleIDs,
	}); err != nil {
		return false, err
	}
	return true, nil
}

// respawn resolves the gate target and launches a fresh move (regenerate,
// redirect, alternatives): the gate_* event records the kickoff — the fresh
// move appends no separate move_requested — and any in-flight generation is
// detached first (redirect from proposing), making it the silent loser of
// the race. A post-cook move keeps its base version across respawns.
func (o *Orchestrator) respawn(ctx context.Context, ds *dishState, req GateRequest, eventType, moveType, steer, baseVersion string, n int) (GateResult, *Outcome, error) {
	if ds.inflight != nil {
		ds.inflight.cancel()
		ds.inflight = nil
	}
	dish, cur, thread, err := o.moveInputs(ctx, req.DishID, baseVersion)
	if err != nil {
		return GateResult{}, nil, err
	}
	newMoveID := newID("mv")
	if err := o.append(ctx, req.DishID, req.SessionID, eventType, gatePayload{
		Verb: req.Verb, ProposalID: req.ProposalID, MoveType: moveType,
		Steer: steerForPayload(req.Verb, steer), BaseVersion: baseVersion,
		NewMoveID: newMoveID, AutonomyDial: dish.AutonomyDial,
	}); err != nil {
		return GateResult{}, nil, err
	}
	ds.pending = nil
	ds.blocked = nil
	out, err := o.launch(ctx, ds, moveKickoff{
		dishID: req.DishID, sessionID: req.SessionID, moveID: newMoveID,
		moveType: moveType, steer: steer, baseVersion: baseVersion, n: n,
	}, dish, cur, thread)
	if err != nil {
		return GateResult{}, nil, err
	}
	res := GateResult{Verb: req.Verb, ProposalID: req.ProposalID, NewMoveID: newMoveID}
	ds.resolved[req.ProposalID] = res
	return res, out, nil
}

// steerForPayload keeps redirect's fresh steer on its gate event (the
// thread rebuild replays it as a cook turn); regenerate/alternatives reuse
// the original steer already recorded on move_requested, so persisting it
// again would double-count it in the thread.
func steerForPayload(verb, steer string) string {
	if verb == VerbRedirect {
		return steer
	}
	return ""
}

// --- dishState helpers (caller holds mu) ---

func (ds *dishState) findPending(id string) (pendingProposal, bool) {
	for _, pp := range ds.pending {
		if pp.prop.ID == id {
			return pp, true
		}
	}
	return pendingProposal{}, false
}

// resolveToIdle memoizes a version-producing resolution and returns the
// dish to idle. All pending cards are discarded: un-gated alternatives go
// stale (their ids resolve to ErrUnknownProposal, never to an outcome).
func (ds *dishState) resolveToIdle(id string, res GateResult) {
	ds.resolved[id] = res
	ds.pending = nil
	ds.blocked = nil
	ds.state = StateIdle
}

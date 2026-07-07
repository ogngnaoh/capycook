package eval

// This file folds the append-only event log into PREREG H2 gate dynamics:
// the native verb/event distribution per move category, with the explicit N
// and session count §5 requires (never a bare %).

import (
	"encoding/json"

	"github.com/ogngnaoh/capycook/internal/eventlog"
)

// Run kinds on the events schema (spec §4). Only run_kind=operator events
// count toward H2; harness runs are excluded from gate dynamics entirely.
const (
	RunKindOperator = "operator"
	RunKindHarness  = "harness"
)

// gateDynamicsTypes is the set of native event types that each constitute
// one gate-dynamics observation (spec §4). move_failed is deliberately
// absent: parse/retry exhaustion is tracked separately (Dynamics.MoveFailed)
// and never enters a gate-dynamics denominator.
var gateDynamicsTypes = map[string]bool{
	eventlog.TypeGateAccept:       true,
	eventlog.TypeGateEdit:         true,
	eventlog.TypeGateRegenerate:   true,
	eventlog.TypeGateAlternatives: true,
	eventlog.TypeGateRedirect:     true,
	eventlog.TypeGateTakeOver:     true,
	eventlog.TypeMoveCancelled:    true,
	eventlog.TypeProposalBlocked:  true,
	eventlog.TypeMoveAutoAdvanced: true,
}

// Dynamics is the native verb/event distribution for one move category.
// Counts is keyed by native event type; N is the explicit gate-dynamics
// denominator (the sum of Counts). MoveFailed rides alongside but is never
// part of N.
type Dynamics struct {
	Counts     map[string]int
	N          int
	MoveFailed int
}

// GateDynamics is the H2 fold of one event log: the native distribution per
// fine-grained move type, per deterministic/creative roll-up, and overall.
// Sessions is the number of distinct session_id values across counted gate
// decisions — H2's frozen session unit ("N gate decisions across S
// sessions"); a sitting that produced only failures contributes no gate
// decisions and therefore no session.
type GateDynamics struct {
	ByMoveType map[string]*Dynamics
	ByRollup   map[string]*Dynamics
	Total      *Dynamics
	Sessions   int
}

// payloadFields are the only payload keys the fold reads; every
// orchestrator payload decodes into this shape (extra keys ignored).
type payloadFields struct {
	MoveID     string `json:"move_id"`
	MoveType   string `json:"move_type"`
	ProposalID string `json:"proposal_id"`
	NewMoveID  string `json:"new_move_id"`
}

// FoldGateDynamics folds events into the PREREG H2 gate-dynamics
// distribution. Move types come from the move_requested / move_auto_advanced
// payloads (move_id → move_type index). Respawned moves (regenerate /
// redirect / alternatives) append no separate move_requested — the spawning
// gate event records new_move_id + move_type (orchestrator respawn
// contract), so those registrations feed the same index. Events the index
// misses fall back to the move_type stamped on their own payload, then to
// the proposal_ready proposal_id → move_type link (take_over payloads carry
// only a proposal_id). Anything still unresolvable is counted under Unknown.
func FoldGateDynamics(events []eventlog.Event) GateDynamics {
	moveTypes := map[string]string{} // move_id → move_type
	propTypes := map[string]string{} // proposal_id → move_type
	for _, e := range events {
		if e.RunKind != RunKindOperator {
			continue
		}
		p := parsePayload(e.Payload)
		switch e.Type {
		case eventlog.TypeMoveRequested, eventlog.TypeMoveAutoAdvanced:
			if p.MoveID != "" && p.MoveType != "" {
				moveTypes[p.MoveID] = p.MoveType
			}
		case eventlog.TypeProposalReady:
			if p.ProposalID != "" && p.MoveType != "" {
				propTypes[p.ProposalID] = p.MoveType
			}
		}
		if p.NewMoveID != "" && p.MoveType != "" {
			moveTypes[p.NewMoveID] = p.MoveType
		}
	}

	g := GateDynamics{
		ByMoveType: map[string]*Dynamics{},
		ByRollup:   map[string]*Dynamics{},
		Total:      &Dynamics{Counts: map[string]int{}},
	}
	sessions := map[string]bool{}
	for _, e := range events {
		if e.RunKind != RunKindOperator {
			continue
		}
		failed := e.Type == eventlog.TypeMoveFailed
		if !failed && !gateDynamicsTypes[e.Type] {
			continue
		}
		moveType := resolveMoveType(parsePayload(e.Payload), moveTypes, propTypes)
		for _, d := range []*Dynamics{
			category(g.ByMoveType, moveType),
			category(g.ByRollup, RollupOf(moveType)),
			g.Total,
		} {
			if failed {
				d.MoveFailed++
			} else {
				d.Counts[e.Type]++
				d.N++
			}
		}
		if !failed {
			sessions[e.SessionID] = true
		}
	}
	g.Sessions = len(sessions)
	return g
}

// parsePayload reads the fold-relevant payload fields; a malformed or empty
// payload yields zero fields, which resolve to the Unknown bucket.
func parsePayload(raw json.RawMessage) payloadFields {
	var p payloadFields
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &p)
	}
	return p
}

func resolveMoveType(p payloadFields, moveTypes, propTypes map[string]string) string {
	if t, ok := moveTypes[p.MoveID]; ok {
		return t
	}
	if p.MoveType != "" {
		return p.MoveType
	}
	if t, ok := propTypes[p.ProposalID]; ok {
		return t
	}
	return Unknown
}

// category returns m's Dynamics for key, creating it on first touch.
func category(m map[string]*Dynamics, key string) *Dynamics {
	d, ok := m[key]
	if !ok {
		d = &Dynamics{Counts: map[string]int{}}
		m[key] = d
	}
	return d
}

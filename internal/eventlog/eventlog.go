// Package eventlog is the append-only move/gate event log — the one truly
// event-sourced surface, replayed by eval (P0-B; SPEC §3). It is a thin
// adapter over the store: Append assigns the next per-dish monotonic seq;
// Replay(dishID) returns that dish's events ordered by seq, and
// Replay("") returns all events across dishes in global insert order.
package eventlog

import (
	"context"
	"encoding/json"
	"time"

	"github.com/ogngnaoh/capycook/internal/store"
)

// Event type wire names (spec §4). Every event appended to the log uses one
// of these; later phases (orchestrator, eval) switch on them.
const (
	TypeDishCreated             = "dish_created"
	TypeMoveRequested           = "move_requested"
	TypeProposalReady           = "proposal_ready"
	TypeProposalBlocked         = "proposal_blocked"
	TypeMoveCancelled           = "move_cancelled"
	TypeMoveFailed              = "move_failed"
	TypeGateAccept              = "gate_accept"
	TypeGateEdit                = "gate_edit"
	TypeGateRegenerate          = "gate_regenerate"
	TypeGateAlternatives        = "gate_alternatives"
	TypeGateRedirect            = "gate_redirect"
	TypeGateTakeOver            = "gate_take_over"
	TypeMoveAutoAdvanced        = "move_auto_advanced"
	TypeSafetyWarningOverridden = "safety_warning_overridden"
	TypeBranchPromoted          = "branch_promoted"
)

// Event is one entry in the log (spec §4 schema). Seq is assigned by Append
// (any input value is ignored) and is monotonic per dish. Arm and RunKind are
// persisted verbatim. A zero CreatedAt defaults to now on append; an empty
// Payload round-trips as nil.
type Event struct {
	DishID, SessionID string
	Seq               int64
	Type              string
	Payload           json.RawMessage
	Arm, RunKind      string
	CreatedAt         time.Time
}

// EventLog is the append/replay contract the orchestrator and eval depend on.
type EventLog interface {
	Append(ctx context.Context, e Event) error
	Replay(ctx context.Context, dishID string) ([]Event, error) // dishID "" => all
}

// Log implements EventLog on a store.Store.
type Log struct {
	store store.Store
}

var _ EventLog = (*Log)(nil)

// New returns a Log persisting through s.
func New(s store.Store) *Log { return &Log{store: s} }

// Append persists e, assigning the next per-dish monotonic seq.
func (l *Log) Append(ctx context.Context, e Event) error {
	_, err := l.store.AppendEvent(ctx, store.Event{
		DishID:      e.DishID,
		SessionID:   e.SessionID,
		Type:        e.Type,
		PayloadJSON: string(e.Payload),
		Arm:         e.Arm,
		RunKind:     e.RunKind,
		CreatedAt:   e.CreatedAt,
	})
	return err
}

// Replay returns dishID's events ordered by seq; dishID "" returns all
// events across dishes in global insert order.
func (l *Log) Replay(ctx context.Context, dishID string) ([]Event, error) {
	rows, err := l.store.ListEvents(ctx, dishID)
	if err != nil {
		return nil, err
	}
	events := make([]Event, len(rows))
	for i, r := range rows {
		events[i] = Event{
			DishID:    r.DishID,
			SessionID: r.SessionID,
			Seq:       r.Seq,
			Type:      r.Type,
			Arm:       r.Arm,
			RunKind:   r.RunKind,
			CreatedAt: r.CreatedAt,
		}
		if r.PayloadJSON != "" {
			events[i].Payload = json.RawMessage(r.PayloadJSON)
		}
	}
	return events, nil
}

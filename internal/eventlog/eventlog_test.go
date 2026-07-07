package eventlog

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/ogngnaoh/capycook/internal/store"
)

func openTestLog(t *testing.T) *Log {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return New(s)
}

func mustAppend(t *testing.T, l *Log, e Event) {
	t.Helper()
	if err := l.Append(context.Background(), e); err != nil {
		t.Fatalf("Append(%s, %s): %v", e.DishID, e.Type, err)
	}
}

func TestAppendAssignsMonotonicSeqPerDish(t *testing.T) {
	l := openTestLog(t)
	ctx := context.Background()

	// Interleave appends across two dishes: seq must be per-dish monotonic,
	// assigned by Append (input Seq is ignored).
	appends := []struct {
		dish string
		typ  string
	}{
		{"dish-a", TypeDishCreated},
		{"dish-b", TypeDishCreated},
		{"dish-a", TypeMoveRequested},
		{"dish-a", TypeProposalReady},
		{"dish-b", TypeMoveRequested},
	}
	for _, a := range appends {
		mustAppend(t, l, Event{
			DishID:    a.dish,
			SessionID: "sess-1",
			Seq:       99, // must be ignored: the log assigns seq
			Type:      a.typ,
			Payload:   json.RawMessage(`{}`),
			Arm:       "none",
			RunKind:   "operator",
		})
	}

	for dish, wantTypes := range map[string][]string{
		"dish-a": {TypeDishCreated, TypeMoveRequested, TypeProposalReady},
		"dish-b": {TypeDishCreated, TypeMoveRequested},
	} {
		got, err := l.Replay(ctx, dish)
		if err != nil {
			t.Fatalf("Replay(%s): %v", dish, err)
		}
		if len(got) != len(wantTypes) {
			t.Fatalf("Replay(%s) returned %d events, want %d", dish, len(got), len(wantTypes))
		}
		for i, e := range got {
			if e.Seq != int64(i+1) {
				t.Errorf("%s event %d: seq = %d, want %d", dish, i, e.Seq, i+1)
			}
			if e.Type != wantTypes[i] {
				t.Errorf("%s event %d: type = %q, want %q", dish, i, e.Type, wantTypes[i])
			}
		}
	}
}

func TestReplayRoundTripsFieldsVerbatim(t *testing.T) {
	l := openTestLog(t)
	ctx := context.Background()

	created := time.Date(2026, 7, 6, 12, 30, 0, 0, time.UTC)
	in := Event{
		DishID:    "dish-1",
		SessionID: "sess-42",
		Type:      TypeGateAccept,
		Payload:   json.RawMessage(`{"proposalId":"p-1","verb":"accept"}`),
		Arm:       "flavorgraph",
		RunKind:   "harness",
		CreatedAt: created,
	}
	mustAppend(t, l, in)

	got, err := l.Replay(ctx, "dish-1")
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("Replay returned %d events, want 1", len(got))
	}
	e := got[0]
	if e.DishID != in.DishID || e.SessionID != in.SessionID || e.Type != in.Type {
		t.Errorf("identity fields mismatch: %+v", e)
	}
	if e.Arm != "flavorgraph" || e.RunKind != "harness" {
		t.Errorf("arm/run_kind not persisted verbatim: arm=%q run_kind=%q", e.Arm, e.RunKind)
	}
	if string(e.Payload) != string(in.Payload) {
		t.Errorf("payload = %s, want %s", e.Payload, in.Payload)
	}
	if e.Seq != 1 {
		t.Errorf("seq = %d, want 1", e.Seq)
	}
	if !e.CreatedAt.Equal(created) {
		t.Errorf("created_at = %v, want %v", e.CreatedAt, created)
	}
}

func TestAppendDefaultsCreatedAt(t *testing.T) {
	l := openTestLog(t)
	ctx := context.Background()

	mustAppend(t, l, Event{
		DishID: "dish-1", SessionID: "sess-1", Type: TypeDishCreated,
		Arm: "none", RunKind: "operator",
	})
	got, err := l.Replay(ctx, "dish-1")
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if len(got) != 1 || got[0].CreatedAt.IsZero() {
		t.Fatalf("CreatedAt not defaulted: %+v", got)
	}
	if time.Since(got[0].CreatedAt) > time.Minute {
		t.Fatalf("CreatedAt suspicious: %v", got[0].CreatedAt)
	}
}

func TestReplayAllDishesInInsertOrder(t *testing.T) {
	l := openTestLog(t)
	ctx := context.Background()

	// Replay("") returns every event across dishes in global insert order.
	order := []struct{ dish, typ string }{
		{"dish-a", TypeDishCreated},
		{"dish-b", TypeDishCreated},
		{"dish-a", TypeMoveRequested},
		{"dish-b", TypeMoveRequested},
		{"dish-a", TypeProposalReady},
	}
	for _, o := range order {
		mustAppend(t, l, Event{
			DishID: o.dish, SessionID: "sess-1", Type: o.typ,
			Arm: "none", RunKind: "operator",
		})
	}

	all, err := l.Replay(ctx, "")
	if err != nil {
		t.Fatalf(`Replay(""): %v`, err)
	}
	if len(all) != len(order) {
		t.Fatalf(`Replay("") returned %d events, want %d`, len(all), len(order))
	}
	for i, e := range all {
		if e.DishID != order[i].dish || e.Type != order[i].typ {
			t.Errorf(`Replay("")[%d] = {%s %s}, want {%s %s}`,
				i, e.DishID, e.Type, order[i].dish, order[i].typ)
		}
	}
}

func TestReplayUnknownDishIsEmpty(t *testing.T) {
	l := openTestLog(t)

	got, err := l.Replay(context.Background(), "no-such-dish")
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("Replay returned %d events, want 0", len(got))
	}
}

func TestEventTypeConstants(t *testing.T) {
	// Wire names are pinned by spec §4; a typo here would corrupt the log.
	want := map[string]string{
		TypeDishCreated:             "dish_created",
		TypeMoveRequested:           "move_requested",
		TypeProposalReady:           "proposal_ready",
		TypeProposalBlocked:         "proposal_blocked",
		TypeMoveCancelled:           "move_cancelled",
		TypeMoveFailed:              "move_failed",
		TypeGateAccept:              "gate_accept",
		TypeGateEdit:                "gate_edit",
		TypeGateRegenerate:          "gate_regenerate",
		TypeGateAlternatives:        "gate_alternatives",
		TypeGateRedirect:            "gate_redirect",
		TypeGateTakeOver:            "gate_take_over",
		TypeMoveAutoAdvanced:        "move_auto_advanced",
		TypeSafetyWarningOverridden: "safety_warning_overridden",
		TypeBranchPromoted:          "branch_promoted",
	}
	if len(want) != 15 {
		t.Fatalf("expected 15 distinct event type constants, got %d", len(want))
	}
	for got, expected := range want {
		if got != expected {
			t.Errorf("constant = %q, want %q", got, expected)
		}
	}
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func openTestStore(t *testing.T) *SQLite {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func mustCreateDish(t *testing.T, s *SQLite, id string) Dish {
	t.Helper()
	d := Dish{
		ID:              id,
		Seed:            "smoky roasted carrots",
		ConstraintsJSON: `{"servings":2}`,
		AutonomyDial:    true,
	}
	if err := s.CreateDish(context.Background(), d); err != nil {
		t.Fatalf("CreateDish(%s): %v", id, err)
	}
	got, err := s.GetDish(context.Background(), id)
	if err != nil {
		t.Fatalf("GetDish(%s): %v", id, err)
	}
	return got
}

func TestOpenMigratesToLatest(t *testing.T) {
	s := openTestStore(t)

	var version int
	if err := s.db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatalf("PRAGMA user_version: %v", err)
	}
	if version != len(migrations) {
		t.Fatalf("user_version = %d, want %d", version, len(migrations))
	}

	var mode string
	if err := s.db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatalf("PRAGMA journal_mode: %v", err)
	}
	if mode != "wal" {
		t.Fatalf("journal_mode = %q, want wal", mode)
	}
}

func TestOpenIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for i := 0; i < 2; i++ {
		s, err := Open(path)
		if err != nil {
			t.Fatalf("Open #%d: %v", i+1, err)
		}
		if err := s.Close(); err != nil {
			t.Fatalf("Close #%d: %v", i+1, err)
		}
	}
}

func TestOpenCreatesParentDir(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "deeper", "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open with missing parent dirs: %v", err)
	}
	s.Close()
}

func TestDishRoundTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	d := mustCreateDish(t, s, "dish-1")
	if d.Seed != "smoky roasted carrots" || d.ConstraintsJSON != `{"servings":2}` {
		t.Fatalf("round-trip mismatch: %+v", d)
	}
	if !d.AutonomyDial {
		t.Fatalf("AutonomyDial not persisted: %+v", d)
	}
	if d.CurrentVersionID != nil {
		t.Fatalf("CurrentVersionID = %v, want nil", *d.CurrentVersionID)
	}
	if d.CreatedAt.IsZero() {
		t.Fatal("CreatedAt not set")
	}

	list, err := s.ListDishes(ctx)
	if err != nil {
		t.Fatalf("ListDishes: %v", err)
	}
	if len(list) != 1 || list[0].ID != "dish-1" {
		t.Fatalf("ListDishes = %+v, want one dish-1", list)
	}
}

func TestDishUpdateAndDelete(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	d := mustCreateDish(t, s, "dish-1")
	ver := "ver-1"
	d.CurrentVersionID = &ver
	d.AutonomyDial = false
	if err := s.UpdateDish(ctx, d); err != nil {
		t.Fatalf("UpdateDish: %v", err)
	}
	got, err := s.GetDish(ctx, "dish-1")
	if err != nil {
		t.Fatalf("GetDish after update: %v", err)
	}
	if got.CurrentVersionID == nil || *got.CurrentVersionID != "ver-1" {
		t.Fatalf("CurrentVersionID = %v, want ver-1", got.CurrentVersionID)
	}
	if got.AutonomyDial {
		t.Fatal("AutonomyDial still true after update")
	}

	if err := s.DeleteDish(ctx, "dish-1"); err != nil {
		t.Fatalf("DeleteDish: %v", err)
	}
	if _, err := s.GetDish(ctx, "dish-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetDish after delete: err = %v, want ErrNotFound", err)
	}
}

func TestNotFoundErrors(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if _, err := s.GetDish(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetDish: err = %v, want ErrNotFound", err)
	}
	if _, err := s.GetVersion(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetVersion: err = %v, want ErrNotFound", err)
	}
	if err := s.UpdateDish(ctx, Dish{ID: "nope"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("UpdateDish: err = %v, want ErrNotFound", err)
	}
	if err := s.DeleteDish(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteDish: err = %v, want ErrNotFound", err)
	}
}

func TestVersionChainViaParentPointers(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustCreateDish(t, s, "dish-1")

	// v1 (root) <- v2 <- v3
	prev := ""
	for i, id := range []string{"v1", "v2", "v3"} {
		v := Version{
			ID:        id,
			DishID:    "dish-1",
			DraftJSON: `{"title":"draft ` + id + `"}`,
		}
		if i > 0 {
			p := prev
			v.ParentVersionID = &p
		}
		if err := s.CreateVersion(ctx, v); err != nil {
			t.Fatalf("CreateVersion(%s): %v", id, err)
		}
		prev = id
	}

	// Walk the chain backwards from the tip.
	var chain []string
	id := "v3"
	for {
		v, err := s.GetVersion(ctx, id)
		if err != nil {
			t.Fatalf("GetVersion(%s): %v", id, err)
		}
		chain = append(chain, v.ID)
		if v.ParentVersionID == nil {
			break
		}
		id = *v.ParentVersionID
	}
	if len(chain) != 3 || chain[0] != "v3" || chain[1] != "v2" || chain[2] != "v1" {
		t.Fatalf("chain = %v, want [v3 v2 v1]", chain)
	}

	list, err := s.ListVersions(ctx, "dish-1")
	if err != nil {
		t.Fatalf("ListVersions: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("ListVersions returned %d versions, want 3", len(list))
	}
	if list[0].DraftJSON != `{"title":"draft v1"}` {
		t.Fatalf("DraftJSON round-trip mismatch: %q", list[0].DraftJSON)
	}
}

func TestAppendEventMonotonicSeqPerDish(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustCreateDish(t, s, "dish-a")
	mustCreateDish(t, s, "dish-b")

	// Interleave appends across two dishes: seq must be per-dish monotonic.
	appends := []struct {
		dish    string
		wantSeq int64
	}{
		{"dish-a", 1}, {"dish-b", 1}, {"dish-a", 2}, {"dish-a", 3}, {"dish-b", 2},
	}
	for i, a := range appends {
		e, err := s.AppendEvent(ctx, Event{
			DishID:      a.dish,
			SessionID:   "sess-1",
			Type:        "move_requested",
			PayloadJSON: `{"i":` + string(rune('0'+i)) + `}`,
			Arm:         "none",
			RunKind:     "operator",
		})
		if err != nil {
			t.Fatalf("AppendEvent #%d (%s): %v", i, a.dish, err)
		}
		if e.Seq != a.wantSeq {
			t.Fatalf("AppendEvent #%d (%s): seq = %d, want %d", i, a.dish, e.Seq, a.wantSeq)
		}
		if e.ID == 0 {
			t.Fatalf("AppendEvent #%d: ID not assigned", i)
		}
		if e.CreatedAt.IsZero() {
			t.Fatalf("AppendEvent #%d: CreatedAt not set", i)
		}
	}

	got, err := s.ListEvents(ctx, "dish-a")
	if err != nil {
		t.Fatalf("ListEvents(dish-a): %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("ListEvents(dish-a) returned %d events, want 3", len(got))
	}
	for i, e := range got {
		if e.Seq != int64(i+1) {
			t.Fatalf("dish-a event %d: seq = %d, want %d", i, e.Seq, i+1)
		}
	}
	if got[0].SessionID != "sess-1" || got[0].Type != "move_requested" ||
		got[0].Arm != "none" || got[0].RunKind != "operator" {
		t.Fatalf("event fields not persisted: %+v", got[0])
	}

	all, err := s.ListEvents(ctx, "")
	if err != nil {
		t.Fatalf(`ListEvents(""): %v`, err)
	}
	if len(all) != 5 {
		t.Fatalf(`ListEvents("") returned %d events, want 5`, len(all))
	}
	for i := 1; i < len(all); i++ {
		if all[i].ID <= all[i-1].ID {
			t.Fatalf(`ListEvents("") not in append order: ids %d then %d`, all[i-1].ID, all[i].ID)
		}
	}
}

// TestVersionMigrationIsAdditive is the operator-DB invariant check for
// BC-D-12/BC-F-3's schema change: a database frozen at the original schema
// (migrations[0] only, the shape any pre-existing data/capycook.db is in)
// with a real version row already in it must still Open cleanly, applying
// the additive rationale/origin migration on top without touching that
// row's existing columns — and the new columns read back with the DEFAULTs
// the migration declared, never an error, never a dropped row.
func TestVersionMigrationIsAdditive(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	ctx := context.Background()

	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	if _, err := raw.Exec(migrations[0]); err != nil {
		t.Fatalf("apply original schema: %v", err)
	}
	if _, err := raw.Exec("PRAGMA user_version = 1"); err != nil {
		t.Fatalf("set user_version: %v", err)
	}
	if _, err := raw.Exec(
		`INSERT INTO dishes (id, seed, constraints_json, current_version_id, autonomy_dial, created_at)
		 VALUES ('dish-legacy', 'legacy seed', '{}', 'ver-legacy', 1, '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("insert legacy dish: %v", err)
	}
	if _, err := raw.Exec(
		`INSERT INTO versions (id, dish_id, parent_version_id, draft_json, created_at)
		 VALUES ('ver-legacy', 'dish-legacy', NULL, '{"title":"legacy draft"}', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("insert legacy version (pre-rationale/origin schema): %v", err)
	}
	if err := raw.Close(); err != nil {
		t.Fatalf("close raw handle: %v", err)
	}

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open on a legacy (pre-migration) database: %v", err)
	}
	defer s.Close()

	var version int
	if err := s.db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatalf("PRAGMA user_version: %v", err)
	}
	if version != len(migrations) {
		t.Fatalf("user_version = %d after Open, want %d (the additive migration ran)", version, len(migrations))
	}

	d, err := s.GetDish(ctx, "dish-legacy")
	if err != nil {
		t.Fatalf("GetDish(dish-legacy) after migration: %v", err)
	}
	if d.Seed != "legacy seed" {
		t.Fatalf("legacy dish seed = %q, want unchanged 'legacy seed'", d.Seed)
	}

	v, err := s.GetVersion(ctx, "ver-legacy")
	if err != nil {
		t.Fatalf("GetVersion(ver-legacy) after migration: %v", err)
	}
	if v.DraftJSON != `{"title":"legacy draft"}` {
		t.Fatalf("legacy version draft_json = %q, want unchanged", v.DraftJSON)
	}
	if v.Rationale != "" {
		t.Fatalf("legacy version rationale = %q, want '' (the migration's DEFAULT)", v.Rationale)
	}
	if v.Origin != VersionOriginAccepted {
		t.Fatalf("legacy version origin = %q, want %q (the migration's DEFAULT)", v.Origin, VersionOriginAccepted)
	}

	// A fresh version created post-migration round-trips both new fields.
	if err := s.CreateVersion(ctx, Version{
		ID: "ver-new", DishID: "dish-legacy", ParentVersionID: strPtr("ver-legacy"),
		DraftJSON: `{"title":"new draft"}`, Rationale: "a distinctive rationale", Origin: VersionOriginAuto,
	}); err != nil {
		t.Fatalf("CreateVersion after migration: %v", err)
	}
	got, err := s.GetVersion(ctx, "ver-new")
	if err != nil {
		t.Fatalf("GetVersion(ver-new): %v", err)
	}
	if got.Rationale != "a distinctive rationale" || got.Origin != VersionOriginAuto {
		t.Fatalf("new version rationale/origin = %q/%q, want 'a distinctive rationale'/%q", got.Rationale, got.Origin, VersionOriginAuto)
	}
}

func strPtr(s string) *string { return &s }

func TestReopenKeepsData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	ctx := context.Background()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	mustCreateDish(t, s, "dish-1")
	if err := s.CreateVersion(ctx, Version{ID: "v1", DishID: "dish-1", DraftJSON: `{}`}); err != nil {
		t.Fatalf("CreateVersion: %v", err)
	}
	if _, err := s.AppendEvent(ctx, Event{
		DishID: "dish-1", SessionID: "sess-1", Type: "dish_created",
		PayloadJSON: `{}`, Arm: "none", RunKind: "operator",
	}); err != nil {
		t.Fatalf("AppendEvent: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	s2, err := Open(path)
	if err != nil {
		t.Fatalf("re-Open: %v", err)
	}
	defer s2.Close()

	d, err := s2.GetDish(ctx, "dish-1")
	if err != nil {
		t.Fatalf("GetDish after re-open: %v", err)
	}
	if d.Seed != "smoky roasted carrots" {
		t.Fatalf("Seed after re-open = %q", d.Seed)
	}
	if !d.CreatedAt.Equal(d.CreatedAt.UTC()) || time.Since(d.CreatedAt) > time.Minute {
		t.Fatalf("CreatedAt suspicious after re-open: %v", d.CreatedAt)
	}
	if _, err := s2.GetVersion(ctx, "v1"); err != nil {
		t.Fatalf("GetVersion after re-open: %v", err)
	}
	evs, err := s2.ListEvents(ctx, "dish-1")
	if err != nil {
		t.Fatalf("ListEvents after re-open: %v", err)
	}
	if len(evs) != 1 || evs[0].Seq != 1 {
		t.Fatalf("events after re-open = %+v, want one event with seq 1", evs)
	}
}

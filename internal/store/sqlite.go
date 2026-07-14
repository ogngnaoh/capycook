package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite" // pure-Go sqlite driver, CGO_ENABLED=0
)

// SQLite implements Store on a single sqlite database file.
type SQLite struct {
	db *sql.DB
}

var _ Store = (*SQLite)(nil)

// Open opens (creating if needed) the sqlite database at path, switches it to
// WAL mode, and applies pending migrations. The parent directory is created
// if missing.
func Open(path string) (*SQLite, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("store: create db dir: %w", err)
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("store: open %s: %w", path, err)
	}
	// Single writer: sqlite serializes writes anyway; one connection avoids
	// SQLITE_BUSY between pooled connections.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: set pragmas: %w", err)
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return &SQLite{db: db}, nil
}

// Close closes the underlying database.
func (s *SQLite) Close() error { return s.db.Close() }

// --- dishes ---

func (s *SQLite) CreateDish(ctx context.Context, d Dish) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO dishes (id, seed, constraints_json, current_version_id, autonomy_dial, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		d.ID, d.Seed, d.ConstraintsJSON, nullable(d.CurrentVersionID),
		d.AutonomyDial, formatTime(orNow(d.CreatedAt)))
	if err != nil {
		return fmt.Errorf("store: create dish %s: %w", d.ID, err)
	}
	return nil
}

func (s *SQLite) GetDish(ctx context.Context, id string) (Dish, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, seed, constraints_json, current_version_id, autonomy_dial, created_at
		 FROM dishes WHERE id = ?`, id)
	d, err := scanDish(row)
	if err == sql.ErrNoRows {
		return Dish{}, fmt.Errorf("store: dish %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Dish{}, fmt.Errorf("store: get dish %s: %w", id, err)
	}
	return d, nil
}

func (s *SQLite) ListDishes(ctx context.Context) ([]Dish, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, seed, constraints_json, current_version_id, autonomy_dial, created_at
		 FROM dishes ORDER BY created_at, id`)
	if err != nil {
		return nil, fmt.Errorf("store: list dishes: %w", err)
	}
	defer rows.Close()
	var dishes []Dish
	for rows.Next() {
		d, err := scanDish(rows)
		if err != nil {
			return nil, fmt.Errorf("store: list dishes: %w", err)
		}
		dishes = append(dishes, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: list dishes: %w", err)
	}
	return dishes, nil
}

func (s *SQLite) UpdateDish(ctx context.Context, d Dish) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE dishes SET seed = ?, constraints_json = ?, current_version_id = ?, autonomy_dial = ?
		 WHERE id = ?`,
		d.Seed, d.ConstraintsJSON, nullable(d.CurrentVersionID), d.AutonomyDial, d.ID)
	if err != nil {
		return fmt.Errorf("store: update dish %s: %w", d.ID, err)
	}
	return checkAffected(res, "update dish", d.ID)
}

func (s *SQLite) DeleteDish(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("store: delete dish %s: %w", id, err)
	}
	defer tx.Rollback()
	for _, q := range []string{
		`DELETE FROM events WHERE dish_id = ?`,
		`DELETE FROM versions WHERE dish_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return fmt.Errorf("store: delete dish %s: %w", id, err)
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM dishes WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("store: delete dish %s: %w", id, err)
	}
	if err := checkAffected(res, "delete dish", id); err != nil {
		return err
	}
	return tx.Commit()
}

// --- versions ---

func (s *SQLite) CreateVersion(ctx context.Context, v Version) error {
	origin := v.Origin
	if origin == "" {
		origin = VersionOriginAccepted
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO versions (id, dish_id, parent_version_id, draft_json, rationale, origin, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		v.ID, v.DishID, nullable(v.ParentVersionID), v.DraftJSON, v.Rationale, origin, formatTime(orNow(v.CreatedAt)))
	if err != nil {
		return fmt.Errorf("store: create version %s: %w", v.ID, err)
	}
	return nil
}

func (s *SQLite) GetVersion(ctx context.Context, id string) (Version, error) {
	var (
		v       Version
		parent  sql.NullString
		created string
	)
	err := s.db.QueryRowContext(ctx,
		`SELECT id, dish_id, parent_version_id, draft_json, rationale, origin, created_at
		 FROM versions WHERE id = ?`, id).
		Scan(&v.ID, &v.DishID, &parent, &v.DraftJSON, &v.Rationale, &v.Origin, &created)
	if err == sql.ErrNoRows {
		return Version{}, fmt.Errorf("store: version %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Version{}, fmt.Errorf("store: get version %s: %w", id, err)
	}
	v.ParentVersionID = fromNullable(parent)
	if v.CreatedAt, err = parseTime(created); err != nil {
		return Version{}, fmt.Errorf("store: get version %s: %w", id, err)
	}
	return v, nil
}

func (s *SQLite) ListVersions(ctx context.Context, dishID string) ([]Version, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, dish_id, parent_version_id, draft_json, rationale, origin, created_at
		 FROM versions WHERE dish_id = ? ORDER BY created_at, id`, dishID)
	if err != nil {
		return nil, fmt.Errorf("store: list versions %s: %w", dishID, err)
	}
	defer rows.Close()
	var versions []Version
	for rows.Next() {
		var (
			v       Version
			parent  sql.NullString
			created string
		)
		if err := rows.Scan(&v.ID, &v.DishID, &parent, &v.DraftJSON, &v.Rationale, &v.Origin, &created); err != nil {
			return nil, fmt.Errorf("store: list versions %s: %w", dishID, err)
		}
		v.ParentVersionID = fromNullable(parent)
		if v.CreatedAt, err = parseTime(created); err != nil {
			return nil, fmt.Errorf("store: list versions %s: %w", dishID, err)
		}
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: list versions %s: %w", dishID, err)
	}
	return versions, nil
}

// --- events ---

func (s *SQLite) AppendEvent(ctx context.Context, e Event) (Event, error) {
	e.CreatedAt = orNow(e.CreatedAt)
	// The seq subselect and the insert are one statement, so the next
	// per-dish seq is assigned atomically.
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO events (dish_id, session_id, seq, type, payload_json, arm, run_kind, created_at)
		 VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE dish_id = ?), ?, ?, ?, ?, ?)
		 RETURNING id, seq`,
		e.DishID, e.SessionID, e.DishID, e.Type, e.PayloadJSON, e.Arm, e.RunKind,
		formatTime(e.CreatedAt)).
		Scan(&e.ID, &e.Seq)
	if err != nil {
		return Event{}, fmt.Errorf("store: append event for dish %s: %w", e.DishID, err)
	}
	return e, nil
}

func (s *SQLite) ListEvents(ctx context.Context, dishID string) ([]Event, error) {
	query := `SELECT id, dish_id, session_id, seq, type, payload_json, arm, run_kind, created_at
		 FROM events ORDER BY id`
	args := []any{}
	if dishID != "" {
		query = `SELECT id, dish_id, session_id, seq, type, payload_json, arm, run_kind, created_at
		 FROM events WHERE dish_id = ? ORDER BY seq`
		args = append(args, dishID)
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("store: list events %q: %w", dishID, err)
	}
	defer rows.Close()
	var events []Event
	for rows.Next() {
		var (
			e       Event
			created string
		)
		if err := rows.Scan(&e.ID, &e.DishID, &e.SessionID, &e.Seq, &e.Type,
			&e.PayloadJSON, &e.Arm, &e.RunKind, &created); err != nil {
			return nil, fmt.Errorf("store: list events %q: %w", dishID, err)
		}
		if e.CreatedAt, err = parseTime(created); err != nil {
			return nil, fmt.Errorf("store: list events %q: %w", dishID, err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: list events %q: %w", dishID, err)
	}
	return events, nil
}

// --- helpers ---

type scanner interface{ Scan(dest ...any) error }

func scanDish(row scanner) (Dish, error) {
	var (
		d       Dish
		current sql.NullString
		created string
	)
	if err := row.Scan(&d.ID, &d.Seed, &d.ConstraintsJSON, &current,
		&d.AutonomyDial, &created); err != nil {
		return Dish{}, err
	}
	d.CurrentVersionID = fromNullable(current)
	var err error
	d.CreatedAt, err = parseTime(created)
	return d, err
}

func checkAffected(res sql.Result, op, id string) error {
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("store: %s %s: %w", op, id, err)
	}
	if n == 0 {
		return fmt.Errorf("store: %s %s: %w", op, id, ErrNotFound)
	}
	return nil
}

func nullable(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

func fromNullable(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	return &ns.String
}

func orNow(t time.Time) time.Time {
	if t.IsZero() {
		return time.Now().UTC()
	}
	return t.UTC()
}

func formatTime(t time.Time) string { return t.Format(time.RFC3339Nano) }

func parseTime(s string) (time.Time, error) { return time.Parse(time.RFC3339Nano, s) }

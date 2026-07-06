package store

import (
	"database/sql"
	"fmt"
)

// migrations are ordered SQL steps. PRAGMA user_version records how many have
// been applied; migrate runs the remainder, each in its own transaction.
// Append-only: never edit or reorder shipped entries.
var migrations = []string{
	`CREATE TABLE dishes (
		id                 TEXT PRIMARY KEY,
		seed               TEXT NOT NULL,
		constraints_json   TEXT NOT NULL,
		current_version_id TEXT,
		autonomy_dial      INTEGER NOT NULL,
		created_at         TEXT NOT NULL
	);
	CREATE TABLE versions (
		id                TEXT PRIMARY KEY,
		dish_id           TEXT NOT NULL,
		parent_version_id TEXT,
		draft_json        TEXT NOT NULL,
		created_at        TEXT NOT NULL
	);
	CREATE INDEX versions_dish_id ON versions(dish_id);
	CREATE TABLE events (
		id           INTEGER PRIMARY KEY,
		dish_id      TEXT NOT NULL,
		session_id   TEXT NOT NULL,
		seq          INTEGER NOT NULL,
		type         TEXT NOT NULL,
		payload_json TEXT NOT NULL,
		arm          TEXT NOT NULL,
		run_kind     TEXT NOT NULL,
		created_at   TEXT NOT NULL
	);
	CREATE UNIQUE INDEX events_dish_seq ON events(dish_id, seq);`,
}

func migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("store: read user_version: %w", err)
	}
	for i := version; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("store: migration %d: begin: %w", i+1, err)
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("store: migration %d: %w", i+1, err)
		}
		// PRAGMA does not take placeholders; i+1 is a trusted loop index.
		if _, err := tx.Exec(fmt.Sprintf("PRAGMA user_version = %d", i+1)); err != nil {
			tx.Rollback()
			return fmt.Errorf("store: migration %d: set user_version: %w", i+1, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("store: migration %d: commit: %w", i+1, err)
		}
	}
	return nil
}

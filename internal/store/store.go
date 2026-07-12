// Package store is the persistence boundary: a store interface plus the
// pure-Go modernc.org/sqlite implementation (WAL, single-writer) that
// draft and eventlog persist through (supports P0-A/P0-B; SPEC §3).
package store

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound is returned when the referenced row does not exist.
var ErrNotFound = errors.New("store: not found")

// Dish is a row in the dishes table.
type Dish struct {
	ID               string
	Seed             string
	ConstraintsJSON  string
	CurrentVersionID *string // nil until the first version is promoted
	AutonomyDial     bool
	CreatedAt        time.Time
}

// Version is a row in the versions table. Versions are immutable snapshots
// chained by parent pointers; the root version has a nil parent. Rationale
// and Origin are additive (BC-D-12/BC-F-3): the prose that accompanied the
// proposal at accept time, and how the version came to exist.
type Version struct {
	ID              string
	DishID          string
	ParentVersionID *string
	DraftJSON       string
	// Rationale is the accepted proposal's prose. take_over has no proposal
	// behind it, so the orchestrator fills a fixed note there instead of
	// leaving this blank.
	Rationale string
	// Origin is one of the VersionOrigin* constants: how this version was
	// committed.
	Origin    string
	CreatedAt time.Time
}

// VersionOrigin values (BC-F-3): distinguishes an auto-applied version from
// a human-decided one, durably, on the version record itself.
const (
	VersionOriginAccepted = "accepted" // gate_accept | gate_edit | gate_take_over
	VersionOriginAuto     = "auto"     // move_auto_advanced (dial ON, deterministic move)
)

// Event is a row in the events table (spec §4 schema). Seq is monotonic per
// dish and assigned by the store on append.
type Event struct {
	ID          int64
	DishID      string
	SessionID   string
	Seq         int64
	Type        string
	PayloadJSON string
	Arm         string
	RunKind     string
	CreatedAt   time.Time
}

// Store is the persistence interface the rest of the system depends on.
type Store interface {
	CreateDish(ctx context.Context, d Dish) error
	GetDish(ctx context.Context, id string) (Dish, error)
	ListDishes(ctx context.Context) ([]Dish, error)
	// UpdateDish rewrites the mutable fields (seed, constraints,
	// current_version_id, autonomy_dial) of the dish with d.ID.
	UpdateDish(ctx context.Context, d Dish) error
	// DeleteDish removes the dish and its versions and events.
	DeleteDish(ctx context.Context, id string) error

	CreateVersion(ctx context.Context, v Version) error
	GetVersion(ctx context.Context, id string) (Version, error)
	// ListVersions returns the dish's versions in creation order.
	ListVersions(ctx context.Context, dishID string) ([]Version, error)

	// AppendEvent assigns the next per-dish seq (and id, created_at) and
	// returns the stored event.
	AppendEvent(ctx context.Context, e Event) (Event, error)
	// ListEvents returns a dish's events ordered by seq; dishID "" returns
	// all events in append order.
	ListEvents(ctx context.Context, dishID string) ([]Event, error)

	Close() error
}

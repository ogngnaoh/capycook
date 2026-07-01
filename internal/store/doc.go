// Package store is the persistence boundary: a store interface plus the
// pure-Go modernc.org/sqlite implementation (WAL, single-writer) that
// draft and eventlog persist through (supports P0-A/P0-B; SPEC §3).
// Stub — no logic yet (lands in milestone 00, slice S0.2).
package store

// Package services holds deterministic, LLM-free functions: scaling, cost,
// nutrition, allergen check, and the safety gate blocklist/min-cook-temps
// (P0-5, P0-7b; SPEC §3). Phase 1 ships the interfaces plus placeholder
// stubs; the real data-backed services land in phase 2.
package services

import (
	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// Nutrition computes the per-serving nutrition panel for a draft (spec §5).
type Nutrition interface {
	Compute(d draft.Draft) (draft.NutritionAnalysis, error)
}

// Cost computes the per-dish + per-serving cost estimate for a draft
// (spec §5).
type Cost interface {
	Compute(d draft.Draft) (draft.CostAnalysis, error)
}

// SafetyGate is the deterministic post-generation screen: it judges the
// draft that results from applying ops to current. It runs on proposals
// AND human edits (spec §4); blocked proposals never reach the cook.
type SafetyGate interface {
	Screen(current draft.Draft, ops []proposal.Op) proposal.Safety
}

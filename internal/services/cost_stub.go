package services

import "github.com/ogngnaoh/capycook/internal/draft"

// StubCost returns one fixed placeholder estimate for every draft; the
// real cost table lands in phase 2 behind the same interface.
type StubCost struct{}

var _ Cost = StubCost{}

// Compute ignores the draft and returns fixed placeholder numbers, always
// marked approximate.
func (StubCost) Compute(draft.Draft) (draft.CostAnalysis, error) {
	return draft.CostAnalysis{TotalUSD: 12.4, PerServingUSD: 6.2, Approximate: true, Missing: []string{}}, nil
}

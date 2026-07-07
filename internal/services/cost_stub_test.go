package services

import (
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

func TestStubCostCompute(t *testing.T) {
	tests := []struct {
		name string
		d    draft.Draft
	}{
		{"empty draft", draft.Draft{}},
		{"populated draft", baseDraft()},
	}
	want := draft.CostAnalysis{TotalUSD: 12.4, PerServingUSD: 6.2, Approximate: true, Missing: []string{}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := StubCost{}.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("Compute = %+v, want the fixed placeholder estimate %+v", got, want)
			}
		})
	}
}

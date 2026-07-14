package eval

import (
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
)

func TestVerifyTier1(t *testing.T) {
	fdc := "171077"
	foodon := "FOODON_03411343"
	ev := llm.Evidence{
		Pairings:    []grounding.Pairing{{Ingredient: "basil", Score: 0.9}},
		Resolutions: []grounding.Resolution{{FDCID: &fdc, FoodOnID: &foodon, Canonical: "tomato"}},
	}
	cases := []struct {
		name, source, want string
	}{
		{"empty source is honest unverified", "", LabelCorrectlyUnverified},
		{"supplied pairing verifies", "pairing:basil", LabelGroundedCorrect},
		{"unsupplied pairing mischaracterizes", "pairing:chocolate", LabelGroundedMischaracterized},
		{"pairing cited with no evidence supplied", "pairing:basil", LabelGroundedMischaracterized}, // run with llm.Evidence{}
		{"supplied fdc anchors but content needs judgment", "fdc:171077", ""},
		{"unsupplied fdc mischaracterizes", "fdc:999999", LabelGroundedMischaracterized},
		{"supplied foodon anchors, falls through", "foodon:FOODON_03411343", ""},
		{"unsupplied foodon mischaracterizes", "foodon:FOODON_00000000", LabelGroundedMischaracterized},
		{"unparseable free text falls through", "USDA says so", ""},
		{"unknown scheme falls through", "cost:garlic", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := ev
			if tc.name == "pairing cited with no evidence supplied" {
				e = llm.Evidence{}
			}
			if got := VerifyTier1(tc.source, e); got != tc.want {
				t.Errorf("VerifyTier1(%q) = %q, want %q", tc.source, got, tc.want)
			}
		})
	}
}

func TestTier1Coverage(t *testing.T) {
	claims := []Claim{
		{ClaimID: "c1", LabelTier1: LabelCorrectlyUnverified},
		{ClaimID: "c2", LabelTier1: LabelGroundedCorrect},
		{ClaimID: "c3", LabelTier1: LabelGroundedCorrect},
		{ClaimID: "c4", LabelTier1: ""}, // fell through to Tier 2
	}
	got := Tier1Coverage(claims)
	want := Tier1Summary{
		Labeled:     3,
		FellThrough: 1,
		ByLabel: map[string]int{
			LabelCorrectlyUnverified: 1,
			LabelGroundedCorrect:     2,
		},
	}
	if got.Labeled != want.Labeled || got.FellThrough != want.FellThrough {
		t.Errorf("Tier1Coverage(%d claims) = %+v, want Labeled=%d FellThrough=%d", len(claims), got, want.Labeled, want.FellThrough)
	}
	if !reflect.DeepEqual(got.ByLabel, want.ByLabel) {
		t.Errorf("Tier1Coverage.ByLabel = %v, want %v", got.ByLabel, want.ByLabel)
	}
}

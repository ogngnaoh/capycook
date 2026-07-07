package grounding

import (
	"reflect"
	"testing"
)

func strp(s string) *string { return &s }

func TestResolveHits(t *testing.T) {
	s := loadService(t)
	tests := []struct {
		name string
		in   string
		want Resolution
	}{
		{
			// direct canonical hit; ids from data/usda/nutrients.csv and
			// data/foodon/allergens.csv rows for "tomato"
			"canonical name", "tomato",
			Resolution{FDCID: strp("170457"), FoodOnID: strp("FOODON_03301453"), Canonical: "tomato"},
		},
		{
			"case space and plural", "  Tomatoes ",
			Resolution{FDCID: strp("170457"), FoodOnID: strp("FOODON_03301453"), Canonical: "tomato"},
		},
		{
			"alias", "green onion",
			Resolution{FDCID: strp("170005"), FoodOnID: strp("FOODON_00003697"), Canonical: "scallion"},
		},
		{
			"qualifiers stripped", "chopped fresh garlic",
			Resolution{FDCID: strp("169230"), FoodOnID: strp("FOODON_00003582"), Canonical: "garlic"},
		},
		{
			"qualifiers stripped then alias", "Fresh Garlic Cloves",
			Resolution{FDCID: strp("169230"), FoodOnID: strp("FOODON_00003582"), Canonical: "garlic"},
		},
		{
			"curated alias", "whipping cream",
			Resolution{FDCID: strp("170859"), FoodOnID: strp("FOODON_03310795"), Canonical: "heavy cream"},
		},
		{
			// in the universe but unmapped in FoodOn: FoodOnID stays nil
			"no foodon id", "bacon",
			Resolution{FDCID: strp("168277"), FoodOnID: nil, Canonical: "bacon"},
		},
		{
			// in the universe but absent from both id tables: resolves with
			// both ids nil (nutrition/allergen callers then fail closed)
			"no ids at all", "cajun seasoning",
			Resolution{FDCID: nil, FoodOnID: nil, Canonical: "cajun seasoning"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := s.Resolve(tt.in)
			if !ok {
				t.Fatalf("Resolve(%q) ok = false, want true", tt.in)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("Resolve(%q) =\n %s\nwant\n %s",
					tt.in, fmtResolution(got), fmtResolution(tt.want))
			}
		})
	}
}

func TestResolveMisses(t *testing.T) {
	s := loadService(t)
	for _, in := range []string{
		"dragonfruit",       // not in the universe
		"",                  // empty
		"   ",               // blank
		"fresh chopped",     // qualifiers only — nothing left after stripping
		"fresh dragonfruit", // stripping does not create a hit
	} {
		got, ok := s.Resolve(in)
		if ok {
			t.Errorf("Resolve(%q) ok = true, want false", in)
		}
		if !reflect.DeepEqual(got, Resolution{}) {
			t.Errorf("Resolve(%q) = %s, want zero Resolution", in, fmtResolution(got))
		}
	}
}

func TestResolveHandsOutFreshPointers(t *testing.T) {
	s := loadService(t)
	first, ok := s.Resolve("tomato")
	if !ok {
		t.Fatal("Resolve(tomato) missed")
	}
	*first.FDCID = "mutated"
	*first.FoodOnID = "mutated"
	second, _ := s.Resolve("tomato")
	if *second.FDCID != "170457" || *second.FoodOnID != "FOODON_03301453" {
		t.Errorf("mutating a returned Resolution leaked into the service: %s",
			fmtResolution(second))
	}
}

func TestResolveDeterministicAcrossLoads(t *testing.T) {
	a, b := loadService(t), loadService(t)
	for _, in := range []string{
		"tomato", "Tomatoes", "green onion", "chopped fresh garlic",
		"bacon", "cajun seasoning", "dragonfruit", "",
	} {
		ra, oka := a.Resolve(in)
		rb, okb := b.Resolve(in)
		if oka != okb || !reflect.DeepEqual(ra, rb) {
			t.Errorf("Resolve(%q) differs across loads: (%s, %v) vs (%s, %v)",
				in, fmtResolution(ra), oka, fmtResolution(rb), okb)
		}
	}
}

// fmtResolution renders a Resolution with pointers dereferenced for readable
// failure messages.
func fmtResolution(r Resolution) string {
	deref := func(p *string) string {
		if p == nil {
			return "<nil>"
		}
		return *p
	}
	return "{FDCID:" + deref(r.FDCID) + " FoodOnID:" + deref(r.FoodOnID) +
		" Canonical:" + r.Canonical + "}"
}

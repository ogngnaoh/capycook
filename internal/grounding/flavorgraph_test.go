package grounding

import (
	"math"
	"reflect"
	"testing"
)

// loadService builds the real Grounding from the vendored repo data files.
func loadService(t *testing.T) *Service {
	t.Helper()
	s, err := NewService(
		"../../data/flavorgraph/embeddings.csv",
		"../../data/aliases.csv",
		"../../data/usda/nutrients.csv",
		"../../data/foodon/allergens.csv",
	)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return s
}

// Expected top-10 pairings computed from data/flavorgraph/embeddings.csv by
// an independent Python oracle (unit-normalize each vector, query = mean of
// seed unit vectors, score = dot product, ties by name): see task 2.7 notes.
// Score gaps between adjacent ranks are >= 1.4e-4, far above float noise, so
// the exact order is stable.
var pairingFixtures = []struct {
	name     string
	seeds    []string
	want     []string
	topScore float64
}{
	{
		name:  "single seed tomato",
		seeds: []string{"tomato"},
		want: []string{
			"canned tuna", "cilantro", "dried basil", "turkey breast",
			"lettuce", "ground turkey", "parmesan", "onion", "parsley",
			"avocado",
		},
		topScore: 0.295794921912,
	},
	{
		name:  "two seeds garlic plus olive oil",
		seeds: []string{"garlic", "olive oil"},
		want: []string{
			"bell pepper", "pine nut", "italian seasoning",
			"red wine vinegar", "red pepper flake", "yellow squash",
			"eggplant", "shallot", "zucchini", "caper",
		},
		topScore: 0.279681660017,
	},
	{
		name:  "single seed cinnamon",
		seeds: []string{"cinnamon"},
		want: []string{
			"nutmeg", "fennel seed", "allspice", "clove", "walnut",
			"raisin", "brown sugar", "cocoa powder", "egg", "baking soda",
		},
		topScore: 0.286950203991,
	},
}

func TestSuggestKnownPairings(t *testing.T) {
	s := loadService(t)
	for _, tt := range pairingFixtures {
		t.Run(tt.name, func(t *testing.T) {
			got := s.Suggest(tt.seeds)
			names := make([]string, len(got))
			for i, p := range got {
				names[i] = p.Ingredient
			}
			if !reflect.DeepEqual(names, tt.want) {
				t.Fatalf("Suggest(%v) =\n %v\nwant\n %v", tt.seeds, names, tt.want)
			}
			if math.Abs(got[0].Score-tt.topScore) > 1e-9 {
				t.Errorf("top score = %.12f, want %.12f", got[0].Score, tt.topScore)
			}
			for i, p := range got {
				if p.Score < -1-1e-9 || p.Score > 1+1e-9 {
					t.Errorf("score %q = %v out of [-1,1]", p.Ingredient, p.Score)
				}
				if i > 0 && got[i-1].Score < p.Score {
					t.Errorf("scores not non-increasing at %d: %v < %v",
						i, got[i-1].Score, p.Score)
				}
			}
		})
	}
}

func TestSuggestNormalizesSeedNames(t *testing.T) {
	s := loadService(t)
	base := s.Suggest([]string{"tomato"})
	for _, in := range [][]string{
		{"  Tomatoes "},           // case, space, plural
		{"fresh tomato"},          // qualifier stripped
		{"tomato", "Tomatoes"},    // duplicate seed folds to one
		{"dragonfruit", "tomato"}, // unknown seed contributes nothing
	} {
		if got := s.Suggest(in); !reflect.DeepEqual(got, base) {
			t.Errorf("Suggest(%v) != Suggest([tomato]):\n got %v\nwant %v",
				in, got, base)
		}
	}
}

func TestSuggestExcludesSeedsAndCaps(t *testing.T) {
	s := loadService(t)
	seeds := []string{"garlic", "olive oil"}
	got := s.Suggest(seeds)
	if len(got) != 10 {
		t.Fatalf("len(Suggest(%v)) = %d, want 10", seeds, len(got))
	}
	seen := make(map[string]bool)
	for _, p := range got {
		if p.Ingredient == "garlic" || p.Ingredient == "olive oil" {
			t.Errorf("suggestion contains seed %q", p.Ingredient)
		}
		if seen[p.Ingredient] {
			t.Errorf("duplicate suggestion %q", p.Ingredient)
		}
		seen[p.Ingredient] = true
	}
}

func TestSuggestEveryPairingResolves(t *testing.T) {
	// The vendored embeddings are restricted to the ingredient universe so
	// every suggestion is resolvable/costable — assert that end to end.
	s := loadService(t)
	for _, tt := range pairingFixtures {
		for _, p := range s.Suggest(tt.seeds) {
			r, ok := s.Resolve(p.Ingredient)
			if !ok {
				t.Errorf("suggestion %q does not resolve", p.Ingredient)
				continue
			}
			if r.Canonical != p.Ingredient {
				t.Errorf("suggestion %q resolves to %q, want itself",
					p.Ingredient, r.Canonical)
			}
		}
	}
}

func TestSuggestUnknownOrEmptySeeds(t *testing.T) {
	s := loadService(t)
	for _, in := range [][]string{nil, {}, {"dragonfruit"}, {"", "  "}} {
		if got := s.Suggest(in); len(got) != 0 {
			t.Errorf("Suggest(%v) = %v, want empty", in, got)
		}
	}
}

func TestSuggestDeterministicAcrossLoads(t *testing.T) {
	a, b := loadService(t), loadService(t)
	for _, tt := range pairingFixtures {
		ga, gb := a.Suggest(tt.seeds), b.Suggest(tt.seeds)
		if !reflect.DeepEqual(ga, gb) {
			t.Errorf("Suggest(%v) differs across loads:\n %v\n %v",
				tt.seeds, ga, gb)
		}
	}
}

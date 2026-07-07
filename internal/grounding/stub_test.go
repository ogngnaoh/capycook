package grounding

import (
	"reflect"
	"testing"
)

func TestStubSuggest(t *testing.T) {
	tests := []struct {
		name      string
		in        []string
		wantEmpty bool
	}{
		{"known ingredient", []string{"carrot"}, false},
		{"case and space insensitive", []string{"  Carrot "}, false},
		{"unknown ingredient", []string{"dragonfruit"}, true},
		{"nil input", nil, true},
		{"mixed known and unknown", []string{"dragonfruit", "garlic"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Stub{}.Suggest(tt.in)
			if tt.wantEmpty {
				if len(got) != 0 {
					t.Fatalf("Suggest(%v) = %v, want empty", tt.in, got)
				}
				return
			}
			if len(got) == 0 {
				t.Fatalf("Suggest(%v) = empty, want pairings", tt.in)
			}
			if len(got) > 10 {
				t.Errorf("Suggest(%v) returned %d pairings, cap is 10", tt.in, len(got))
			}
			seen := make(map[string]bool)
			for _, p := range got {
				if p.Ingredient == "" {
					t.Errorf("Suggest(%v) returned pairing with empty ingredient", tt.in)
				}
				if p.Score <= 0 || p.Score > 1 {
					t.Errorf("Suggest(%v) pairing %q score %v out of (0,1]", tt.in, p.Ingredient, p.Score)
				}
				if seen[p.Ingredient] {
					t.Errorf("Suggest(%v) returned duplicate pairing %q", tt.in, p.Ingredient)
				}
				seen[p.Ingredient] = true
			}
		})
	}
}

func TestStubSuggestMergesDedupsAndCaps(t *testing.T) {
	in := []string{"carrot", "garlic", "tomato", "greek yogurt", "lemon"}
	got := Stub{}.Suggest(in)
	if len(got) > 10 {
		t.Fatalf("Suggest(%v) returned %d pairings, cap is 10", in, len(got))
	}
	count := make(map[string]int)
	for _, p := range got {
		count[p.Ingredient]++
	}
	for ing, n := range count {
		if n > 1 {
			t.Errorf("pairing %q appears %d times, want deduplicated", ing, n)
		}
	}
}

func TestStubSuggestDeterministic(t *testing.T) {
	in := []string{"carrot", "garlic"}
	a := Stub{}.Suggest(in)
	b := Stub{}.Suggest(in)
	if !reflect.DeepEqual(a, b) {
		t.Errorf("Suggest not deterministic:\n first %v\nsecond %v", a, b)
	}
}

func TestStubResolve(t *testing.T) {
	tests := []struct {
		name   string
		in     string
		wantOK bool
	}{
		{"known name", "carrot", true},
		{"alias", "carrots", true},
		{"case and space insensitive", "  Garlic ", true},
		{"unknown name", "dragonfruit", false},
		{"empty name", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := Stub{}.Resolve(tt.in)
			if ok != tt.wantOK {
				t.Fatalf("Resolve(%q) ok = %v, want %v", tt.in, ok, tt.wantOK)
			}
			if !tt.wantOK {
				if !reflect.DeepEqual(got, Resolution{}) {
					t.Errorf("Resolve(%q) = %+v, want zero Resolution on miss", tt.in, got)
				}
				return
			}
			if got.Canonical == "" {
				t.Errorf("Resolve(%q) canonical empty", tt.in)
			}
			if got.FDCID == nil || *got.FDCID == "" {
				t.Errorf("Resolve(%q) FDCID = %v, want non-empty", tt.in, got.FDCID)
			}
			if got.FoodOnID == nil || *got.FoodOnID == "" {
				t.Errorf("Resolve(%q) FoodOnID = %v, want non-empty", tt.in, got.FoodOnID)
			}
		})
	}
}

func TestStubResolveAliasMatchesPrimary(t *testing.T) {
	primary, ok1 := Stub{}.Resolve("carrot")
	alias, ok2 := Stub{}.Resolve("carrots")
	if !ok1 || !ok2 {
		t.Fatalf("expected both carrot (%v) and carrots (%v) to resolve", ok1, ok2)
	}
	if primary.Canonical != alias.Canonical {
		t.Errorf("alias canonical %q != primary canonical %q", alias.Canonical, primary.Canonical)
	}
}

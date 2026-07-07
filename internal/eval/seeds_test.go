package eval

// Tests for the plan-4.5 PROPOSED benchmark-seed draft
// (docs/01-end-to-end/proposed-benchmark-seeds.json). The draft is an
// UNRATIFIED instrument until Gate C ratifies it into eval/fixtures/; these
// tests pin its stated drafting procedure — 12–15 canonical Western seeds,
// safety-gate protein-class coverage, vegetarian + vegan + allergen-
// constrained cases, varied skill/servings, every on_hand anchor resolvable
// in the data/ universe, honest ~200-claims-across-arms arithmetic — and the
// global rail that it stays disjoint from the dev prompt-iteration seeds
// (internal/llm/testdata/dev_seeds.json).

import (
	"encoding/csv"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/grounding"
)

const (
	proposedSeedsPath = "../../docs/01-end-to-end/proposed-benchmark-seeds.json"
	devSeedsPath      = "../../internal/llm/testdata/dev_seeds.json"
)

// big9 is the frozen FDA Big-9 allergen wire enum (services big9Order /
// web BIG9_ALLERGENS) — the only values Constraints.Allergens may carry.
var big9 = map[string]bool{
	"milk": true, "eggs": true, "fish": true, "crustacean shellfish": true,
	"tree nuts": true, "peanuts": true, "wheat": true, "soybeans": true,
	"sesame": true,
}

// TestLoadSeedsWrappedShape pins the documented-draft file shape: LoadSeeds
// accepts {comment/procedure notes..., "seeds": [...]} (the dev_seeds.json
// family) alongside a bare []Seed array, and still rejects an object with no
// seeds list.
func TestLoadSeedsWrappedShape(t *testing.T) {
	dir := t.TempDir()
	wrapped := filepath.Join(dir, "wrapped.json")
	if err := os.WriteFile(wrapped, []byte(`{"comment":"doc","seeds":[{"id":"a","seed":"x"},{"id":"b","seed":"y"}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	seeds, err := LoadSeeds(wrapped)
	if err != nil {
		t.Fatalf("LoadSeeds(wrapped) = %v, want the documented-draft shape to load", err)
	}
	if len(seeds) != 2 || seeds[0].ID != "a" || seeds[1].ID != "b" {
		t.Errorf("LoadSeeds(wrapped) = %+v, want the 2 wrapped seeds", seeds)
	}
	noSeeds := filepath.Join(dir, "noseeds.json")
	if err := os.WriteFile(noSeeds, []byte(`{"comment":"doc"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadSeeds(noSeeds); err == nil {
		t.Error("LoadSeeds(object without seeds) = nil error, want error")
	}
}

// TestProposedSeedsDraft checks the committed draft against its own stated
// procedure: size, pinned-constraint hygiene, safety-gate protein-class
// coverage, the vegetarian/vegan/allergen-constrained cases, varied
// skill/servings, and on_hand resolvability in the data/ universe.
func TestProposedSeedsDraft(t *testing.T) {
	seeds, err := LoadSeeds(proposedSeedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds: %v", err)
	}
	if len(seeds) < 12 || len(seeds) > 15 {
		t.Fatalf("len(seeds) = %d, want 12-15 (plan 4.5 / PREREG §6)", len(seeds))
	}

	ground, err := grounding.NewService(
		dataPath("flavorgraph/embeddings.csv"),
		dataPath("aliases.csv"),
		dataPath("usda/nutrients.csv"),
		dataPath("foodon/allergens.csv"),
	)
	if err != nil {
		t.Fatalf("grounding.NewService: %v", err)
	}
	classes := proteinClasses(t)

	skills := map[string]bool{}
	servings := map[int]bool{}
	classCovered := map[string]bool{}
	var vegetarian, vegan, allergenConstrained bool
	for _, s := range seeds {
		if s.Constraints.Cuisine != "western" {
			t.Errorf("seed %s cuisine = %q, want western (PREREG §6 scope)", s.ID, s.Constraints.Cuisine)
		}
		switch s.Constraints.Skill {
		case "beginner", "intermediate", "advanced":
		default:
			t.Errorf("seed %s skill = %q, not in the pinned enum", s.ID, s.Constraints.Skill)
		}
		if s.Constraints.Servings < 1 {
			t.Errorf("seed %s servings = %d, want >= 1", s.ID, s.Constraints.Servings)
		}
		skills[s.Constraints.Skill] = true
		servings[s.Constraints.Servings] = true
		for _, a := range s.Constraints.Allergens {
			if !big9[a] {
				t.Errorf("seed %s allergen %q is not a Big-9 wire value", s.ID, a)
			}
		}
		if len(s.Constraints.Allergens) > 0 {
			allergenConstrained = true
		}
		for _, d := range s.Constraints.Dietary {
			switch d {
			case "vegetarian":
				vegetarian = true
			case "vegan":
				vegan = true
			}
		}
		if len(s.Constraints.OnHand) == 0 {
			t.Errorf("seed %s: on_hand must anchor the dish in the universe", s.ID)
			continue
		}
		for _, ing := range s.Constraints.OnHand {
			res, ok := ground.Resolve(ing)
			if !ok {
				t.Errorf("seed %s: on_hand %q does not resolve in the data/ingredients.csv universe", s.ID, ing)
				continue
			}
			if c := classes[strings.ToLower(res.Canonical)]; c != "" && c != "none" {
				classCovered[c] = true
			}
		}
	}
	for _, class := range []string{"poultry", "ground_meat", "whole_cut", "fish", "shellfish", "eggs"} {
		if !classCovered[class] {
			t.Errorf("no seed anchors safety-gate protein class %q (stated coverage procedure)", class)
		}
	}
	if !vegetarian {
		t.Error("no vegetarian case (stated procedure)")
	}
	if !vegan {
		t.Error("no vegan case (stated procedure)")
	}
	if !allergenConstrained {
		t.Error("no allergen-constrained case (stated procedure)")
	}
	if len(skills) < 2 {
		t.Errorf("skill not varied across the set: %v", skills)
	}
	if len(servings) < 2 {
		t.Errorf("servings not varied across the set: %v", servings)
	}
}

// TestProposedSeedsClaimArithmetic keeps the draft's expected-claim note
// honest: seeds x pinned script moves x arms must land near PREREG §6's ~200
// claims (total ACROSS arms, spec §7), and the §6 30–40-claim double-label
// window must be reachable at 15–20% of that total.
func TestProposedSeedsClaimArithmetic(t *testing.T) {
	seeds, err := LoadSeeds(proposedSeedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds: %v", err)
	}
	script, err := LoadScript(scriptPath)
	if err != nil {
		t.Fatalf("LoadScript: %v", err)
	}
	total := len(seeds) * len(script.Moves) * len(Arms)
	if total < 180 || total > 225 {
		t.Errorf("expected claims = %d seeds x %d moves x %d arms = %d, want ~200 across arms (180-225)",
			len(seeds), len(script.Moves), len(Arms), total)
	}
	lo, hi := 0.15*float64(total), 0.20*float64(total)
	if hi < 30 || lo > 40 {
		t.Errorf("15-20%% of %d claims = [%.1f, %.1f], which misses PREREG §6's 30-40 double-label window", total, lo, hi)
	}
}

// TestProposedSeedsDisjointFromDevSeeds enforces the global rail: prompt
// iteration ran only against dev_seeds.json, so the benchmark draft must
// share no id, no dish, and no on_hand anchor with it — and the draft's
// procedure note must list every dev dish verbatim and declare itself an
// unratified Gate C draft.
func TestProposedSeedsDisjointFromDevSeeds(t *testing.T) {
	bench, err := LoadSeeds(proposedSeedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds(proposed): %v", err)
	}
	dev, err := LoadSeeds(devSeedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds(dev): %v", err)
	}
	devIDs := map[string]bool{}
	devTexts := map[string]string{}
	devOnHand := map[string]string{}
	for _, d := range dev {
		devIDs[d.ID] = true
		devTexts[normText(d.Seed)] = d.ID
		for _, ing := range d.Constraints.OnHand {
			devOnHand[normText(ing)] = d.ID
		}
	}
	for _, s := range bench {
		if devIDs[s.ID] {
			t.Errorf("benchmark seed id %s collides with a dev seed id", s.ID)
		}
		if id, ok := devTexts[normText(s.Seed)]; ok {
			t.Errorf("benchmark seed %s duplicates dev dish %s (%q)", s.ID, id, s.Seed)
		}
		for _, ing := range s.Constraints.OnHand {
			if id, ok := devOnHand[normText(ing)]; ok {
				t.Errorf("benchmark seed %s shares on_hand anchor %q with dev seed %s", s.ID, ing, id)
			}
		}
	}

	raw, err := os.ReadFile(proposedSeedsPath)
	if err != nil {
		t.Fatalf("read proposed draft: %v", err)
	}
	for _, d := range dev {
		if !strings.Contains(string(raw), d.Seed) {
			t.Errorf("draft procedure note must list dev dish %q verbatim (stated disjointness procedure)", d.Seed)
		}
	}
	for _, want := range []string{"UNRATIFIED", "Gate C"} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("draft must declare itself %q", want)
		}
	}
}

// normText is the disjointness comparison key: lowercase with collapsed
// whitespace.
func normText(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}

// proteinClasses loads the safety gate's name -> protein_class table so the
// coverage assertion uses the gate's own source of truth.
func proteinClasses(t *testing.T) map[string]string {
	t.Helper()
	f, err := os.Open(dataPath("safety/protein_classes.csv"))
	if err != nil {
		t.Fatalf("open protein_classes.csv: %v", err)
	}
	defer f.Close()
	rows, err := csv.NewReader(f).ReadAll()
	if err != nil {
		t.Fatalf("read protein_classes.csv: %v", err)
	}
	classes := make(map[string]string, len(rows))
	for _, row := range rows[1:] {
		classes[row[0]] = row[1]
	}
	return classes
}

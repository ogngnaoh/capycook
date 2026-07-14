package llm

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/grounding"
)

var update = flag.Bool("update", false, "rewrite golden files under testdata/golden/")

// --- fixed fixtures (byte-exact goldens depend on these never drifting) ---

// promptDraft is the dev-03 dish (testdata/dev_seeds.json) mid-development:
// small but representative — a nil-provenance flavor claim, a resolved and an
// unresolved ingredient, a high-risk-protein step with internal_temp_c set,
// declared allergens, and populated analysis.
func promptDraft() draft.Draft {
	fdc := "175154"
	temp := 63.0
	return draft.Draft{
		Title:   "Pan-Roasted Trout with Sorrel Butter",
		Concept: "crisp-skinned trout against a sharp, grassy butter sauce",
		FlavorRationale: []draft.FlavorClaim{
			{Claim: "sorrel's acidity cuts the richness of browned butter", Provenance: nil, CuisineContext: "western"},
		},
		Ingredients: []draft.Ingredient{
			{Name: "trout fillet", FDCID: &fdc, Qty: 2, Unit: "whole"},
			{Name: "sorrel", Qty: 60, Unit: "g"},
			{Name: "butter", Qty: 45, Unit: "g"},
		},
		Steps: []draft.Step{
			{Text: "Pan-roast the trout skin-side down until the flesh is opaque.", Technique: "saute", InternalTempC: &temp, Why: "crisp skin without overcooking the flesh"},
			{Text: "Wilt the sorrel into the browned butter off the heat.", Technique: "raw", Why: "keeps the sorrel's acidity bright"},
		},
		Constraints: draft.Constraints{
			Dietary:   []string{},
			Allergens: []string{"tree nuts"},
			Equipment: []string{"skillet"},
			Skill:     "intermediate",
			Servings:  2,
			OnHand:    []string{"trout", "sorrel"},
			Cuisine:   "western",
		},
		Analysis: draft.Analysis{
			Cost: draft.CostAnalysis{TotalUSD: 9.4, PerServingUSD: 4.7, Approximate: true, Missing: []string{"sorrel"}},
			Nutrition: draft.NutritionAnalysis{
				Calories: 410, ProteinG: 32, FatG: 27, SatFatG: 12,
				CarbsG: 6, FiberG: 2, SugarG: 1, SodiumMg: 340,
				Unverified: []string{"sorrel"},
			},
		},
	}
}

func promptThread() []ThreadTurn {
	return []ThreadTurn{
		{Role: "cook", Text: "seed: pan-roasted trout with sorrel butter sauce"},
		{Role: "system", Text: "proposal accepted (seed_expand)"},
		{Role: "cook", Text: "keep the sauce light, no cream"},
	}
}

// promptEvidence builds each arm's Evidence exactly per the spec §7 matrix:
// ungrounded = empty; flavorgraph = pairings only; grounded = pairings +
// resolutions; none (normal operator use) = grounded behavior.
func promptEvidence(t *testing.T, arm string) Evidence {
	t.Helper()
	fdcTrout, foodonTrout := "175154", "FOODON_03411166"
	fdcButter := "173430"
	pairings := []grounding.Pairing{
		{Ingredient: "thyme", Score: 0.91},
		{Ingredient: "lemon", Score: 0.84},
		{Ingredient: "hazelnut", Score: 0.77},
	}
	resolutions := []grounding.Resolution{
		{FDCID: &fdcTrout, FoodOnID: &foodonTrout, Canonical: "trout"},
		{FDCID: &fdcButter, FoodOnID: nil, Canonical: "butter"},
	}
	switch arm {
	case "ungrounded":
		return Evidence{}
	case "flavorgraph":
		return Evidence{Pairings: pairings}
	case "grounded", "none":
		return Evidence{Pairings: pairings, Resolutions: resolutions}
	}
	t.Fatalf("unknown arm %q", arm)
	return Evidence{}
}

const promptSteer = "swap the butter for something brighter"

func renderFixture(t *testing.T, moveType, arm, steer string) []Message {
	t.Helper()
	msgs, err := RenderPrompt(MoveRequest{
		Draft:    promptDraft(),
		MoveType: moveType,
		Steer:    steer,
		Thread:   promptThread(),
		Evidence: promptEvidence(t, arm),
	})
	if err != nil {
		t.Fatalf("RenderPrompt(%s, %s): %v", moveType, arm, err)
	}
	return msgs
}

func checkGolden(t *testing.T, name string, got string) {
	t.Helper()
	path := filepath.Join("testdata", "golden", name)
	if *update {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir golden dir: %v", err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatalf("write golden %s: %v", path, err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden %s: %v (run `go test ./internal/llm -update` after reviewing output)", path, err)
	}
	if !bytes.Equal(want, []byte(got)) {
		t.Errorf("rendered output differs from golden %s\n--- got ---\n%s\n--- want ---\n%s", path, got, want)
	}
}

// --- golden tests: 4 arms x representative move + an iterate_feedback case ---

func TestRenderPromptGolden(t *testing.T) {
	cases := []struct {
		name     string
		moveType string
		arm      string
		steer    string
	}{
		{"ingredient_change_ungrounded", MoveTypeIngredientChange, "ungrounded", promptSteer},
		{"ingredient_change_flavorgraph", MoveTypeIngredientChange, "flavorgraph", promptSteer},
		{"ingredient_change_grounded", MoveTypeIngredientChange, "grounded", promptSteer},
		{"ingredient_change_none", MoveTypeIngredientChange, "none", promptSteer},
		{"iterate_feedback_grounded", MoveTypeIterateFeedback, "grounded", "cooked it last night — the sauce split and the skin never crisped"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msgs := renderFixture(t, tc.moveType, tc.arm, tc.steer)
			if len(msgs) != 2 {
				t.Fatalf("got %d messages, want 2 (system + user)", len(msgs))
			}
			if msgs[0].Role != "system" || msgs[1].Role != "user" {
				t.Fatalf("got roles [%s %s], want [system user]", msgs[0].Role, msgs[1].Role)
			}
			// The system prompt is byte-stable across every arm and move type
			// (cache-friendly stable prefix): all cases share one golden.
			checkGolden(t, "system.golden", msgs[0].Content)
			checkGolden(t, tc.name+".golden", msgs[1].Content)
		})
	}
}

// --- arm parity: the evidence block is the ONLY inter-arm difference ---

func TestArmParityOnlyEvidenceBlockDiffers(t *testing.T) {
	ung := renderFixture(t, MoveTypeIngredientChange, "ungrounded", promptSteer)
	gr := renderFixture(t, MoveTypeIngredientChange, "grounded", promptSteer)

	if ung[0].Content != gr[0].Content {
		t.Errorf("system prompt differs between arms — arm-parity violation")
	}

	splitEvidence := func(user string) (outside, inside string) {
		t.Helper()
		begin := strings.Index(user, evidenceBegin)
		end := strings.Index(user, evidenceEnd)
		if begin < 0 || end < 0 || end < begin {
			t.Fatalf("evidence markers not found or out of order (begin=%d end=%d)", begin, end)
		}
		return user[:begin] + user[end:], user[begin+len(evidenceBegin) : end]
	}
	ungOut, ungIn := splitEvidence(ung[1].Content)
	grOut, grIn := splitEvidence(gr[1].Content)
	if ungOut != grOut {
		t.Errorf("user message differs OUTSIDE the evidence block — arm-parity violation\n--- ungrounded ---\n%s\n--- grounded ---\n%s", ungOut, grOut)
	}
	if ungIn == grIn {
		t.Errorf("evidence block identical across arms — fixture is not exercising the arm split")
	}
}

// --- cache ordering: stable prefix (draft) before volatile suffix (thread, steer) ---

func TestCacheOrderingSteerAfterDraft(t *testing.T) {
	msgs := renderFixture(t, MoveTypeIngredientChange, "grounded", promptSteer)
	user := msgs[1].Content

	idxDraft := strings.Index(user, `"title": "Pan-Roasted Trout with Sorrel Butter"`)
	idxEvidence := strings.Index(user, evidenceBegin)
	idxThread := strings.Index(user, "keep the sauce light, no cream")
	idxSteer := strings.Index(user, promptSteer)
	for name, idx := range map[string]int{"draft": idxDraft, "evidence": idxEvidence, "thread": idxThread, "steer": idxSteer} {
		if idx < 0 {
			t.Fatalf("%s section not found in user message", name)
		}
	}
	if !(idxDraft < idxEvidence && idxEvidence < idxThread && idxThread < idxSteer) {
		t.Errorf("cache ordering violated: want draft(%d) < evidence(%d) < thread(%d) < steer(%d)",
			idxDraft, idxEvidence, idxThread, idxSteer)
	}
}

// The json_object fallback mode documents that the word "json" must appear in
// the prompt — the same prompt pack must satisfy it.
func TestPromptContainsWordJSON(t *testing.T) {
	msgs := renderFixture(t, MoveTypeIngredientChange, "ungrounded", "")
	joined := strings.ToLower(msgs[0].Content + msgs[1].Content)
	if !strings.Contains(joined, "json") {
		t.Errorf("prompt never mentions \"json\" — json_object fallback mode requires it")
	}
}

// --- system prompt lists every high-risk protein class from the safety data ---

func TestSystemPromptListsHighRiskClassesFromCSV(t *testing.T) {
	f, err := os.Open(filepath.Join("..", "..", "data", "safety", "min_temps.csv"))
	if err != nil {
		t.Fatalf("open min_temps.csv: %v", err)
	}
	defer f.Close()
	rows, err := csv.NewReader(f).ReadAll()
	if err != nil {
		t.Fatalf("parse min_temps.csv: %v", err)
	}
	if len(rows) < 2 {
		t.Fatalf("min_temps.csv has no data rows")
	}

	msgs := renderFixture(t, MoveTypeIngredientChange, "ungrounded", "")
	sys := strings.ToLower(msgs[0].Content)
	for _, row := range rows[1:] {
		class, tempC := row[0], row[1]
		line := strings.ToLower(fmt.Sprintf("- %s: %s °c", strings.ReplaceAll(class, "_", " "), tempC))
		if !strings.Contains(sys, line) {
			t.Errorf("system prompt missing high-risk class line %q (from data/safety/min_temps.csv)", line)
		}
	}
}

// --- system prompt pins the machine-checkable provenance vocabulary ---

func TestSystemPromptPinsProvenanceVocabulary(t *testing.T) {
	msgs, err := RenderPrompt(MoveRequest{Draft: promptDraft(), MoveType: MoveTypeFlavorDirection})
	if err != nil {
		t.Fatal(err)
	}
	sys := msgs[0].Content
	for _, want := range []string{"pairing:", "fdc:", "foodon:", "provenance"} {
		if !strings.Contains(sys, want) {
			t.Errorf("system prompt missing provenance-vocabulary token %q", want)
		}
	}
}

// --- steering thread is truncated to the last 50 turns ---

func TestThreadTruncatedToLast50(t *testing.T) {
	turns := make([]ThreadTurn, 60)
	for i := range turns {
		turns[i] = ThreadTurn{Role: "cook", Text: fmt.Sprintf("turn-%02d", i)}
	}
	msgs, err := RenderPrompt(MoveRequest{
		Draft:    promptDraft(),
		MoveType: MoveTypeIngredientChange,
		Thread:   turns,
		Evidence: Evidence{},
	})
	if err != nil {
		t.Fatalf("RenderPrompt: %v", err)
	}
	user := msgs[1].Content
	if strings.Contains(user, "turn-09") {
		t.Errorf("turn-09 rendered — thread not truncated to the last 50 turns")
	}
	for _, want := range []string{"turn-10", "turn-59"} {
		if !strings.Contains(user, want) {
			t.Errorf("%s missing — truncation dropped a turn inside the last 50", want)
		}
	}
}

// --- deterministic move types never reach the model ---

func TestRenderPromptRejectsNonGenerativeMoves(t *testing.T) {
	for _, mt := range []string{
		MoveTypeScaleServings, MoveTypeUnitConvert,
		MoveTypeCostRecompute, MoveTypeNutritionRecompute, "bogus",
	} {
		if _, err := RenderPrompt(MoveRequest{Draft: promptDraft(), MoveType: mt}); err == nil {
			t.Errorf("RenderPrompt(%q) succeeded, want error — deterministic/unknown moves must not render a prompt", mt)
		}
	}
}

// --- dev seeds: valid, 3-5 dishes, labeled dev-only/disjoint ---

func TestDevSeedsFixture(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "dev_seeds.json"))
	if err != nil {
		t.Fatalf("read dev_seeds.json: %v", err)
	}
	var file struct {
		Comment string `json:"comment"`
		Seeds   []struct {
			ID          string            `json:"id"`
			Seed        string            `json:"seed"`
			Constraints draft.Constraints `json:"constraints"`
		} `json:"seeds"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&file); err != nil {
		t.Fatalf("decode dev_seeds.json: %v", err)
	}

	lc := strings.ToLower(file.Comment)
	for _, want := range []string{"dev", "disjoint", "benchmark"} {
		if !strings.Contains(lc, want) {
			t.Errorf("comment must label the file as dev-only and disjoint from benchmark seeds; missing %q", want)
		}
	}
	if n := len(file.Seeds); n < 3 || n > 5 {
		t.Fatalf("got %d seeds, want 3-5", n)
	}

	big9 := map[string]bool{
		"milk": true, "eggs": true, "fish": true, "crustacean shellfish": true,
		"tree nuts": true, "peanuts": true, "wheat": true, "soybeans": true, "sesame": true,
	}
	skills := map[string]bool{"beginner": true, "intermediate": true, "advanced": true}
	ids := map[string]bool{}
	for _, s := range file.Seeds {
		if s.ID == "" || s.Seed == "" {
			t.Errorf("seed %+v: id and seed text must be non-empty", s)
		}
		if ids[s.ID] {
			t.Errorf("duplicate seed id %q", s.ID)
		}
		ids[s.ID] = true
		if s.Constraints.Cuisine != "western" {
			t.Errorf("seed %s: cuisine %q, want \"western\" (v0 enum)", s.ID, s.Constraints.Cuisine)
		}
		if !skills[s.Constraints.Skill] {
			t.Errorf("seed %s: skill %q not in beginner|intermediate|advanced", s.ID, s.Constraints.Skill)
		}
		if s.Constraints.Servings < 1 {
			t.Errorf("seed %s: servings %d, want >= 1", s.ID, s.Constraints.Servings)
		}
		for _, a := range s.Constraints.Allergens {
			if !big9[a] {
				t.Errorf("seed %s: allergen %q not an FDA Big-9 enum value", s.ID, a)
			}
		}
	}
}

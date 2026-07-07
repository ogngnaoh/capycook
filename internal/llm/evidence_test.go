package llm

import (
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/grounding"
)

// evidenceGrounding is a recording fake Grounding: canned pairings, a
// two-entry resolution table, and call logs so the tests can assert exactly
// which grounding components each arm consults (spec §7 matrix).
type evidenceGrounding struct {
	suggestCalls [][]string
	resolveCalls []string
}

var _ grounding.Grounding = (*evidenceGrounding)(nil)

var evidencePairings = []grounding.Pairing{
	{Ingredient: "cumin", Score: 0.92},
	{Ingredient: "thyme", Score: 0.88},
}

func (g *evidenceGrounding) Suggest(ingredients []string) []grounding.Pairing {
	g.suggestCalls = append(g.suggestCalls, append([]string(nil), ingredients...))
	return append([]grounding.Pairing(nil), evidencePairings...)
}

func (g *evidenceGrounding) Resolve(name string) (grounding.Resolution, bool) {
	g.resolveCalls = append(g.resolveCalls, name)
	switch name {
	case "carrot":
		fdc, foodon := "fdc-2258586", "FOODON_03411343"
		return grounding.Resolution{FDCID: &fdc, FoodOnID: &foodon, Canonical: "carrot, raw"}, true
	case "olive oil":
		fdc := "fdc-1750351"
		return grounding.Resolution{FDCID: &fdc, Canonical: "oil, olive, extra virgin"}, true
	}
	return grounding.Resolution{}, false
}

// evidenceDraft has two resolvable ingredients, one unresolvable one, and a
// duplicate — enough to exercise resolved-only filtering and entity dedupe.
func evidenceDraft() draft.Draft {
	return draft.Draft{
		Ingredients: []draft.Ingredient{
			{Name: "carrot", Qty: 500, Unit: "g"},
			{Name: "olive oil", Qty: 30, Unit: "ml"},
			{Name: "dragonfruit", Qty: 1, Unit: "whole"},
			{Name: "carrot", Qty: 100, Unit: "g"},
		},
	}
}

// evidenceNames is evidenceDraft's ingredient names in draft order.
var evidenceNames = []string{"carrot", "olive oil", "dragonfruit", "carrot"}

func TestBuildEvidenceUngrounded(t *testing.T) {
	g := &evidenceGrounding{}
	ev := BuildEvidence(ArmUngrounded, evidenceDraft(), g)
	if len(ev.Pairings) != 0 || len(ev.Resolutions) != 0 {
		t.Errorf("ungrounded evidence = %+v, want empty", ev)
	}
	if len(g.suggestCalls) != 0 || len(g.resolveCalls) != 0 {
		t.Errorf("ungrounded arm consulted grounding: suggest %v, resolve %v",
			g.suggestCalls, g.resolveCalls)
	}
}

func TestBuildEvidenceFlavorgraph(t *testing.T) {
	g := &evidenceGrounding{}
	ev := BuildEvidence(ArmFlavorgraph, evidenceDraft(), g)
	if !reflect.DeepEqual(ev.Pairings, evidencePairings) {
		t.Errorf("pairings = %+v, want %+v", ev.Pairings, evidencePairings)
	}
	if ev.Resolutions != nil {
		t.Errorf("flavorgraph arm must carry no resolutions, got %+v", ev.Resolutions)
	}
	if !reflect.DeepEqual(g.suggestCalls, [][]string{evidenceNames}) {
		t.Errorf("Suggest calls = %v, want one call with %v", g.suggestCalls, evidenceNames)
	}
	if len(g.resolveCalls) != 0 {
		t.Errorf("flavorgraph arm consulted the resolver: %v", g.resolveCalls)
	}
}

func TestBuildEvidenceGrounded(t *testing.T) {
	g := &evidenceGrounding{}
	ev := BuildEvidence(ArmGrounded, evidenceDraft(), g)
	if !reflect.DeepEqual(ev.Pairings, evidencePairings) {
		t.Errorf("pairings = %+v, want %+v", ev.Pairings, evidencePairings)
	}
	if !reflect.DeepEqual(g.suggestCalls, [][]string{evidenceNames}) {
		t.Errorf("Suggest calls = %v, want one call with %v", g.suggestCalls, evidenceNames)
	}
	if !reflect.DeepEqual(g.resolveCalls, evidenceNames) {
		t.Errorf("Resolve calls = %v, want per-ingredient %v", g.resolveCalls, evidenceNames)
	}
	fdcCarrot, foodonCarrot := "fdc-2258586", "FOODON_03411343"
	fdcOil := "fdc-1750351"
	want := []grounding.Resolution{
		{FDCID: &fdcCarrot, FoodOnID: &foodonCarrot, Canonical: "carrot, raw"},
		{FDCID: &fdcOil, Canonical: "oil, olive, extra virgin"},
	}
	if !reflect.DeepEqual(ev.Resolutions, want) {
		t.Errorf("resolutions = %+v, want %+v (resolved entries only, deduped)", ev.Resolutions, want)
	}
}

// TestBuildEvidenceNoneIsGroundedBehavior: arm "none" is normal operator use
// — the grounding toggle is an eval construct, so operators get the full
// grounded assembly (spec §4 rule); only the event stamp differs.
func TestBuildEvidenceNoneIsGroundedBehavior(t *testing.T) {
	gNone, gGrounded := &evidenceGrounding{}, &evidenceGrounding{}
	evNone := BuildEvidence(ArmNone, evidenceDraft(), gNone)
	evGrounded := BuildEvidence(ArmGrounded, evidenceDraft(), gGrounded)
	if !reflect.DeepEqual(evNone, evGrounded) {
		t.Errorf("arm none evidence = %+v, want grounded behavior %+v", evNone, evGrounded)
	}
	if !reflect.DeepEqual(gNone, gGrounded) {
		t.Errorf("arm none call pattern %+v differs from grounded %+v", gNone, gGrounded)
	}
}

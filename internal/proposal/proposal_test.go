package proposal

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// Op must be a type alias of draft.Op (locked decision from task 1.2), so a
// []Op is usable wherever draft.Apply expects []draft.Op with no conversion.
var _ draft.Op = Op{}

func TestProposalJSONWireShape(t *testing.T) {
	p := Proposal{
		ID:           "prop-1",
		MoveID:       "move-1",
		MoveType:     "ingredient_change",
		TargetFields: []string{"ingredients"},
		Change: []Op{
			{Op: "replace", Path: "/ingredients/0/qty", Value: rm(`250`), From: rm(`500`)},
		},
		Rationale:     "halve the carrots so the char stays even",
		Citations:     []Citation{{Source: "usda_fdc", Ref: "fdc-2258586", Date: "2026-04-24"}},
		Confidence:    0.8,
		Unverified:    []string{"yogurt acidity balances the char"},
		Safety:        Safety{Status: "pass", Reasons: []string{}, RuleIDs: []string{}},
		SuggestedNext: []string{"technique_step", "cost_recompute"},
	}
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("Unmarshal into map: %v", err)
	}
	for _, key := range []string{
		"id", "move_id", "move_type", "target_fields", "change", "rationale",
		"citations", "confidence", "unverified", "safety", "suggested_next",
	} {
		if _, ok := m[key]; !ok {
			t.Errorf("top-level key %q missing", key)
		}
	}

	cit := m["citations"].([]any)[0].(map[string]any)
	for _, key := range []string{"source", "ref", "date"} {
		if _, ok := cit[key]; !ok {
			t.Errorf("citation key %q missing", key)
		}
	}

	safety := m["safety"].(map[string]any)
	for _, key := range []string{"status", "reasons", "rule_ids"} {
		if _, ok := safety[key]; !ok {
			t.Errorf("safety key %q missing", key)
		}
	}

	op := m["change"].([]any)[0].(map[string]any)
	if op["op"] != "replace" || op["path"] != "/ingredients/0/qty" {
		t.Errorf("change wire shape wrong: %v", op)
	}
	if op["from"] != 500.0 || op["value"] != 250.0 {
		t.Errorf("change from/value wrong: %v", op)
	}
}

func TestProposalJSONRoundTrip(t *testing.T) {
	orig := Proposal{
		ID:            "prop-2",
		MoveID:        "move-2",
		MoveType:      "technique_step",
		TargetFields:  []string{"steps"},
		Change:        []Op{{Op: "remove", Path: "/steps/1"}},
		Rationale:     "drop the redundant rest step",
		Citations:     []Citation{},
		Confidence:    1.0,
		Unverified:    []string{},
		Safety:        Safety{Status: "blocked", Reasons: []string{"anaerobic garlic-in-oil"}, RuleIDs: []string{"anaerobic-garlic-oil"}},
		SuggestedNext: []string{},
	}
	raw, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var got Proposal
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if !reflect.DeepEqual(got, orig) {
		t.Fatalf("round-trip mismatch:\ngot  %+v\nwant %+v", got, orig)
	}
}

func TestTargetFields(t *testing.T) {
	tests := []struct {
		name string
		ops  []Op
		want []string
	}{
		{"no ops", nil, nil},
		{"single scalar", []Op{{Op: "replace", Path: "/title"}}, []string{"title"}},
		{"nested path yields top-level field", []Op{{Op: "replace", Path: "/ingredients/0/qty"}}, []string{"ingredients"}},
		{"append token", []Op{{Op: "add", Path: "/steps/-"}}, []string{"steps"}},
		{
			"dedup preserves first-touched order",
			[]Op{
				{Op: "replace", Path: "/steps/0/technique"},
				{Op: "replace", Path: "/title"},
				{Op: "remove", Path: "/steps/1"},
				{Op: "add", Path: "/ingredients/-"},
			},
			[]string{"steps", "title", "ingredients"},
		},
		{"whole-document op skipped", []Op{{Op: "replace", Path: ""}}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := TargetFields(tt.ops)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("TargetFields(%v) = %v, want %v", tt.ops, got, tt.want)
			}
		})
	}
}

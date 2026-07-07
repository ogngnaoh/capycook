package llm

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

func parsedSchema(t *testing.T) map[string]any {
	t.Helper()
	var schema map[string]any
	if err := json.Unmarshal([]byte(proposalSchemaJSON), &schema); err != nil {
		t.Fatalf("proposalSchemaJSON is not valid JSON: %v", err)
	}
	return schema
}

// walkObjects visits every schema node and calls fn on each object node.
func walkObjects(t *testing.T, path string, node map[string]any, fn func(path string, obj map[string]any)) {
	t.Helper()
	if node["type"] == "object" {
		fn(path, node)
	}
	if props, ok := node["properties"].(map[string]any); ok {
		for name, sub := range props {
			if m, ok := sub.(map[string]any); ok {
				walkObjects(t, path+"/"+name, m, fn)
			}
		}
	}
	if items, ok := node["items"].(map[string]any); ok {
		walkObjects(t, path+"/items", items, fn)
	}
	if anyOf, ok := node["anyOf"].([]any); ok {
		for i, sub := range anyOf {
			if m, ok := sub.(map[string]any); ok {
				walkObjects(t, path+"/anyOf", m, fn)
			}
			_ = i
		}
	}
}

// TestProposalSchemaStrictShape: every object node in the tool schema obeys
// the verified /beta strict-mode contract — ALL properties required and
// additionalProperties:false (api-docs.deepseek.com, fetched 2026-07-07).
func TestProposalSchemaStrictShape(t *testing.T) {
	schema := parsedSchema(t)
	seen := 0
	walkObjects(t, "", schema, func(path string, obj map[string]any) {
		seen++
		if ap, ok := obj["additionalProperties"].(bool); !ok || ap {
			t.Errorf("%s: additionalProperties = %v, want false", path, obj["additionalProperties"])
		}
		props, ok := obj["properties"].(map[string]any)
		if !ok {
			t.Errorf("%s: object node without properties", path)
			return
		}
		var want []string
		for name := range props {
			want = append(want, name)
		}
		sort.Strings(want)
		rawReq, ok := obj["required"].([]any)
		if !ok {
			t.Errorf("%s: object node without required", path)
			return
		}
		var got []string
		for _, r := range rawReq {
			got = append(got, r.(string))
		}
		sort.Strings(got)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s: required = %v, want every property %v", path, got, want)
		}
	})
	if seen < 10 {
		t.Fatalf("walked only %d object nodes — schema walk is broken", seen)
	}
}

// jsonTags returns the json field names of a struct type, in field order.
func jsonTags(t *testing.T, typ reflect.Type) []string {
	t.Helper()
	var tags []string
	for i := 0; i < typ.NumField(); i++ {
		tag := typ.Field(i).Tag.Get("json")
		name := strings.Split(tag, ",")[0]
		if name == "" || name == "-" {
			t.Fatalf("%s.%s has no usable json tag", typ.Name(), typ.Field(i).Name)
		}
		tags = append(tags, name)
	}
	sort.Strings(tags)
	return tags
}

func schemaNode(t *testing.T, schema map[string]any, path ...string) map[string]any {
	t.Helper()
	node := schema
	for _, p := range path {
		next, ok := node[p].(map[string]any)
		if !ok {
			t.Fatalf("schema path %v: %q missing or not an object", path, p)
		}
		node = next
	}
	return node
}

func propertyNames(t *testing.T, node map[string]any) []string {
	t.Helper()
	props, ok := node["properties"].(map[string]any)
	if !ok {
		t.Fatalf("node has no properties")
	}
	var names []string
	for n := range props {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// TestProposalSchemaMirrorsGoTypes: the tool schema's property sets mirror
// the pinned Go wire types exactly, so schema and decoder can never drift.
func TestProposalSchemaMirrorsGoTypes(t *testing.T) {
	schema := parsedSchema(t)
	cases := []struct {
		name string
		node map[string]any
		typ  reflect.Type
	}{
		{"moveOutput", schema, reflect.TypeOf(moveOutput{})},
		{"Draft", schemaNode(t, schema, "properties", "draft"), reflect.TypeOf(draft.Draft{})},
		{"Ingredient", schemaNode(t, schema, "properties", "draft", "properties", "ingredients", "items"), reflect.TypeOf(draft.Ingredient{})},
		{"Step", schemaNode(t, schema, "properties", "draft", "properties", "steps", "items"), reflect.TypeOf(draft.Step{})},
		{"FlavorClaim", schemaNode(t, schema, "properties", "draft", "properties", "flavor_rationale", "items"), reflect.TypeOf(draft.FlavorClaim{})},
		{"Constraints", schemaNode(t, schema, "properties", "draft", "properties", "constraints"), reflect.TypeOf(draft.Constraints{})},
		{"Analysis", schemaNode(t, schema, "properties", "draft", "properties", "analysis"), reflect.TypeOf(draft.Analysis{})},
		{"CostAnalysis", schemaNode(t, schema, "properties", "draft", "properties", "analysis", "properties", "cost"), reflect.TypeOf(draft.CostAnalysis{})},
		{"NutritionAnalysis", schemaNode(t, schema, "properties", "draft", "properties", "analysis", "properties", "nutrition"), reflect.TypeOf(draft.NutritionAnalysis{})},
		{"Citation", schemaNode(t, schema, "properties", "citations", "items"), reflect.TypeOf(proposal.Citation{})},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := propertyNames(t, tc.node)
			want := jsonTags(t, tc.typ)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("schema properties = %v, want Go json tags %v", got, want)
			}
		})
	}
}

// TestProposalSchemaNullableFields: the four nullable fields use type
// unions including "null" (per the verified /beta schema-type support).
func TestProposalSchemaNullableFields(t *testing.T) {
	schema := parsedSchema(t)
	cases := []struct {
		field string
		path  []string
		want  []any
	}{
		{"fdc_id", []string{"properties", "draft", "properties", "ingredients", "items", "properties", "fdc_id"}, []any{"string", "null"}},
		{"foodon_id", []string{"properties", "draft", "properties", "ingredients", "items", "properties", "foodon_id"}, []any{"string", "null"}},
		{"internal_temp_c", []string{"properties", "draft", "properties", "steps", "items", "properties", "internal_temp_c"}, []any{"number", "null"}},
		{"provenance", []string{"properties", "draft", "properties", "flavor_rationale", "items", "properties", "provenance"}, []any{"string", "null"}},
	}
	for _, tc := range cases {
		t.Run(tc.field, func(t *testing.T) {
			node := schemaNode(t, schema, tc.path...)
			if !reflect.DeepEqual(node["type"], tc.want) {
				t.Fatalf("type = %v, want %v", node["type"], tc.want)
			}
		})
	}
}

// TestProposalSchemaEnums: the enums the prompt references are enforced in
// the schema itself.
func TestProposalSchemaEnums(t *testing.T) {
	schema := parsedSchema(t)

	next := schemaNode(t, schema, "properties", "suggested_next", "items")
	if enum, ok := next["enum"].([]any); !ok || len(enum) != 9 {
		t.Fatalf("suggested_next enum = %v, want the 9 move types", next["enum"])
	}
	technique := schemaNode(t, schema, "properties", "draft", "properties", "steps", "items", "properties", "technique")
	if enum, ok := technique["enum"].([]any); !ok || len(enum) != 14 {
		t.Fatalf("technique enum = %v, want the 14 techniques", technique["enum"])
	}
	skill := schemaNode(t, schema, "properties", "draft", "properties", "constraints", "properties", "skill")
	if enum, ok := skill["enum"].([]any); !ok || len(enum) != 3 {
		t.Fatalf("skill enum = %v, want beginner|intermediate|advanced", skill["enum"])
	}
}

// TestProposalToolStrict: the assembled tool definition is strict and named.
func TestProposalToolStrict(t *testing.T) {
	tool := proposalTool()
	if tool.Function == nil {
		t.Fatal("tool has no function")
	}
	if tool.Function.Name != proposalToolName {
		t.Fatalf("tool name = %q, want %q", tool.Function.Name, proposalToolName)
	}
	if !tool.Function.Strict {
		t.Fatal("tool is not strict:true — the /beta strict contract requires it")
	}
}

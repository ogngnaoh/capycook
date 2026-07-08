package llm

import (
	"encoding/json"

	openai "github.com/sashabaranov/go-openai"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// The strict tool-calling contract (SPEC §4c; verified against live
// api-docs.deepseek.com 2026-07-07): one function whose parameters schema
// mirrors the complete Draft plus rationale/citations/confidence/
// unverified/suggested_next. /beta strict mode requires strict:true, EVERY
// property listed in required, and additionalProperties:false on every
// object node; nullable fields use type unions per the verified schema-type
// support (object/string/number/integer/boolean/array/enum/anyOf + $ref).
// The model returns the FULL revised draft — never ops; Go computes the
// diff (proposal.ComputeDiff).

// proposalToolName is the single forced function name.
const proposalToolName = "propose_move"

// moveOutput is the wire shape of the tool arguments (and of the
// json_object fallback content) — decoded with DisallowUnknownFields.
type moveOutput struct {
	Draft         draft.Draft         `json:"draft"`
	Rationale     string              `json:"rationale"`
	Citations     []proposal.Citation `json:"citations"`
	Confidence    float64             `json:"confidence"`
	Unverified    []string            `json:"unverified"`
	SuggestedNext []string            `json:"suggested_next"`
}

// proposalSchemaJSON is the strict parameters schema, kept in lockstep with
// the Go wire types by schema_test.go's reflection mirror test.
const proposalSchemaJSON = `{
  "type": "object",
  "properties": {
    "draft": {
      "type": "object",
      "description": "The FULL revised dish draft: every field populated, unchanged parts carried over verbatim from the current draft.",
      "properties": {
        "title": {"type": "string"},
        "concept": {"type": "string"},
        "flavor_rationale": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "claim": {"type": "string"},
              "provenance": {"type": ["string", "null"], "description": "null, or exactly one of: pairing:<ingredient> | fdc:<fdc_id> | foodon:<foodon_id>, copied from supplied evidence"},
              "cuisine_context": {"type": "string"}
            },
            "required": ["claim", "provenance", "cuisine_context"],
            "additionalProperties": false
          }
        },
        "ingredients": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {"type": "string"},
              "fdc_id": {"type": ["string", "null"]},
              "foodon_id": {"type": ["string", "null"]},
              "qty": {"type": "number"},
              "unit": {"type": "string"}
            },
            "required": ["name", "fdc_id", "foodon_id", "qty", "unit"],
            "additionalProperties": false
          }
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {"type": "string"},
              "technique": {
                "type": "string",
                "enum": ["saute", "roast", "boil", "simmer", "bake", "grill", "fry", "raw", "cure", "ferment", "can", "infuse_oil", "sous_vide", "other"]
              },
              "internal_temp_c": {
                "type": ["number", "null"],
                "description": "REQUIRED (non-null) for any step cooking a high-risk protein."
              },
              "why": {"type": "string"}
            },
            "required": ["text", "technique", "internal_temp_c", "why"],
            "additionalProperties": false
          }
        },
        "constraints": {
          "type": "object",
          "properties": {
            "dietary": {"type": "array", "items": {"type": "string"}},
            "allergens": {"type": "array", "items": {"type": "string"}},
            "equipment": {"type": "array", "items": {"type": "string"}},
            "skill": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
            "servings": {"type": "integer"},
            "on_hand": {"type": "array", "items": {"type": "string"}},
            "cuisine": {"type": "string"}
          },
          "required": ["dietary", "allergens", "equipment", "skill", "servings", "on_hand", "cuisine"],
          "additionalProperties": false
        },
        "analysis": {
          "type": "object",
          "description": "Deterministically computed by the system. Carry the current draft's analysis through UNCHANGED.",
          "properties": {
            "cost": {
              "type": "object",
              "properties": {
                "total_usd": {"type": "number"},
                "per_serving_usd": {"type": "number"},
                "approximate": {"type": "boolean"},
                "missing": {"type": "array", "items": {"type": "string"}}
              },
              "required": ["total_usd", "per_serving_usd", "approximate", "missing"],
              "additionalProperties": false
            },
            "nutrition": {
              "type": "object",
              "properties": {
                "calories": {"type": "number"},
                "protein_g": {"type": "number"},
                "fat_g": {"type": "number"},
                "sat_fat_g": {"type": "number"},
                "carbs_g": {"type": "number"},
                "fiber_g": {"type": "number"},
                "sugar_g": {"type": "number"},
                "sodium_mg": {"type": "number"},
                "unverified": {"type": "array", "items": {"type": "string"}}
              },
              "required": ["calories", "protein_g", "fat_g", "sat_fat_g", "carbs_g", "fiber_g", "sugar_g", "sodium_mg", "unverified"],
              "additionalProperties": false
            }
          },
          "required": ["cost", "nutrition"],
          "additionalProperties": false
        }
      },
      "required": ["title", "concept", "flavor_rationale", "ingredients", "steps", "constraints", "analysis"],
      "additionalProperties": false
    },
    "rationale": {
      "type": "string",
      "description": "Prose explanation of what the move changes and why."
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {"type": "string"},
          "ref": {"type": "string"},
          "date": {"type": "string"}
        },
        "required": ["source", "ref", "date"],
        "additionalProperties": false
      }
    },
    "confidence": {"type": "number"},
    "unverified": {"type": "array", "items": {"type": "string"}},
    "suggested_next": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["seed_expand", "flavor_direction", "ingredient_change", "technique_step", "iterate_feedback", "scale_servings", "unit_convert", "cost_recompute", "nutrition_recompute"]
      }
    }
  },
  "required": ["draft", "rationale", "citations", "confidence", "unverified", "suggested_next"],
  "additionalProperties": false
}`

// proposalTool assembles the single strict tool the client forces via
// tool_choice.
func proposalTool() openai.Tool {
	return openai.Tool{
		Type: openai.ToolTypeFunction,
		Function: &openai.FunctionDefinition{
			Name:        proposalToolName,
			Description: "Propose exactly one bounded move: the full revised dish draft plus rationale, citations, confidence, unverified claims, and suggested next moves.",
			Strict:      true,
			Parameters:  json.RawMessage(proposalSchemaJSON),
		},
	}
}

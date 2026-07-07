// Package proposal holds the Proposal contract — the unit of work a move
// emits for the human gate (DESIGN §8.2) — and the canonical structured
// diff against the current draft version (P0-A; SPEC §3). The LLM emits a
// complete proposed Draft; Go owns the diff (spec §4).
package proposal

import (
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// Op is one RFC-6902-style patch operation. It is a type alias of draft.Op
// (locked decision from task 1.2): draft carries no dependency on proposal,
// and a []Op feeds draft.Apply with no conversion.
type Op = draft.Op

// Citation is one provenance reference attached to a proposal
// (wire shape citations[{source, ref, date}], spec §4).
type Citation struct {
	Source string `json:"source"`
	Ref    string `json:"ref"`
	Date   string `json:"date"`
}

// Safety is the deterministic safety-gate verdict carried by a proposal
// (DESIGN §8.7). Blocked proposals never reach the cook.
type Safety struct {
	Status  string   `json:"status"` // pass|blocked
	Reasons []string `json:"reasons"`
	RuleIDs []string `json:"rule_ids"`
}

// Proposal is the full DESIGN §8.2 shape: what a move emits and the gate
// renders as an actionable diff.
type Proposal struct {
	ID            string     `json:"id"`
	MoveID        string     `json:"move_id"`
	MoveType      string     `json:"move_type"`
	TargetFields  []string   `json:"target_fields"`
	Change        []Op       `json:"change"`
	Rationale     string     `json:"rationale"`
	Citations     []Citation `json:"citations"`
	Confidence    float64    `json:"confidence"` // deterministic moves: 1.0
	Unverified    []string   `json:"unverified"`
	Safety        Safety     `json:"safety"`
	SuggestedNext []string   `json:"suggested_next"`
}

// TargetFields derives Proposal.TargetFields from a change set: the
// top-level Draft fields the ops touch, deduplicated, in first-touched
// order. Whole-document ops (empty pointer) name no field and are skipped.
func TargetFields(ops []Op) []string {
	var fields []string
	seen := make(map[string]bool)
	for _, op := range ops {
		tok, ok := strings.CutPrefix(op.Path, "/")
		if !ok {
			continue // empty pointer: whole document
		}
		if i := strings.IndexByte(tok, '/'); i >= 0 {
			tok = tok[:i]
		}
		field := unescapeToken(tok)
		if !seen[field] {
			seen[field] = true
			fields = append(fields, field)
		}
	}
	return fields
}

// unescapeToken reverses RFC-6901 escaping: ~1 => /, then ~0 => ~.
func unescapeToken(tok string) string {
	tok = strings.ReplaceAll(tok, "~1", "/")
	return strings.ReplaceAll(tok, "~0", "~")
}

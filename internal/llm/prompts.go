package llm

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
	"text/template"
)

// The prompt pack is git-versioned template data (spec §7): the renderer
// below assembles it cache-friendly — a byte-stable system prompt, then a
// user message ordered stable-to-volatile: current draft JSON + constraints
// first, grounding evidence, then the steering thread and finally the steer.
// The evidence block is rendered by evidence.tmpl alone and is the ONLY
// region allowed to differ between eval arms (arm-parity rule); Go wraps it
// in the evidenceBegin/evidenceEnd markers so tests can prove that. The
// thread is rebuilt from move_requested/gate_* events and never includes
// rejected proposals (R2).

//go:embed prompts/*.tmpl
var promptFS embed.FS

// Message is one rendered chat message: the role/content pair of an
// OpenAI-style chat message, so the DeepSeek client can map it 1:1 onto
// openai.ChatCompletionMessage without re-parsing.
type Message struct {
	Role    string // system|user
	Content string
}

const (
	// maxThreadTurns caps the rendered steering thread (spec §7: last 50).
	maxThreadTurns = 50

	// evidenceBegin/evidenceEnd delimit the arm-dependent evidence block —
	// the only inter-arm varying region of the whole prompt.
	evidenceBegin = "[BEGIN ARM-DEPENDENT EVIDENCE]"
	evidenceEnd   = "[END ARM-DEPENDENT EVIDENCE]"
)

var promptTemplates = template.Must(template.New("prompts").Funcs(template.FuncMap{
	"orNull": func(p *string) string {
		if p == nil {
			return "null"
		}
		return *p
	},
}).ParseFS(promptFS, "prompts/*.tmpl"))

// moveDirectives is the per-move-type instruction rendered into the move
// request section. Only generative move types have prompts: deterministic
// moves (scale/convert/recompute) are computed by services and never reach
// the model.
var moveDirectives = map[string]string{
	MoveTypeSeedExpand: "Expand the current draft into a complete first version of the dish: " +
		"a title and concept if missing, a workable ingredient list with quantities and units, " +
		"ordered steps each with a technique from the schema enum and a why, and flavor_rationale " +
		"entries for the key pairings. Stay strictly inside the hard constraints.",
	MoveTypeFlavorDirection: "Propose one clear flavor direction for the dish and revise the draft " +
		"toward it. Change only what the direction requires — typically the concept, one or two " +
		"ingredients, and flavor_rationale — and justify the direction in rationale.",
	MoveTypeIngredientChange: "Change the ingredient list in one focused way: substitute, add, or " +
		"remove ingredients to serve the steer and the hard constraints. Adjust affected steps and " +
		"flavor_rationale so the draft stays coherent.",
	MoveTypeTechniqueStep: "Improve the method: add, refine, or reorder steps. Every step keeps a " +
		"technique from the schema enum and a why; set internal_temp_c on any step that cooks a " +
		"high-risk protein.",
	MoveTypeIterateFeedback: "The cook has cooked the current version. Revise the draft to address " +
		"their cooked-version feedback below: fix what failed, keep what worked, and explain the " +
		"causal reasoning in rationale.",
}

// movePromptData is what move.tmpl sees.
type movePromptData struct {
	DraftJSON       string
	ConstraintsJSON string
	EvidenceBlock   string // evidenceBegin + evidence.tmpl output + evidenceEnd
	Thread          []ThreadTurn
	MoveType        string
	Directive       string
	Steer           string
	IterateFeedback bool
}

// RenderPrompt renders req into the two-message prompt (system, then user)
// the DeepSeek client sends. Errors on deterministic or unknown move types —
// they never reach the model.
func RenderPrompt(req MoveRequest) ([]Message, error) {
	directive, ok := moveDirectives[req.MoveType]
	if !ok {
		return nil, fmt.Errorf("llm: no prompt for move type %q (only generative moves reach the model)", req.MoveType)
	}
	draftJSON, err := json.MarshalIndent(req.Draft, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("llm: marshal draft: %w", err)
	}
	constraintsJSON, err := json.MarshalIndent(req.Draft.Constraints, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("llm: marshal constraints: %w", err)
	}

	var evidence strings.Builder
	if err := promptTemplates.ExecuteTemplate(&evidence, "evidence.tmpl", req.Evidence); err != nil {
		return nil, fmt.Errorf("llm: render evidence.tmpl: %w", err)
	}

	thread := req.Thread
	if len(thread) > maxThreadTurns {
		thread = thread[len(thread)-maxThreadTurns:]
	}

	var system strings.Builder
	if err := promptTemplates.ExecuteTemplate(&system, "system.tmpl", nil); err != nil {
		return nil, fmt.Errorf("llm: render system.tmpl: %w", err)
	}
	var user strings.Builder
	if err := promptTemplates.ExecuteTemplate(&user, "move.tmpl", movePromptData{
		DraftJSON:       string(draftJSON),
		ConstraintsJSON: string(constraintsJSON),
		EvidenceBlock:   evidenceBegin + "\n" + strings.TrimRight(evidence.String(), "\n") + "\n" + evidenceEnd,
		Thread:          thread,
		MoveType:        req.MoveType,
		Directive:       directive,
		Steer:           req.Steer,
		IterateFeedback: req.MoveType == MoveTypeIterateFeedback,
	}); err != nil {
		return nil, fmt.Errorf("llm: render move.tmpl: %w", err)
	}
	return []Message{
		{Role: "system", Content: system.String()},
		{Role: "user", Content: user.String()},
	}, nil
}

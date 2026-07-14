package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"
)

// Judge is the Tier-2 R2 rater client (PREREGISTRATION.md §9 Amendment 1): a
// DeepSeek model distinct from the deepseek-v4-pro generator, prompted with
// the frozen §7a rubric verbatim (prompts/judge.tmpl), writing one of the
// five frozen labels per claim. It never sees the claim's experimental arm —
// LabelClaim's signature only accepts claim text + cited source.
//
// The retry/fallback shape mirrors DeepSeek.GenerateMove: strict forced
// tool-call (record_label) first, json_object fallback on a
// malformed/missing tool call, budget PreCheck before every attempt, usage
// recorded on every response, *ExhaustedError on exhaustion. One deliberate
// divergence: the generator bounces a misbehaving fallback back to the
// strict path (S5 live fix); the judge keeps the simpler sticky demotion —
// a judge failure is a per-claim abstain, never an aborted run.
const (
	// DefaultJudgeModel is the verified live Tier-2 R2 judge model id (PREREG
	// §9 Amendment 1) — deepseek-v4-flash, same family as the deepseek-v4-pro
	// generator but a distinct model (self-preference caveat noted in the
	// amendment), id + pricing verified against live api-docs.deepseek.com
	// 2026-07-08.
	DefaultJudgeModel = "deepseek-v4-flash"

	// judgeToolName is the single forced function name for the R2 judge call.
	judgeToolName = "record_label"

	// judgeMaxRetries keeps the judge at its reviewed 3-attempt shape when
	// the generator's maxRetries was raised for the S5 campaign — a judge
	// failure is a per-claim abstain, never an aborted run, so it doesn't
	// need the bigger budget.
	judgeMaxRetries = 2
)

// JudgeLabels are the five frozen PREREG §7a wire label values. They are
// duplicated here rather than imported from internal/eval, which imports
// internal/llm (blind.go, mapping.go, runner.go, verify.go) — an import back
// would cycle. internal/eval's TestJudgeLabelsMatchRatesConstants pins this
// copy against its own LabelXxx constants (eval -> llm is fine; llm -> eval
// is the forbidden direction).
var JudgeLabels = [5]string{
	"grounded-correct",
	"grounded-mischaracterized",
	"correctly-unverified",
	"hallucinated",
	"opinion-non-checkable",
}

// judgeSchemaJSON is the strict parameters schema for record_label, modeled
// on proposalSchemaJSON (schema.go): strict:true, every property required,
// additionalProperties:false, the label enum pinned to JudgeLabels.
const judgeSchemaJSON = `{
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "enum": ["grounded-correct", "grounded-mischaracterized", "correctly-unverified", "hallucinated", "opinion-non-checkable"]
    },
    "rationale": {"type": "string"}
  },
  "required": ["label", "rationale"],
  "additionalProperties": false
}`

// judgeTool assembles the single strict tool the judge forces via
// tool_choice.
func judgeTool() openai.Tool {
	return openai.Tool{
		Type: openai.ToolTypeFunction,
		Function: &openai.FunctionDefinition{
			Name:        judgeToolName,
			Description: "Record the single frozen PREREG §7a label (plus rationale) for this one claim.",
			Strict:      true,
			Parameters:  json.RawMessage(judgeSchemaJSON),
		},
	}
}

// JudgeVerdict is the judge's per-claim output: one of the five frozen
// labels plus its rationale (PREREG §9 Amendment 1 writes this to label_r2
// only — never label_tier1 or label_r1).
type JudgeVerdict struct {
	Label     string `json:"label"`
	Rationale string `json:"rationale"`
}

// Judge implements the Tier-2 R2 rater over the DeepSeek chat-completions
// API. Same construction shape as DeepSeek (deepseek.go): a *openai.Client
// wrapped with the thinking-disabled transport, a per-call timeout, and the
// shared budget meter.
type Judge struct {
	client  *openai.Client
	model   string
	timeout time.Duration
	meter   *UsageMeter
}

// NewJudge builds the judge client with the same validation as NewDeepSeek:
// APIKey and Meter are required; the model defaults to DefaultJudgeModel;
// same base URL default and thinking-disabled transport wrapper.
func NewJudge(cfg DeepSeekConfig) (*Judge, error) {
	if cfg.APIKey == "" {
		return nil, errors.New("llm: DeepSeek API key required (no-key runtime uses the stub)")
	}
	if cfg.Meter == nil {
		return nil, errors.New("llm: UsageMeter required — the LLM_BUDGET_USD hard-stop is not optional")
	}
	oc := openai.DefaultConfig(cfg.APIKey)
	oc.BaseURL = DefaultDeepSeekBaseURL
	if cfg.BaseURL != "" {
		oc.BaseURL = cfg.BaseURL
	}
	base := cfg.HTTPClient
	if base == nil {
		base = &http.Client{}
	}
	hc := *base
	hc.Transport = thinkingDisabledTransport{base: base.Transport}
	oc.HTTPClient = &hc
	j := &Judge{
		client:  openai.NewClientWithConfig(oc),
		model:   DefaultJudgeModel,
		timeout: defaultCallTimeout,
		meter:   cfg.Meter,
	}
	if cfg.Model != "" {
		j.model = cfg.Model
	}
	if cfg.CallTimeout > 0 {
		j.timeout = cfg.CallTimeout
	}
	return j, nil
}

// Model returns the model id in use.
func (j *Judge) Model() string { return j.model }

// judgePromptData is what judge.tmpl sees.
type judgePromptData struct {
	Text   string
	Source string
}

// LabelClaim renders the frozen §7a rubric plus this one claim's text and
// cited source — the arm is never rendered or sent — then calls the model
// (strict tool-call first, json_object fallback), validating the returned
// label against the five frozen categories.
func (j *Judge) LabelClaim(ctx context.Context, text, source string) (JudgeVerdict, error) {
	var buf strings.Builder
	if err := promptTemplates.ExecuteTemplate(&buf, "judge.tmpl", judgePromptData{Text: text, Source: source}); err != nil {
		return JudgeVerdict{}, fmt.Errorf("llm: render judge.tmpl: %w", err)
	}
	content := buf.String()
	// The json_object caveat requires the word "json" in the prompt (same
	// guarantee as GenerateMove's promptMentionsJSON, checked directly here
	// since the judge prompt is a single message, not a rendered []Message).
	if !strings.Contains(strings.ToLower(content), "json") {
		return JudgeVerdict{}, errors.New(`llm: judge prompt broke the json_object guarantee: no "json" in the rendered prompt`)
	}
	chat := []openai.ChatCompletionMessage{{Role: "user", Content: content}}

	fallback := false
	attempts := 0
	var last error
	for attempts < 1+judgeMaxRetries {
		// Budget hard-stop BEFORE the network, re-checked every attempt.
		if err := j.meter.PreCheck(); err != nil {
			return JudgeVerdict{}, err
		}
		attempts++
		out, err := j.callOnce(ctx, chat, fallback)
		if err == nil {
			return out, nil
		}
		last = err
		if ctx.Err() != nil {
			break // parent gone: don't spin on a dead context
		}
		if errors.Is(err, errMalformedToolCall) {
			fallback = true // strict tool-calling misbehaved: demote to json_object
		}
	}
	return JudgeVerdict{}, &ExhaustedError{Attempts: attempts, Last: last}
}

// callOnce makes one bounded API call and extracts the JudgeVerdict. Usage
// is recorded on every response received, extraction success or not.
func (j *Judge) callOnce(ctx context.Context, chat []openai.ChatCompletionMessage, fallback bool) (JudgeVerdict, error) {
	cctx, cancel := context.WithTimeout(ctx, j.timeout)
	defer cancel()

	creq := openai.ChatCompletionRequest{
		Model:     j.model,
		Messages:  chat,
		MaxTokens: maxOutputTokens,
	}
	if fallback {
		creq.ResponseFormat = &openai.ChatCompletionResponseFormat{
			Type: openai.ChatCompletionResponseFormatTypeJSONObject,
		}
	} else {
		creq.Tools = []openai.Tool{judgeTool()}
		creq.ToolChoice = openai.ToolChoice{
			Type:     openai.ToolTypeFunction,
			Function: openai.ToolFunction{Name: judgeToolName},
		}
	}

	resp, err := j.client.CreateChatCompletion(cctx, creq)
	if err != nil {
		return JudgeVerdict{}, err
	}
	j.recordUsage(resp.Usage)
	var out JudgeVerdict
	if fallback {
		out, err = extractJudgeContent(resp)
	} else {
		out, err = extractJudgeToolCall(resp)
	}
	if err != nil {
		return JudgeVerdict{}, err
	}
	if !knownJudgeLabel(out.Label) {
		return JudgeVerdict{}, fmt.Errorf("llm: judge returned unknown label %q (PREREG §7a categories are frozen)", out.Label)
	}
	return out, nil
}

func (j *Judge) recordUsage(u openai.Usage) {
	cached := 0
	if u.PromptTokensDetails != nil {
		cached = u.PromptTokensDetails.CachedTokens
	}
	if err := j.meter.Record(u.PromptTokens, cached, u.CompletionTokens); err != nil {
		slog.Warn("llm: budget ledger persist failed", "err", err)
	}
}

// extractJudgeToolCall pulls the strict-path arguments out of the forced
// tool call. Any shape violation is errMalformedToolCall — the caller
// demotes to the json_object fallback.
func extractJudgeToolCall(resp openai.ChatCompletionResponse) (JudgeVerdict, error) {
	if len(resp.Choices) == 0 {
		return JudgeVerdict{}, fmt.Errorf("%w: no choices", errMalformedToolCall)
	}
	for _, tc := range resp.Choices[0].Message.ToolCalls {
		if tc.Function.Name != judgeToolName {
			continue
		}
		out, err := decodeJudgeStrict(tc.Function.Arguments)
		if err != nil {
			return JudgeVerdict{}, fmt.Errorf("%w: arguments: %v", errMalformedToolCall, err)
		}
		return out, nil
	}
	return JudgeVerdict{}, fmt.Errorf("%w: no %s tool call in response", errMalformedToolCall, judgeToolName)
}

// extractJudgeContent decodes the buffered json_object fallback content.
// Empty content is the documented retryable caveat.
func extractJudgeContent(resp openai.ChatCompletionResponse) (JudgeVerdict, error) {
	if len(resp.Choices) == 0 {
		return JudgeVerdict{}, fmt.Errorf("%w: no choices", errEmptyContent)
	}
	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	if content == "" {
		return JudgeVerdict{}, errEmptyContent
	}
	out, err := decodeJudgeStrict(content)
	if err != nil {
		return JudgeVerdict{}, fmt.Errorf("%w: %v", errMalformedContent, err)
	}
	return out, nil
}

// decodeJudgeStrict decodes one complete JudgeVerdict with
// DisallowUnknownFields and rejects trailing data.
func decodeJudgeStrict(data string) (JudgeVerdict, error) {
	dec := json.NewDecoder(strings.NewReader(data))
	dec.DisallowUnknownFields()
	var out JudgeVerdict
	if err := dec.Decode(&out); err != nil {
		return JudgeVerdict{}, err
	}
	if dec.More() {
		return JudgeVerdict{}, errors.New("trailing data after verdict JSON")
	}
	return out, nil
}

// knownJudgeLabel reports whether s is one of the five frozen §7a categories.
func knownJudgeLabel(s string) bool {
	for _, l := range JudgeLabels {
		if l == s {
			return true
		}
	}
	return false
}

package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"

	"github.com/ogngnaoh/capycook/internal/proposal"
)

// DeepSeek is the real model edge (SPEC §4c; spec §7): a single-call
// GenerateMove over the OpenAI-compatible DeepSeek API.
//
//   - PRIMARY path: strict function/tool-calling against the /beta base URL
//     (strict:true, all-required, additionalProperties:false), the one tool
//     forced via tool_choice.
//   - FALLBACK path (tool call malformed or unavailable): response_format
//     json_object — the whole response is buffered (no partial parse), the
//     word "json" is guaranteed in the prompt by the template pack (asserted
//     here), max_tokens is set, and the documented occasional-empty-content
//     caveat is a retryable failure.
//   - Failure policy (spec §7): 2 retries on malformed/empty output, 60s
//     per-call timeout, extraction-ok/rationale-empty = degraded success;
//     exhaustion returns *ExhaustedError, which the orchestrator maps to
//     move_failed (never proposal_blocked).
//   - Budget: every attempt is pre-checked against the UsageMeter's hard cap
//     BEFORE the network; every response's usage is recorded, extraction
//     success or not.
//
// The model returns a complete Draft; Go computes the Change diff. ID,
// MoveID, and Safety stay zero — the orchestrator assigns ids and the
// safety gate fills Safety (same convention as the stub). Telemetry spans
// are NOT wired here (task 3.5 wraps the llm call).
const (
	// DefaultDeepSeekBaseURL is the /beta endpoint — required for strict
	// tool-calling (verified api-docs.deepseek.com, 2026-07-07); json_object
	// works there too, so one client serves both paths.
	DefaultDeepSeekBaseURL = "https://api.deepseek.com/beta"
	// DefaultDeepSeekModel is the verified live model id (legacy
	// deepseek-chat/deepseek-reasoner deprecate 2026-07-24).
	DefaultDeepSeekModel = "deepseek-v4-pro"

	defaultCallTimeout = 60 * time.Second
	// maxRetries is pinned by the spec §7 failure policy: 2 retries after
	// the first attempt.
	maxRetries = 2
	// maxOutputTokens bounds every completion ("set max_tokens sensibly" —
	// documented json_object caveat; a full Draft + rationale fits well
	// within it).
	maxOutputTokens = 8192
)

// Retryable extraction failures. A malformed/missing tool call additionally
// flips the client into the json_object fallback for the remaining
// attempts.
var (
	errMalformedToolCall = errors.New("llm: malformed or missing tool call")
	errEmptyContent      = errors.New("llm: empty completion content (documented json_object caveat)")
	errMalformedContent  = errors.New("llm: malformed completion content")
)

// ExhaustedError is the typed total-exhaustion failure: every attempt
// (1 + maxRetries) failed. The orchestrator maps it to move_failed.
type ExhaustedError struct {
	Attempts int
	Last     error // the final attempt's failure
}

func (e *ExhaustedError) Error() string {
	return fmt.Sprintf("llm: generation failed after %d attempts: %v", e.Attempts, e.Last)
}

func (e *ExhaustedError) Unwrap() error { return e.Last }

// DeepSeekConfig configures NewDeepSeek. APIKey and Meter are required;
// zero values elsewhere take the verified defaults.
type DeepSeekConfig struct {
	APIKey      string
	BaseURL     string        // default DefaultDeepSeekBaseURL
	Model       string        // default DefaultDeepSeekModel
	HTTPClient  *http.Client  // default http.DefaultClient (tests inject replay transports)
	CallTimeout time.Duration // default 60s (spec §7)
	Meter       *UsageMeter   // required: the LLM_BUDGET_USD hard-stop
}

// DeepSeek implements LLM over the DeepSeek chat-completions API.
type DeepSeek struct {
	client  *openai.Client
	model   string
	timeout time.Duration
	meter   *UsageMeter
}

var _ LLM = (*DeepSeek)(nil)

// NewDeepSeek builds the client. It refuses to run without a UsageMeter:
// the budget hard-stop is not optional.
func NewDeepSeek(cfg DeepSeekConfig) (*DeepSeek, error) {
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
	// Wrap whatever transport is in play (default or an injected test/replay
	// one) so every chat-completion call carries thinking:{"type":"disabled"}.
	base := cfg.HTTPClient
	if base == nil {
		base = &http.Client{}
	}
	hc := *base
	hc.Transport = thinkingDisabledTransport{base: base.Transport}
	oc.HTTPClient = &hc
	d := &DeepSeek{
		client:  openai.NewClientWithConfig(oc),
		model:   DefaultDeepSeekModel,
		timeout: defaultCallTimeout,
		meter:   cfg.Meter,
	}
	if cfg.Model != "" {
		d.model = cfg.Model
	}
	if cfg.CallTimeout > 0 {
		d.timeout = cfg.CallTimeout
	}
	return d, nil
}

// thinkingDisabledTransport injects DeepSeek's custom
// thinking:{"type":"disabled"} body field into chat-completion requests.
// v4-pro defaults to thinking mode, which rejects a forced tool_choice with
// a 400 ("Thinking mode does not support this tool_choice") — a live-API
// behavior not in the docs (found at the Gate-B smoke, 2026-07-07).
// Proposal extraction is a structured task; it runs non-thinking so the
// strict forced tool-call path keeps working. go-openai has no field for
// vendor extensions, hence the transport-level rewrite.
type thinkingDisabledTransport struct{ base http.RoundTripper }

func (t thinkingDisabledTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	if req.Method != http.MethodPost || req.Body == nil ||
		!strings.HasSuffix(req.URL.Path, "/chat/completions") {
		return base.RoundTrip(req)
	}
	body, err := io.ReadAll(req.Body)
	_ = req.Body.Close()
	if err != nil {
		return nil, fmt.Errorf("llm: reading request body to disable thinking: %w", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err == nil {
		if _, set := fields["thinking"]; !set {
			fields["thinking"] = json.RawMessage(`{"type":"disabled"}`)
			if rewritten, err := json.Marshal(fields); err == nil {
				body = rewritten
			}
		}
	}
	req.Body = io.NopCloser(bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(body)), nil
	}
	return base.RoundTrip(req)
}

// Model returns the model id in use (for /api/status).
func (d *DeepSeek) Model() string { return d.model }

// GenerateMove renders the prompt pack, calls the model (strict tool-call
// first, json_object fallback), decodes strictly, and computes the diff.
func (d *DeepSeek) GenerateMove(ctx context.Context, req MoveRequest) (proposal.Proposal, error) {
	msgs, err := RenderPrompt(req)
	if err != nil {
		return proposal.Proposal{}, err
	}
	// The json_object caveat requires the word "json" in the prompt. The
	// template pack guarantees it (prompts_test asserts it too); this guard
	// keeps the guarantee load-bearing at runtime.
	if !promptMentionsJSON(msgs) {
		return proposal.Proposal{}, errors.New(`llm: prompt pack broke the json_object guarantee: no "json" in the rendered prompt`)
	}
	chat := make([]openai.ChatCompletionMessage, len(msgs))
	for i, m := range msgs {
		chat[i] = openai.ChatCompletionMessage{Role: m.Role, Content: m.Content}
	}

	fallback := false
	attempts := 0
	var last error
	for attempts < 1+maxRetries {
		// Budget hard-stop BEFORE the network, re-checked every attempt:
		// a mid-sequence usage recording can cross the cap.
		if err := d.meter.PreCheck(); err != nil {
			return proposal.Proposal{}, err
		}
		attempts++
		out, err := d.callOnce(ctx, chat, fallback)
		if err == nil {
			return buildProposal(req, out), nil
		}
		last = err
		// Every failed attempt is logged, not just the last: ExhaustedError
		// carries only the final error, which hides systematic drift (e.g.
		// the strict path silently failing every call and the campaign
		// running entirely on the unenforced json_object fallback).
		slog.Warn("llm: generate attempt failed",
			"attempt", attempts, "fallback", fallback, "move", req.MoveType, "err", err)
		if ctx.Err() != nil {
			break // parent gone (cancel/redirect): don't spin on a dead context
		}
		if errors.Is(err, errMalformedToolCall) {
			fallback = true // strict tool-calling misbehaved: demote to json_object
		} else if fallback && errors.Is(err, errMalformedContent) {
			// The unenforced json_object fallback emitted schema-violating
			// JSON (observed live: a stray "title" field, twice in a row).
			// The strict path is server-enforced and cannot repeat that
			// failure shape — bounce back instead of re-rolling unenforced
			// dice. Empty content stays on the fallback: it is that path's
			// own documented retryable caveat.
			fallback = false
		}
	}
	return proposal.Proposal{}, &ExhaustedError{Attempts: attempts, Last: last}
}

// callOnce makes one bounded API call and extracts the moveOutput. Usage is
// recorded on every response received, extraction success or not — the API
// charged for it either way.
func (d *DeepSeek) callOnce(ctx context.Context, chat []openai.ChatCompletionMessage, fallback bool) (moveOutput, error) {
	cctx, cancel := context.WithTimeout(ctx, d.timeout)
	defer cancel()

	creq := openai.ChatCompletionRequest{
		Model:     d.model,
		Messages:  chat,
		MaxTokens: maxOutputTokens,
	}
	if fallback {
		creq.ResponseFormat = &openai.ChatCompletionResponseFormat{
			Type: openai.ChatCompletionResponseFormatTypeJSONObject,
		}
	} else {
		creq.Tools = []openai.Tool{proposalTool()}
		creq.ToolChoice = openai.ToolChoice{
			Type:     openai.ToolTypeFunction,
			Function: openai.ToolFunction{Name: proposalToolName},
		}
	}

	// Non-streaming: the entire response is buffered before any parse (the
	// no-partial-parse rule for both paths).
	resp, err := d.client.CreateChatCompletion(cctx, creq)
	if err != nil {
		return moveOutput{}, err
	}
	d.recordUsage(resp.Usage)
	if fallback {
		return extractContent(resp)
	}
	return extractToolCall(resp)
}

func (d *DeepSeek) recordUsage(u openai.Usage) {
	cached := 0
	if u.PromptTokensDetails != nil {
		cached = u.PromptTokensDetails.CachedTokens
	}
	if err := d.meter.Record(u.PromptTokens, cached, u.CompletionTokens); err != nil {
		// In-memory spend still counted; only the sidecar write failed.
		slog.Warn("llm: budget ledger persist failed", "err", err)
	}
}

// extractToolCall pulls the strict-path arguments out of the forced tool
// call. Any shape violation is errMalformedToolCall — the caller demotes to
// the json_object fallback.
func extractToolCall(resp openai.ChatCompletionResponse) (moveOutput, error) {
	if len(resp.Choices) == 0 {
		return moveOutput{}, fmt.Errorf("%w: no choices", errMalformedToolCall)
	}
	for _, tc := range resp.Choices[0].Message.ToolCalls {
		if tc.Function.Name != proposalToolName {
			continue
		}
		out, err := decodeStrict(tc.Function.Arguments)
		if err != nil {
			return moveOutput{}, fmt.Errorf("%w: arguments: %v", errMalformedToolCall, err)
		}
		return out, nil
	}
	return moveOutput{}, fmt.Errorf("%w: no %s tool call in response", errMalformedToolCall, proposalToolName)
}

// extractContent decodes the buffered json_object fallback content. Empty
// content is the documented retryable caveat.
func extractContent(resp openai.ChatCompletionResponse) (moveOutput, error) {
	if len(resp.Choices) == 0 {
		return moveOutput{}, fmt.Errorf("%w: no choices", errEmptyContent)
	}
	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	if content == "" {
		return moveOutput{}, errEmptyContent
	}
	out, err := decodeStrict(content)
	if err != nil {
		return moveOutput{}, fmt.Errorf("%w: %v", errMalformedContent, err)
	}
	return out, nil
}

// decodeStrict decodes one complete moveOutput with DisallowUnknownFields
// and rejects trailing data.
func decodeStrict(data string) (moveOutput, error) {
	dec := json.NewDecoder(strings.NewReader(data))
	dec.DisallowUnknownFields()
	var out moveOutput
	if err := dec.Decode(&out); err != nil {
		return moveOutput{}, err
	}
	if dec.More() {
		return moveOutput{}, errors.New("trailing data after proposal JSON")
	}
	return out, nil
}

// buildProposal turns a decoded moveOutput into the Proposal contract: Go
// computes the diff from the returned full Draft (the model never emits
// ops). Empty rationale is a degraded success, passed through as-is.
func buildProposal(req MoveRequest, out moveOutput) proposal.Proposal {
	change := proposal.ComputeDiff(req.Draft, out.Draft)
	return proposal.Proposal{
		MoveType:      req.MoveType,
		TargetFields:  proposal.TargetFields(change),
		Change:        change,
		Rationale:     out.Rationale,
		Citations:     out.Citations,
		Confidence:    out.Confidence,
		Unverified:    out.Unverified,
		SuggestedNext: out.SuggestedNext,
	}
}

func promptMentionsJSON(msgs []Message) bool {
	for _, m := range msgs {
		if strings.Contains(strings.ToLower(m.Content), "json") {
			return true
		}
	}
	return false
}

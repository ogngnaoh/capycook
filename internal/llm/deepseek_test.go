package llm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

// ---- record-replay harness ------------------------------------------------
// Replays hand-authored synthetic wire-format fixtures from
// testdata/recorded/synthetic_*.json through a real httptest server into the
// real client. Until Gate B every fixture here is synthetic — live
// recordings (recorded_*.json) only ever come from the CAPYCOOK_LIVE_TEST=1
// smoke test in deepseek_live_test.go.

// wireRequest is the subset of the OpenAI-wire chat-completion request body
// the tests assert on.
type wireRequest struct {
	Model     string `json:"model"`
	MaxTokens int    `json:"max_tokens"`
	Messages  []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"messages"`
	Tools []struct {
		Type     string `json:"type"`
		Function struct {
			Name       string          `json:"name"`
			Strict     bool            `json:"strict"`
			Parameters json.RawMessage `json:"parameters"`
		} `json:"function"`
	} `json:"tools"`
	ToolChoice     json.RawMessage `json:"tool_choice"`
	ResponseFormat *struct {
		Type string `json:"type"`
	} `json:"response_format"`
	Thinking *struct {
		Type string `json:"type"`
	} `json:"thinking"`
}

type replay struct {
	mu    sync.Mutex
	queue [][]byte
	reqs  []wireRequest
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "recorded", name))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return b
}

func newReplayServer(t *testing.T, fixtures ...string) (*replay, *httptest.Server) {
	t.Helper()
	r := &replay{}
	for _, f := range fixtures {
		r.queue = append(r.queue, readFixture(t, f))
	}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		var wr wireRequest
		if err := json.Unmarshal(body, &wr); err != nil {
			t.Errorf("replay: request body is not JSON: %v", err)
		}
		r.mu.Lock()
		r.reqs = append(r.reqs, wr)
		if len(r.queue) == 0 {
			r.mu.Unlock()
			http.Error(w, `{"error":{"message":"replay queue empty"}}`, http.StatusInternalServerError)
			return
		}
		next := r.queue[0]
		r.queue = r.queue[1:]
		r.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(next)
	}))
	t.Cleanup(ts.Close)
	return r, ts
}

func (r *replay) calls() []wireRequest {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]wireRequest(nil), r.reqs...)
}

func newTestMeter(t *testing.T, capUSD float64) *UsageMeter {
	t.Helper()
	m, err := OpenUsageMeter(filepath.Join(t.TempDir(), "budget.json"), capUSD)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	return m
}

func newTestDeepSeek(t *testing.T, baseURL string, m *UsageMeter) *DeepSeek {
	t.Helper()
	ds, err := NewDeepSeek(DeepSeekConfig{APIKey: "test-key", BaseURL: baseURL, Meter: m})
	if err != nil {
		t.Fatalf("NewDeepSeek: %v", err)
	}
	return ds
}

func testMoveRequest() MoveRequest {
	return MoveRequest{
		Draft:    baseDraft(),
		MoveType: MoveTypeFlavorDirection,
		Steer:    "lean smoky",
	}
}

// fixtureMoveOutput decodes the moveOutput a fixture carries — from the
// tool-call arguments if present, else from message content.
func fixtureMoveOutput(t *testing.T, name string) moveOutput {
	t.Helper()
	var resp struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					Function struct {
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(readFixture(t, name), &resp); err != nil {
		t.Fatalf("decode fixture %s: %v", name, err)
	}
	raw := resp.Choices[0].Message.Content
	if tc := resp.Choices[0].Message.ToolCalls; len(tc) > 0 {
		raw = tc[0].Function.Arguments
	}
	out, err := decodeStrict(raw)
	if err != nil {
		t.Fatalf("decode fixture %s moveOutput: %v", name, err)
	}
	return out
}

// ---- tests -----------------------------------------------------------------

// v4-pro defaults to thinking mode, which rejects a forced tool_choice with
// a 400 ("Thinking mode does not support this tool_choice" — live API,
// 2026-07-07, not in the docs). Every generation call must therefore carry
// DeepSeek's custom thinking:{"type":"disabled"} body field.
func TestDeepSeekDisablesThinkingMode(t *testing.T) {
	r, ts := newReplayServer(t, "synthetic_strict_tool_call.json")
	ds := newTestDeepSeek(t, ts.URL, newTestMeter(t, 10))

	if _, err := ds.GenerateMove(context.Background(), testMoveRequest()); err != nil {
		t.Fatalf("GenerateMove: %v", err)
	}
	calls := r.calls()
	if len(calls) != 1 {
		t.Fatalf("made %d calls, want 1", len(calls))
	}
	if calls[0].Thinking == nil || calls[0].Thinking.Type != "disabled" {
		t.Fatalf(`thinking = %+v, want {"type":"disabled"} on the wire`, calls[0].Thinking)
	}
}

func TestDeepSeekStrictPath(t *testing.T) {
	r, ts := newReplayServer(t, "synthetic_strict_tool_call.json")
	meter := newTestMeter(t, 10)
	ds := newTestDeepSeek(t, ts.URL, meter)

	req := testMoveRequest()
	p, err := ds.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatalf("GenerateMove: %v", err)
	}

	calls := r.calls()
	if len(calls) != 1 {
		t.Fatalf("made %d calls, want 1", len(calls))
	}
	c := calls[0]
	if c.Model != "deepseek-v4-pro" {
		t.Fatalf("model = %q, want deepseek-v4-pro", c.Model)
	}
	if c.MaxTokens <= 0 {
		t.Fatal("max_tokens not set")
	}
	if len(c.Tools) != 1 {
		t.Fatalf("tools = %d, want 1", len(c.Tools))
	}
	fn := c.Tools[0].Function
	if fn.Name != proposalToolName || !fn.Strict {
		t.Fatalf("tool = %q strict=%v, want %q strict=true", fn.Name, fn.Strict, proposalToolName)
	}
	var gotParams, wantParams map[string]any
	if err := json.Unmarshal(fn.Parameters, &gotParams); err != nil {
		t.Fatalf("tool parameters not JSON: %v", err)
	}
	if err := json.Unmarshal([]byte(proposalSchemaJSON), &wantParams); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gotParams, wantParams) {
		t.Fatal("wire tool parameters differ from proposalSchemaJSON")
	}
	if !strings.Contains(string(c.ToolChoice), proposalToolName) {
		t.Fatalf("tool_choice %s does not force %q", c.ToolChoice, proposalToolName)
	}
	if c.ResponseFormat != nil {
		t.Fatal("strict path must not also set response_format")
	}
	if len(c.Messages) != 2 || c.Messages[0].Role != "system" || c.Messages[1].Role != "user" {
		t.Fatalf("messages = %d, want rendered system+user pair", len(c.Messages))
	}

	// The model returned a full Draft; Go computed the diff.
	want := fixtureMoveOutput(t, "synthetic_strict_tool_call.json")
	if len(p.Change) == 0 {
		t.Fatal("proposal has empty Change — diff not computed")
	}
	applied, err := req.Draft.Apply(p.Change)
	if err != nil {
		t.Fatalf("apply computed diff: %v", err)
	}
	if !reflect.DeepEqual(applied, want.Draft) {
		t.Fatal("current.Apply(Change) != returned draft — diff round-trip broken")
	}
	if p.Rationale != want.Rationale {
		t.Fatalf("Rationale = %q, want fixture rationale", p.Rationale)
	}
	if len(p.Citations) != 1 || p.Citations[0].Source != "FlavorGraph" {
		t.Fatalf("Citations = %+v, want the fixture's FlavorGraph citation", p.Citations)
	}
	if p.Confidence != 0.72 {
		t.Fatalf("Confidence = %v, want 0.72", p.Confidence)
	}
	if !reflect.DeepEqual(p.Unverified, want.Unverified) {
		t.Fatalf("Unverified = %v, want %v", p.Unverified, want.Unverified)
	}
	if !reflect.DeepEqual(p.SuggestedNext, []string{"technique_step", "cost_recompute"}) {
		t.Fatalf("SuggestedNext = %v", p.SuggestedNext)
	}
	if p.MoveType != MoveTypeFlavorDirection {
		t.Fatalf("MoveType = %q", p.MoveType)
	}
	if len(p.TargetFields) == 0 {
		t.Fatal("TargetFields empty")
	}
	// Same convention as the stub: orchestrator assigns ids, gate fills Safety.
	if p.ID != "" || p.MoveID != "" || p.Safety.Status != "" {
		t.Fatalf("ID/MoveID/Safety must stay zero, got %q/%q/%+v", p.ID, p.MoveID, p.Safety)
	}

	// Budget arithmetic from the fixture's usage: 100k prompt (40k cached
	// hit) + 20k completion.
	wantSpend := costUSD(100000, 40000, 20000)
	if got := meter.Spent(); math.Abs(got-wantSpend) > 1e-12 {
		t.Fatalf("meter.Spent() = %v, want %v", got, wantSpend)
	}
}

func TestDeepSeekFallbackPath(t *testing.T) {
	r, ts := newReplayServer(t,
		"synthetic_malformed_tool_call.json", // strict response w/o tool call
		"synthetic_fallback_content.json",    // json_object content
	)
	meter := newTestMeter(t, 10)
	ds := newTestDeepSeek(t, ts.URL, meter)

	req := testMoveRequest()
	p, err := ds.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatalf("GenerateMove: %v", err)
	}

	calls := r.calls()
	if len(calls) != 2 {
		t.Fatalf("made %d calls, want 2 (strict then fallback)", len(calls))
	}
	if calls[0].ResponseFormat != nil || len(calls[0].Tools) != 1 {
		t.Fatal("first call must be the strict tool-call attempt")
	}
	fb := calls[1]
	if fb.ResponseFormat == nil || fb.ResponseFormat.Type != "json_object" {
		t.Fatalf("fallback response_format = %+v, want json_object", fb.ResponseFormat)
	}
	if len(fb.Tools) != 0 {
		t.Fatal("fallback call must not send tools")
	}
	if fb.MaxTokens <= 0 {
		t.Fatal("fallback max_tokens not set (documented json_object caveat)")
	}
	// Documented caveat: the word "json" must appear in the prompt. The
	// template guarantees it; the wire request must show it.
	var all strings.Builder
	for _, m := range fb.Messages {
		all.WriteString(m.Content)
	}
	if !strings.Contains(strings.ToLower(all.String()), "json") {
		t.Fatal(`fallback prompt does not contain the word "json"`)
	}

	// Degraded success: extraction ok, rationale empty.
	if p.Rationale != "" {
		t.Fatalf("Rationale = %q, want empty (degraded success)", p.Rationale)
	}
	want := fixtureMoveOutput(t, "synthetic_fallback_content.json")
	applied, err := req.Draft.Apply(p.Change)
	if err != nil {
		t.Fatalf("apply computed diff: %v", err)
	}
	if !reflect.DeepEqual(applied, want.Draft) {
		t.Fatal("current.Apply(Change) != returned draft on fallback path")
	}
}

func TestDeepSeekEmptyContentThenSuccessRetry(t *testing.T) {
	r, ts := newReplayServer(t,
		"synthetic_malformed_tool_call.json", // attempt 1: strict, malformed
		"synthetic_empty_content.json",       // attempt 2: fallback, empty caveat
		"synthetic_fallback_content.json",    // attempt 3: fallback, success
	)
	ds := newTestDeepSeek(t, ts.URL, newTestMeter(t, 10))

	p, err := ds.GenerateMove(context.Background(), testMoveRequest())
	if err != nil {
		t.Fatalf("GenerateMove: %v", err)
	}
	if got := len(r.calls()); got != 3 {
		t.Fatalf("made %d calls, want 3", got)
	}
	if len(p.Change) == 0 {
		t.Fatal("empty Change after successful retry")
	}
}

// Observed live (S5 first grounded run, 2026-07-09): one strict misfire
// permanently demoted the move to the unenforced json_object fallback, which
// then emitted a schema-violating stray "title" field on every remaining
// attempt — exhausting retries and aborting the whole arm. The fallback must
// bounce back to the server-enforced strict path when its content misbehaves:
// strict cannot repeat a shape violation, so alternating beats re-rolling
// unenforced dice.
func TestDeepSeekFallbackMalformedContentReturnsToStrict(t *testing.T) {
	r, ts := newReplayServer(t,
		"synthetic_malformed_tool_call.json",    // attempt 1: strict, malformed → demote
		"synthetic_fallback_unknown_field.json", // attempt 2: fallback, stray "title" → bounce back
		"synthetic_strict_tool_call.json",       // attempt 3: strict, success
	)
	ds := newTestDeepSeek(t, ts.URL, newTestMeter(t, 10))

	p, err := ds.GenerateMove(context.Background(), testMoveRequest())
	if err != nil {
		t.Fatalf("GenerateMove: %v", err)
	}
	calls := r.calls()
	if len(calls) != 3 {
		t.Fatalf("made %d calls, want 3", len(calls))
	}
	third := calls[2]
	if len(third.Tools) == 0 {
		t.Fatal("attempt 3 sent no tools — a fallback content failure must return to the strict path")
	}
	if third.ResponseFormat != nil {
		t.Fatalf("attempt 3 response_format = %+v, want none (strict path)", third.ResponseFormat)
	}
	if len(p.Change) == 0 {
		t.Fatal("empty Change after strict-path recovery")
	}
}

func TestDeepSeekRetryExhaustionTypedError(t *testing.T) {
	r, ts := newReplayServer(t,
		"synthetic_malformed_tool_call.json",
		"synthetic_empty_content.json",
		"synthetic_empty_content.json",
	)
	meter := newTestMeter(t, 10)
	ds := newTestDeepSeek(t, ts.URL, meter)

	_, err := ds.GenerateMove(context.Background(), testMoveRequest())
	var ex *ExhaustedError
	if !errors.As(err, &ex) {
		t.Fatalf("err = %v (%T), want *ExhaustedError", err, err)
	}
	if ex.Attempts != 3 {
		t.Fatalf("Attempts = %d, want 3 (1 try + 2 retries)", ex.Attempts)
	}
	if !errors.Is(err, errEmptyContent) {
		t.Fatalf("err chain %v does not carry the empty-content cause", err)
	}
	if got := len(r.calls()); got != 3 {
		t.Fatalf("made %d calls, want 3", got)
	}
	// Failed extractions still cost money: all three responses' usage is
	// recorded.
	wantSpend := costUSD(1000, 0, 20) + 2*costUSD(1000, 500, 0)
	if got := meter.Spent(); math.Abs(got-wantSpend) > 1e-12 {
		t.Fatalf("meter.Spent() = %v, want %v", got, wantSpend)
	}
}

func TestDeepSeekBudgetHardStopBeforeNetwork(t *testing.T) {
	r, ts := newReplayServer(t) // empty queue: any request is a test failure
	meter := newTestMeter(t, 0.0004)
	if err := meter.Record(1000, 0, 0); err != nil { // $0.000435 >= cap
		t.Fatal(err)
	}
	ds := newTestDeepSeek(t, ts.URL, meter)

	_, err := ds.GenerateMove(context.Background(), testMoveRequest())
	if !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("err = %v, want ErrBudgetExhausted", err)
	}
	if got := len(r.calls()); got != 0 {
		t.Fatalf("made %d network calls after budget exhaustion, want 0", got)
	}
}

func TestDeepSeekBudgetHardStopMidRetry(t *testing.T) {
	// The first (malformed) response's usage pushes spend past the cap; the
	// retry must be refused before the network.
	r, ts := newReplayServer(t, "synthetic_malformed_tool_call.json")
	meter := newTestMeter(t, 0.0004) // first call costs $0.0004524
	ds := newTestDeepSeek(t, ts.URL, meter)

	_, err := ds.GenerateMove(context.Background(), testMoveRequest())
	if !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("err = %v, want ErrBudgetExhausted", err)
	}
	if got := len(r.calls()); got != 1 {
		t.Fatalf("made %d calls, want 1 (retry refused at the cap)", got)
	}
}

func TestDeepSeekPerCallTimeout(t *testing.T) {
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		time.Sleep(300 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(readFixture(t, "synthetic_strict_tool_call.json"))
	}))
	t.Cleanup(slow.Close)

	ds, err := NewDeepSeek(DeepSeekConfig{
		APIKey:      "test-key",
		BaseURL:     slow.URL,
		Meter:       newTestMeter(t, 10),
		CallTimeout: 30 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("NewDeepSeek: %v", err)
	}

	start := time.Now()
	_, err = ds.GenerateMove(context.Background(), testMoveRequest())
	elapsed := time.Since(start)

	var ex *ExhaustedError
	if !errors.As(err, &ex) {
		t.Fatalf("err = %v, want *ExhaustedError", err)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err chain %v does not carry the per-call deadline", err)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("took %v — injected 30ms per-call timeout not honored", elapsed)
	}
}

func TestDeepSeekParentCancellationStopsRetries(t *testing.T) {
	r, ts := newReplayServer(t) // empty queue: handler answers 500
	ds := newTestDeepSeek(t, ts.URL, newTestMeter(t, 10))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ds.GenerateMove(ctx, testMoveRequest())
	if err == nil {
		t.Fatal("GenerateMove with cancelled parent succeeded")
	}
	if got := len(r.calls()); got > 1 {
		t.Fatalf("made %d calls on a dead context, want at most 1", got)
	}
}

func TestNewDeepSeekValidation(t *testing.T) {
	if _, err := NewDeepSeek(DeepSeekConfig{Meter: newTestMeter(t, 1)}); err == nil {
		t.Fatal("NewDeepSeek without API key succeeded")
	}
	if _, err := NewDeepSeek(DeepSeekConfig{APIKey: "k"}); err == nil {
		t.Fatal("NewDeepSeek without a UsageMeter succeeded — the budget hard-stop is not optional")
	}
}

// TestDeepSeekModelNeverEmitsOps: the wire shape has no change/ops field at
// all — Go owns the diff. Guards against schema drift toward model-emitted
// patches.
func TestDeepSeekModelNeverEmitsOps(t *testing.T) {
	if strings.Contains(proposalSchemaJSON, `"change"`) || strings.Contains(proposalSchemaJSON, `"ops"`) {
		t.Fatal("tool schema exposes a change/ops field — the model must never emit ops")
	}
	if _, ok := reflect.TypeOf(moveOutput{}).FieldByName("Change"); ok {
		t.Fatal("moveOutput decodes a Change field — the model must never emit ops")
	}
}

// TestDeepSeekRejectsDeterministicMoves: deterministic move types never
// reach the model (the orchestrator computes them via services), and the
// client refuses them outright.
func TestDeepSeekRejectsDeterministicMoves(t *testing.T) {
	r, ts := newReplayServer(t)
	ds := newTestDeepSeek(t, ts.URL, newTestMeter(t, 10))
	_, err := ds.GenerateMove(context.Background(), MoveRequest{
		Draft:    baseDraft(),
		MoveType: MoveTypeCostRecompute,
	})
	if err == nil {
		t.Fatal("GenerateMove(cost_recompute) succeeded, want prompt-render error")
	}
	if got := len(r.calls()); got != 0 {
		t.Fatalf("made %d network calls for a deterministic move", got)
	}
}

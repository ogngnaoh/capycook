package llm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

// ---- self-contained fake transport (kept separate from deepseek_test.go's
// replay harness on purpose — the judge tests must not depend on it) -------

// fakeTransport serves canned chat-completion JSON bodies in order (the
// last one repeats once the queue is exhausted, so a test can supply fewer
// responses than the retry loop's max attempts) and records every request
// body it saw into gotBodies.
type fakeTransport struct {
	responses []string
	gotBodies *[]string
}

func (f fakeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	body, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	_ = req.Body.Close()
	*f.gotBodies = append(*f.gotBodies, string(body))

	idx := len(*f.gotBodies) - 1
	next := f.responses[len(f.responses)-1]
	if idx < len(f.responses) {
		next = f.responses[idx]
	}
	return &http.Response{
		StatusCode: 200,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(next)),
		Request:    req,
	}, nil
}

func newTestJudge(t *testing.T, rt http.RoundTripper, m *UsageMeter) *Judge {
	t.Helper()
	j, err := NewJudge(DeepSeekConfig{
		APIKey:     "test-key",
		HTTPClient: &http.Client{Transport: rt},
		Meter:      m,
	})
	if err != nil {
		t.Fatalf("NewJudge: %v", err)
	}
	return j
}

func newJudgeTestMeter(t *testing.T) *UsageMeter {
	t.Helper()
	m, err := OpenUsageMeter(filepath.Join(t.TempDir(), "budget.json"), 10)
	if err != nil {
		t.Fatalf("OpenUsageMeter: %v", err)
	}
	return m
}

const toolCallResponse = `{
  "id": "fake-1",
  "object": "chat.completion",
  "created": 1,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "finish_reason": "tool_calls",
      "message": {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {"name": "record_label", "arguments": "{\"label\":\"hallucinated\",\"rationale\":\"r\"}"}
          }
        ]
      }
    }
  ],
  "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}
}`

const toolCallResponseUnknownLabel = `{
  "id": "fake-1",
  "object": "chat.completion",
  "created": 1,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "finish_reason": "tool_calls",
      "message": {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {"name": "record_label", "arguments": "{\"label\":\"bogus-label\",\"rationale\":\"r\"}"}
          }
        ]
      }
    }
  ],
  "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}
}`

const malformedToolCallResponse = `{
  "id": "fake-2",
  "object": "chat.completion",
  "created": 1,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {"role": "assistant", "content": "I cannot produce a tool call."}
    }
  ],
  "usage": {"prompt_tokens": 100, "completion_tokens": 10, "total_tokens": 110}
}`

const emptyContentResponse = `{
  "id": "fake-3",
  "object": "chat.completion",
  "created": 1,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {"role": "assistant", "content": ""}
    }
  ],
  "usage": {"prompt_tokens": 100, "completion_tokens": 0, "total_tokens": 100}
}`

const fallbackContentResponse = `{
  "id": "fake-4",
  "object": "chat.completion",
  "created": 1,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {"role": "assistant", "content": "{\"label\":\"correctly-unverified\",\"rationale\":\"honest [unverified]\"}"}
    }
  ],
  "usage": {"prompt_tokens": 100, "completion_tokens": 15, "total_tokens": 115}
}`

const fallbackContentUnknownLabelResponse = `{
  "id": "fake-5",
  "object": "chat.completion",
  "created": 1,
  "model": "deepseek-v4-flash",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {"role": "assistant", "content": "{\"label\":\"bogus-label\",\"rationale\":\"r\"}"}
    }
  ],
  "usage": {"prompt_tokens": 100, "completion_tokens": 15, "total_tokens": 115}
}`

// ---- tests ------------------------------------------------------------

func TestJudgeLabelClaimHappyToolCallPath(t *testing.T) {
	var bodies []string
	rt := fakeTransport{responses: []string{toolCallResponse}, gotBodies: &bodies}
	j := newTestJudge(t, rt, newJudgeTestMeter(t))

	v, err := j.LabelClaim(context.Background(), "basil pairs with tomato", "flavorgraph pairing:basil")
	if err != nil {
		t.Fatalf("LabelClaim: %v", err)
	}
	if v.Label != "hallucinated" || v.Rationale != "r" {
		t.Fatalf("verdict = %+v, want {hallucinated r}", v)
	}
	if len(bodies) != 1 {
		t.Fatalf("made %d calls, want 1", len(bodies))
	}
	body := bodies[0]
	if !strings.Contains(body, "deepseek-v4-flash") {
		t.Errorf("request body does not contain model %q", "deepseek-v4-flash")
	}
	if !strings.Contains(body, "record_label") {
		t.Errorf("request body does not contain tool name %q", "record_label")
	}
	if !strings.Contains(body, "grounded-mischaracterized") {
		t.Errorf("request body does not contain the rubric string %q", "grounded-mischaracterized")
	}
	if strings.Contains(body, "arm") {
		t.Errorf("request body contains the substring %q — the judge must never see the arm", "arm")
	}
}

func TestJudgeLabelClaimEnumGuard(t *testing.T) {
	var bodies []string
	// Every attempt gets the same out-of-enum label back: the guard must
	// reject it every time, ending in exhaustion.
	rt := fakeTransport{responses: []string{toolCallResponseUnknownLabel}, gotBodies: &bodies}
	j := newTestJudge(t, rt, newJudgeTestMeter(t))

	_, err := j.LabelClaim(context.Background(), "claim text", "source")
	if err == nil {
		t.Fatal("LabelClaim with an out-of-enum label succeeded, want error")
	}
	var ex *ExhaustedError
	if !errors.As(err, &ex) {
		t.Fatalf("err = %v (%T), want *ExhaustedError", err, err)
	}
}

func TestJudgeLabelClaimEmptyContentRetriesThenExhausts(t *testing.T) {
	var bodies []string
	rt := fakeTransport{
		responses: []string{
			malformedToolCallResponse, // attempt 1: strict, no tool call -> fallback
			emptyContentResponse,      // attempt 2: fallback, empty caveat
			emptyContentResponse,      // attempt 3: fallback, empty caveat
		},
		gotBodies: &bodies,
	}
	j := newTestJudge(t, rt, newJudgeTestMeter(t))

	_, err := j.LabelClaim(context.Background(), "claim text", "source")
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
	if len(bodies) != 3 {
		t.Fatalf("made %d calls, want 3", len(bodies))
	}
}

func TestJudgeLabelClaimMalformedToolCallFallsBackToJSONObject(t *testing.T) {
	var bodies []string
	rt := fakeTransport{
		responses: []string{
			malformedToolCallResponse, // attempt 1: strict, no tool call
			fallbackContentResponse,   // attempt 2: fallback, success
		},
		gotBodies: &bodies,
	}
	j := newTestJudge(t, rt, newJudgeTestMeter(t))

	v, err := j.LabelClaim(context.Background(), "claim text", "")
	if err != nil {
		t.Fatalf("LabelClaim: %v", err)
	}
	if v.Label != "correctly-unverified" {
		t.Fatalf("Label = %q, want correctly-unverified", v.Label)
	}
	if len(bodies) != 2 {
		t.Fatalf("made %d calls, want 2 (strict then fallback)", len(bodies))
	}
	if strings.Contains(bodies[0], "response_format") {
		t.Error("first (strict) call must not set response_format")
	}
	if !strings.Contains(bodies[1], `"response_format":{"type":"json_object"}`) {
		t.Errorf("fallback request body does not set response_format json_object: %s", bodies[1])
	}
}

func TestNewJudgeWithoutMeterErrors(t *testing.T) {
	if _, err := NewJudge(DeepSeekConfig{APIKey: "k"}); err == nil {
		t.Fatal("NewJudge without a UsageMeter succeeded — the budget hard-stop is not optional")
	}
	if _, err := NewJudge(DeepSeekConfig{Meter: newJudgeTestMeter(t)}); err == nil {
		t.Fatal("NewJudge without an API key succeeded")
	}
}

// TestJudgeDefaultsToDefaultJudgeModel pins that NewJudge defaults to
// deepseek-v4-flash (distinct from DeepSeek's deepseek-v4-pro) unless a
// model is explicitly configured.
func TestJudgeDefaultsToDefaultJudgeModel(t *testing.T) {
	j := newTestJudge(t, fakeTransport{responses: []string{toolCallResponse}, gotBodies: &[]string{}}, newJudgeTestMeter(t))
	if j.Model() != DefaultJudgeModel {
		t.Fatalf("Model() = %q, want %q", j.Model(), DefaultJudgeModel)
	}
	if DefaultJudgeModel == DefaultDeepSeekModel {
		t.Fatal("judge model must differ from the generator model (PREREG §9 Amendment 1)")
	}
}

// TestJudgeEnumGuardCoversJSONObjectFallback proves the post-decode
// knownJudgeLabel guard fires on the json_object fallback path too, not only
// the strict tool-call path: a malformed tool call demotes to the fallback,
// whose response decodes cleanly but carries an off-list label — that must be
// rejected every attempt, ending in *ExhaustedError. (The strict-path enum
// case is TestJudgeLabelClaimEnumGuard.)
func TestJudgeEnumGuardCoversJSONObjectFallback(t *testing.T) {
	var bodies []string
	rt := fakeTransport{
		responses: []string{
			malformedToolCallResponse,           // attempt 1: strict, no tool call -> fallback
			fallbackContentUnknownLabelResponse, // attempt 2+: fallback, off-list label
		},
		gotBodies: &bodies,
	}
	j := newTestJudge(t, rt, newJudgeTestMeter(t))

	_, err := j.LabelClaim(context.Background(), "claim text", "source")
	var ex *ExhaustedError
	if !errors.As(err, &ex) {
		t.Fatalf("err = %v (%T), want *ExhaustedError", err, err)
	}
	if ex.Attempts != 3 {
		t.Fatalf("Attempts = %d, want 3 (1 try + 2 retries)", ex.Attempts)
	}
	// The exhausting cause must be the unknown-label guard, not empty-content
	// or malformed-tool-call — proving the guard ran on the fallback decode.
	if !strings.Contains(ex.Last.Error(), "unknown label") {
		t.Fatalf("last error = %v, want the unknown-label guard failure", ex.Last)
	}
	// Attempts 2 and 3 must have been json_object fallback calls: this is the
	// path the guard is being proven to cover.
	if len(bodies) != 3 {
		t.Fatalf("made %d calls, want 3", len(bodies))
	}
	for _, i := range []int{1, 2} {
		if !strings.Contains(bodies[i], `"response_format":{"type":"json_object"}`) {
			t.Errorf("call %d was not a json_object fallback call: %s", i, bodies[i])
		}
	}
}

// TestJudgeLabelCopiesMatchJudgeLabels drift-pins the two hand-written copies
// of the five frozen labels against the single source, JudgeLabels: the tool
// schema's label enum (judgeSchemaJSON) and judge.tmpl's wire-values line. A
// stale copy fails here instead of silently confusing the model at label
// time.
func TestJudgeLabelCopiesMatchJudgeLabels(t *testing.T) {
	// (a) judgeSchemaJSON's properties.label.enum must be exactly the five.
	var schema struct {
		Properties struct {
			Label struct {
				Enum []string `json:"enum"`
			} `json:"label"`
		} `json:"properties"`
	}
	if err := json.Unmarshal([]byte(judgeSchemaJSON), &schema); err != nil {
		t.Fatalf("judgeSchemaJSON is not valid JSON: %v", err)
	}
	gotEnum := schema.Properties.Label.Enum
	if len(gotEnum) != len(JudgeLabels) {
		t.Fatalf("schema label enum has %d values %v, want the %d JudgeLabels %v",
			len(gotEnum), gotEnum, len(JudgeLabels), JudgeLabels)
	}
	enumSet := map[string]bool{}
	for _, v := range gotEnum {
		enumSet[v] = true
	}
	for _, want := range JudgeLabels {
		if !enumSet[want] {
			t.Errorf("schema label enum %v is missing JudgeLabels value %q", gotEnum, want)
		}
	}

	// (b) judge.tmpl's wire-values line must list all five. Find the sentence
	// that introduces them and assert each label appears within it.
	tmpl, err := promptFS.ReadFile("prompts/judge.tmpl")
	if err != nil {
		t.Fatalf("read judge.tmpl: %v", err)
	}
	marker := "The five wire values for the `label` field are:"
	idx := strings.Index(string(tmpl), marker)
	if idx < 0 {
		t.Fatalf("judge.tmpl has no wire-values line (marker %q)", marker)
	}
	// The wrapped sentence runs to the next blank line; a generous window
	// covers it without pulling in the claim block below.
	window := string(tmpl)[idx:]
	if end := strings.Index(window, "\n\n"); end >= 0 {
		window = window[:end]
	}
	for _, want := range JudgeLabels {
		if !strings.Contains(window, want) {
			t.Errorf("judge.tmpl wire-values line does not list %q\n--- line ---\n%s", want, window)
		}
	}
}

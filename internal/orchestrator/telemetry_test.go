package orchestrator

import (
	"context"
	"path/filepath"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/telemetry"
)

// newEnvTracer is newEnv with a recording OTel tracer wired in, returning
// the in-memory exporter the tests assert against.
func newEnvTracer(t *testing.T) (*env, *tracetest.InMemoryExporter) {
	t.Helper()
	exp := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exp))
	t.Cleanup(func() { _ = tp.Shutdown(context.Background()) })

	st, err := store.Open(filepath.Join(t.TempDir(), "orch.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	e := &env{st: st, log: eventlog.New(st), llm: &fakeLLM{}, outcomes: make(chan Outcome, 32)}
	e.orch = New(Deps{
		Store:             st,
		Log:               e.log,
		LLM:               e.llm,
		Safety:            services.StubSafetyGate{},
		Nutrition:         services.StubNutrition{},
		Cost:              services.StubCost{},
		Grounding:         grounding.Stub{},
		CostCitation:      testCostCitation,
		NutritionCitation: testNutritionCitation,
		Tracer:            telemetry.NewOTelTracer(tp),
		Notify:            func(o Outcome) { e.outcomes <- o },
	})
	return e, exp
}

// spanAttrs flattens a recorded span's string attributes.
func spanAttrs(s tracetest.SpanStub) map[string]string {
	m := map[string]string{}
	for _, kv := range s.Attributes {
		m[string(kv.Key)] = kv.Value.AsString()
	}
	return m
}

// TestSpanPerGenerateMove: one creative move = one llm.generate_move span
// carrying session_id/arm/move_type — and the gate verb that resolves it
// (plus every eventlog append along the way) adds NO spans: domain events
// stay eventlog-only (SPEC §5 no-double-tracing).
func TestSpanPerGenerateMove(t *testing.T) {
	e, exp := newEnvTracer(t)
	e.createDish(t, "d1", false)

	_, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, "keep it bright")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)

	spans := exp.GetSpans()
	if len(spans) != 1 {
		t.Fatalf("spans after one creative move = %d, want 1", len(spans))
	}
	if spans[0].Name != "llm.generate_move" {
		t.Errorf("span name = %q, want llm.generate_move", spans[0].Name)
	}
	attrs := spanAttrs(spans[0])
	want := map[string]string{"session_id": session, "arm": llm.ArmNone, "move_type": llm.MoveTypeSeedExpand}
	for k, v := range want {
		if attrs[k] != v {
			t.Errorf("span attr %s = %q, want %q (all: %v)", k, attrs[k], v, attrs)
		}
	}

	// Gate accept: appends gate_accept + stores a version — zero new spans.
	_, err = e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("Gate accept: %v", err)
	}
	if got := len(exp.GetSpans()); got != 1 {
		t.Errorf("spans after gate accept = %d, want still 1 (gate verbs/eventlog appends must not trace)", got)
	}
}

// TestSpanPerGenerateMoveAlternatives: alternatives re-samples twice — two
// GenerateMove calls, two spans, each fully attributed.
func TestSpanPerGenerateMoveAlternatives(t *testing.T) {
	e, exp := newEnvTracer(t)
	e.createDish(t, "d1", false)

	_, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, "")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)

	_, err = e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAlternatives,
	})
	if err != nil {
		t.Fatalf("Gate alternatives: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)

	spans := exp.GetSpans()
	if len(spans) != 3 {
		t.Fatalf("spans after move + alternatives = %d, want 3 (1 + 2 re-samples)", len(spans))
	}
	for i, s := range spans {
		if s.Name != "llm.generate_move" {
			t.Errorf("span[%d] name = %q, want llm.generate_move", i, s.Name)
		}
		attrs := spanAttrs(s)
		for _, k := range []string{"session_id", "arm", "move_type"} {
			if attrs[k] == "" {
				t.Errorf("span[%d] missing attr %s (all: %v)", i, k, attrs)
			}
		}
	}
}

// TestNoSpanForDeterministicMove: deterministic moves are services-computed —
// no GenerateMove call, no span (spans wrap llm calls ONLY).
func TestNoSpanForDeterministicMove(t *testing.T) {
	e, exp := newEnvTracer(t)
	e.createDish(t, "d1", false)
	e.seedVersion(t, "d1", safeDraft())

	_, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeCostRecompute, "")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	if got := len(exp.GetSpans()); got != 0 {
		t.Errorf("spans after deterministic move = %d, want 0", got)
	}
}

package telemetry

import (
	"context"
	"encoding/base64"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// TestSetupNoopWithoutKeys: any missing Langfuse credential means exporting
// is disabled — Setup returns the phase-1 no-op, a callable shutdown, and no
// error (missing secrets are non-fatal, SPEC §7).
func TestSetupNoopWithoutKeys(t *testing.T) {
	cases := []struct {
		name string
		cfg  Config
	}{
		{"all absent", Config{}},
		{"public key absent", Config{SecretKey: "sk-lf-x", Host: "https://cloud.langfuse.com"}},
		{"secret key absent", Config{PublicKey: "pk-lf-x", Host: "https://cloud.langfuse.com"}},
		{"host absent", Config{PublicKey: "pk-lf-x", SecretKey: "sk-lf-x"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tr, shutdown, err := Setup(tc.cfg)
			if err != nil {
				t.Fatalf("Setup: %v", err)
			}
			if _, ok := tr.(Noop); !ok {
				t.Errorf("Setup tracer = %T, want telemetry.Noop", tr)
			}
			if shutdown == nil {
				t.Fatal("Setup returned nil shutdown func")
			}
			if err := shutdown(context.Background()); err != nil {
				t.Errorf("shutdown: %v", err)
			}
		})
	}
}

// TestSetupWithKeysReturnsOTelTracer: all three credentials select the real
// OTel-backed tracer. No spans are created and none exported — construction
// and shutdown must not need the network.
func TestSetupWithKeysReturnsOTelTracer(t *testing.T) {
	tr, shutdown, err := Setup(Config{
		PublicKey: "pk-lf-x", SecretKey: "sk-lf-x",
		Host: "http://127.0.0.1:0", // unroutable loopback: nothing is exported in this test
	})
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if _, ok := tr.(Noop); ok {
		t.Fatal("Setup returned the no-op tracer, want the OTel-backed one")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("shutdown: %v", err)
	}
}

// TestSetupRejectsMalformedHost: a host that is not an absolute http(s) URL
// is a configuration error, surfaced at startup rather than at first export.
func TestSetupRejectsMalformedHost(t *testing.T) {
	for _, host := range []string{"cloud.langfuse.com", "ftp://cloud.langfuse.com", "://bad"} {
		if _, _, err := Setup(Config{PublicKey: "pk", SecretKey: "sk", Host: host}); err == nil {
			t.Errorf("Setup(host=%q) succeeded, want an error", host)
		}
	}
}

// TestLangfuseHeaders: the OTLP exporter must send Basic auth over
// base64(pk:sk) plus the required ingestion-version header (SPEC §5 wiring —
// "easy to get wrong once").
func TestLangfuseHeaders(t *testing.T) {
	h := langfuseHeaders("pk-lf-123", "sk-lf-456")
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("pk-lf-123:sk-lf-456"))
	if got := h["Authorization"]; got != wantAuth {
		t.Errorf("Authorization = %q, want %q", got, wantAuth)
	}
	if got := h["x-langfuse-ingestion-version"]; got != "4" {
		t.Errorf("x-langfuse-ingestion-version = %q, want \"4\"", got)
	}
	if len(h) != 2 {
		t.Errorf("headers = %v, want exactly Authorization + x-langfuse-ingestion-version", h)
	}
}

// TestLangfuseEndpointURL: traces post to ${LANGFUSE_HOST}/api/public/otel's
// OTLP traces path, tolerating a trailing slash on the configured host.
func TestLangfuseEndpointURL(t *testing.T) {
	for _, host := range []string{"https://cloud.langfuse.com", "https://cloud.langfuse.com/"} {
		got, err := langfuseEndpointURL(host)
		if err != nil {
			t.Fatalf("langfuseEndpointURL(%q): %v", host, err)
		}
		want := "https://cloud.langfuse.com/api/public/otel/v1/traces"
		if got != want {
			t.Errorf("langfuseEndpointURL(%q) = %q, want %q", host, got, want)
		}
	}
}

// TestOTelTracerSpanAttrs: StartSpan opens a real span carrying every Attr,
// and the end func closes exactly that span (verified via the SDK's
// in-memory recording exporter).
func TestOTelTracerSpanAttrs(t *testing.T) {
	exp := tracetest.NewInMemoryExporter()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exp))
	t.Cleanup(func() { _ = tp.Shutdown(context.Background()) })

	tr := NewOTelTracer(tp)
	ctx, end := tr.StartSpan(context.Background(), "llm.generate_move",
		Attr{Key: "session_id", Value: "sess-1"},
		Attr{Key: "arm", Value: "none"},
		Attr{Key: "move_type", Value: "seed_expand"},
	)
	if ctx == nil {
		t.Fatal("StartSpan returned nil context")
	}
	if got := len(exp.GetSpans()); got != 0 {
		t.Fatalf("exported spans before end() = %d, want 0", got)
	}
	end()

	spans := exp.GetSpans()
	if len(spans) != 1 {
		t.Fatalf("exported spans = %d, want 1", len(spans))
	}
	s := spans[0]
	if s.Name != "llm.generate_move" {
		t.Errorf("span name = %q, want llm.generate_move", s.Name)
	}
	got := map[string]string{}
	for _, kv := range s.Attributes {
		got[string(kv.Key)] = kv.Value.AsString()
	}
	want := map[string]string{"session_id": "sess-1", "arm": "none", "move_type": "seed_expand"}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("span attr %s = %q, want %q (all: %v)", k, got[k], v, got)
		}
	}
}

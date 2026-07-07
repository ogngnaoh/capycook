// OTel-Go wiring for the Tracer seam (task 3.5; SPEC §5): OTLP/HTTP to
// Langfuse — gRPC is unsupported by Langfuse's ingestion path. Spans are
// created only around llm.GenerateMove calls (the orchestrator's call site);
// domain events stay eventlog-only (no double-tracing).
package telemetry

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

// Config carries the Langfuse credentials (SPEC §7 env: LANGFUSE_PUBLIC_KEY,
// LANGFUSE_SECRET_KEY, LANGFUSE_HOST). Any empty field disables exporting.
type Config struct {
	PublicKey string
	SecretKey string
	Host      string // e.g. https://cloud.langfuse.com
}

// Setup returns the process Tracer and a shutdown func that flushes pending
// spans (call it during graceful shutdown). With all three credentials set
// it wires OTel-Go → OTLP/HTTP → ${Host}/api/public/otel; otherwise it
// returns the no-op — missing secrets are non-fatal by design.
func Setup(cfg Config) (Tracer, func(context.Context) error, error) {
	noopShutdown := func(context.Context) error { return nil }
	if cfg.PublicKey == "" || cfg.SecretKey == "" || cfg.Host == "" {
		return Noop{}, noopShutdown, nil
	}
	endpoint, err := langfuseEndpointURL(cfg.Host)
	if err != nil {
		return nil, nil, err
	}
	// otlptracehttp.New starts no connection: the HTTP client dials lazily,
	// on first export.
	exp, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpointURL(endpoint),
		otlptracehttp.WithHeaders(langfuseHeaders(cfg.PublicKey, cfg.SecretKey)),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("telemetry: build OTLP exporter: %w", err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(sdkresource.NewWithAttributes(
			semconv.SchemaURL, semconv.ServiceName("capycook"),
		)),
	)
	return NewOTelTracer(tp), tp.Shutdown, nil
}

// NewOTelTracer wraps an OpenTelemetry TracerProvider in the pinned Tracer
// seam. Exported so tests can back it with the SDK's recording exporter.
func NewOTelTracer(tp trace.TracerProvider) Tracer {
	return otelTracer{tracer: tp.Tracer("github.com/ogngnaoh/capycook/internal/telemetry")}
}

type otelTracer struct{ tracer trace.Tracer }

var _ Tracer = otelTracer{}

// StartSpan opens a span carrying every Attr; the returned end func closes
// it.
func (t otelTracer) StartSpan(ctx context.Context, name string, attrs ...Attr) (context.Context, func()) {
	kvs := make([]attribute.KeyValue, len(attrs))
	for i, a := range attrs {
		kvs[i] = attribute.String(a.Key, a.Value)
	}
	ctx, span := t.tracer.Start(ctx, name, trace.WithAttributes(kvs...))
	return ctx, func() { span.End() }
}

// langfuseHeaders is the exact header pair Langfuse's OTLP endpoint
// requires: Basic auth over base64(pk:sk) plus the ingestion-version header
// (SPEC §5 — "easy to get wrong once").
func langfuseHeaders(publicKey, secretKey string) map[string]string {
	return map[string]string{
		"Authorization":                "Basic " + base64.StdEncoding.EncodeToString([]byte(publicKey+":"+secretKey)),
		"x-langfuse-ingestion-version": "4",
	}
}

// langfuseEndpointURL resolves the OTLP traces URL under the host's
// /api/public/otel base path, rejecting anything but an absolute http(s)
// host so misconfiguration fails at startup, not at first export.
func langfuseEndpointURL(host string) (string, error) {
	u, err := url.Parse(host)
	if err != nil {
		return "", fmt.Errorf("telemetry: parse LANGFUSE_HOST %q: %w", host, err)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", fmt.Errorf("telemetry: LANGFUSE_HOST %q must be an absolute http(s) URL", host)
	}
	return strings.TrimRight(host, "/") + "/api/public/otel/v1/traces", nil
}

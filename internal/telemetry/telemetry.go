// Package telemetry wires OpenTelemetry-Go through an OTLP/HTTP exporter
// to Langfuse; it must not duplicate eventlog's job (P0-B; SPEC §3/§5).
// Phase 1 ships the minimal Tracer seam plus a no-op; the real OTel-Go
// wiring lands in phase 3 behind the same interface.
package telemetry

import "context"

// Attr is one string span attribute (session_id / arm / move_type ride on
// every llm span, spec Phase 3).
type Attr struct{ Key, Value string }

// Tracer is the minimal tracing seam. StartSpan returns a derived context
// and an end function the caller invokes exactly once when the span
// finishes.
type Tracer interface {
	StartSpan(ctx context.Context, name string, attrs ...Attr) (context.Context, func())
}

package telemetry

import "context"

// Noop is the do-nothing Tracer used until phase 3 wires real OTel — and
// after that, whenever exporting is disabled.
type Noop struct{}

var _ Tracer = Noop{}

// StartSpan returns the context unchanged and an end func that does
// nothing.
func (Noop) StartSpan(ctx context.Context, _ string, _ ...Attr) (context.Context, func()) {
	return ctx, func() {}
}

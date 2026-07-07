package telemetry

import (
	"context"
	"testing"
)

func TestNoopStartSpan(t *testing.T) {
	type key struct{}
	ctx := context.WithValue(context.Background(), key{}, "v")
	got, end := Noop{}.StartSpan(ctx, "llm.generate_move",
		Attr{Key: "arm", Value: "ungrounded"},
		Attr{Key: "move_type", Value: "seed_expand"},
	)
	if got != ctx {
		t.Errorf("StartSpan returned a different context, want the input unchanged")
	}
	if end == nil {
		t.Fatalf("StartSpan returned nil end func")
	}
	end() // must not panic
}

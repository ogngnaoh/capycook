package eval

import (
	"testing"

	"github.com/ogngnaoh/capycook/internal/llm"
)

// TestJudgeLabelsMatchRatesConstants pins llm.JudgeLabels — duplicated there
// because internal/llm must not import internal/eval (this package already
// imports internal/llm, so the reverse import would cycle) — against this
// package's own frozen §7a wire constants. The two copies of the five
// frozen labels must never drift apart.
func TestJudgeLabelsMatchRatesConstants(t *testing.T) {
	want := [5]string{
		LabelGroundedCorrect,
		LabelGroundedMischaracterized,
		LabelCorrectlyUnverified,
		LabelHallucinated,
		LabelOpinionNonCheckable,
	}
	if llm.JudgeLabels != want {
		t.Fatalf("llm.JudgeLabels = %v, want %v (kept in lockstep with PREREG §7a)", llm.JudgeLabels, want)
	}
}

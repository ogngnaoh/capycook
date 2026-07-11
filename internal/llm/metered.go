package llm

import (
	"context"

	"github.com/ogngnaoh/capycook/internal/proposal"
)

// Metered wraps any LLM with the UsageMeter budget hard-stop, mirroring what
// DeepSeek.GenerateMove already does inline (budget.go / deepseek.go): a
// PreCheck refuses the call before any work once cumulative spend has reached
// the LLM_BUDGET_USD cap, and the orchestrator maps that error to move_failed
// (never proposal_blocked). It exists so the budget-exhaustion path is
// reachable in stub mode — the stub reports no usage, so spend never accrues
// and only an explicitly-zero cap (LLM_BUDGET_USD=0) trips the refusal, which
// is exactly the BC-H-4 budget profile.
//
// Inner and Meter are both required. Wrapping the live DeepSeek client here
// would double-count nothing (this wrapper records no usage) but would add a
// redundant pre-check, so cmd/server wraps only the stub.
type Metered struct {
	Inner LLM
	Meter *UsageMeter
}

var _ LLM = Metered{}

// GenerateMove runs the budget pre-check, then delegates. Recording usage is
// left to the inner implementation (DeepSeek records its own; the stub has no
// usage to report), so this wrapper never double-counts.
func (m Metered) GenerateMove(ctx context.Context, req MoveRequest) (proposal.Proposal, error) {
	if err := m.Meter.PreCheck(); err != nil {
		return proposal.Proposal{}, err
	}
	return m.Inner.GenerateMove(ctx, req)
}

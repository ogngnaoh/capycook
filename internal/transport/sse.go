package transport

import (
	"fmt"
	"net/http"

	"github.com/ogngnaoh/capycook/internal/proposal"
)

// SSE event names (pinned contract, spec §4).
const (
	EventToken           = "token"
	EventProposalReady   = "proposal-ready"
	EventProposalBlocked = "proposal-blocked"
	EventMoveCancelled   = "move-cancelled"
	EventMoveFailed      = "move-failed"
)

// Wire payloads (pinned contract; camelCase keys matching the HTTP API).
// The blocked payload never carries the proposal: it was discarded by the
// safety screen before the outcome ever reached this package.
type tokenEvent struct {
	MoveID string `json:"moveId"`
	Text   string `json:"text"`
}

type proposalReadyEvent struct {
	MoveID   string            `json:"moveId"`
	Proposal proposal.Proposal `json:"proposal"`
}

type proposalBlockedEvent struct {
	MoveID string `json:"moveId"`
	Reason string `json:"reason"`
	RuleID string `json:"ruleId"`
}

type moveCancelledEvent struct {
	MoveID string `json:"moveId"`
}

type moveFailedEvent struct {
	MoveID string `json:"moveId"`
	Reason string `json:"reason"`
}

// subscriber is one open SSE connection. After registration every write —
// greeting, events, pings — happens on the dish loop goroutine, which is
// what makes the writes race-free without a per-subscriber lock. gone is
// closed by the loop exactly when the subscriber leaves its set; ServeStream
// blocks on it before letting the ResponseWriter go out of scope.
type subscriber struct {
	w     http.ResponseWriter
	flush http.Flusher
	gone  chan struct{}
}

// writeEvent writes one framed SSE event and flushes it out immediately
// (Flush after every write, spec §4a).
func (s *subscriber) writeEvent(name string, data []byte) error {
	if _, err := fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", name, data); err != nil {
		return err
	}
	s.flush.Flush()
	return nil
}

// writeComment writes an SSE comment line (the ": connected" greeting and
// the ": ping" heartbeat) and flushes it.
func (s *subscriber) writeComment(text string) error {
	if _, err := fmt.Fprintf(s.w, ": %s\n\n", text); err != nil {
		return err
	}
	s.flush.Flush()
	return nil
}

// ServeStream handles GET /api/dishes/{id}/stream: it subscribes the
// connection to the dish's hub and blocks until the client disconnects
// (request context cancelled — the subscription is then cleaned up) or the
// hub shuts down. Routing owns extracting dishID; this is the one persistent
// per-dish EventSource of the pinned contract.
func (h *Hub) ServeStream(w http.ResponseWriter, r *http.Request, dishID string) {
	flush, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "transport: streaming unsupported", http.StatusInternalServerError)
		return
	}
	d := h.dish(dishID, true)
	if d == nil {
		http.Error(w, "transport: hub is shut down", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flush.Flush()

	sub := &subscriber{w: w, flush: flush, gone: make(chan struct{})}
	if !d.subscribe(sub) {
		return // hub shut down while connecting
	}
	select {
	case <-r.Context().Done():
		d.unsubscribe(sub) // blocks until the loop confirms: no write after return
	case <-sub.gone:
		// dropped by the loop (write error) or hub shutdown
	}
}

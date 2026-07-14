// Package transport turns orchestrator move outcomes into the pinned SSE
// events over one persistent per-dish EventSource, plus the replay-cancel
// primitive the cancel endpoint wires up (P0-9; SPEC §3/§4a).
//
// Each dish gets a single goroutine running a select loop that owns every
// write for that dish — subscriptions, tokens, terminal events, heartbeats —
// so no write ever races another (the single-goroutine-select-loop pattern of
// SPEC §4a). Outcomes arrive via Notify, which httpapi plugs into
// orchestrator.Deps.Notify: every one is safety-screened by construction
// before this package ever sees it, so a blocked move reaches a client only
// as proposal-blocked{reason,ruleId,ops} — the held change's ops only, never
// a token, never the full proposal payload. That holds for OutcomeToken too:
// the orchestrator only emits it for a single-proposal move whose own early
// safety verdict — run on a preview of the SAME proposal it later commits —
// already cleared, so live tokens can never precede or outrun the screen
// (orchestrator.generate's OnDraft path; the milestone's founding finding —
// rationale streams DURING generation, not only after it completes).
//
// A ready outcome's rationale is not necessarily replayed at all: when the
// generation already streamed it live as OutcomeToken events,
// Outcome.SkipRationaleReplay says so and the hub jumps straight to
// proposal-ready. Otherwise (alternatives' second-and-later proposals, a
// non-streaming LLM implementation, or any zero-latency/fast-profile run)
// the stored Proposal.Rationale is replayed word-by-word as token events at
// TokenCadence (default ~30ms) exactly as before — this is also what a late
// subscriber's catch-up rides. Hub.Cancel interrupts a replay in flight —
// tokens stop, move-cancelled is emitted — covering the window after the
// orchestrator has already committed the move to awaiting_gate and its own
// Cancel is a no-op (e.g. mid-replay of alternatives' staggered second
// card). auto_advanced outcomes are deliberately not emitted: they are not a
// pinned SSE event, and deterministic moves resolve before their HTTP
// request returns, so the client re-syncs via GET.
package transport

import (
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// Defaults for Options zero values.
const (
	DefaultTokenCadence = 30 * time.Millisecond
	DefaultHeartbeat    = 15 * time.Second
)

// Options tunes the hub; zero values take the defaults. Tests inject a tiny
// TokenCadence so replays finish fast.
type Options struct {
	TokenCadence time.Duration // delay between rationale token writes
	Heartbeat    time.Duration // ": ping" comment interval per connection
}

// Hub fans move outcomes out to per-dish SSE subscribers.
type Hub struct {
	tokenCadence time.Duration
	heartbeat    time.Duration
	done         chan struct{} // closed by Close; stops every dish loop

	mu     sync.Mutex
	closed bool
	dishes map[string]*dishHub
}

// New builds a Hub. Callers should Close it on shutdown to stop the dish
// loops.
func New(opts Options) *Hub {
	if opts.TokenCadence <= 0 {
		opts.TokenCadence = DefaultTokenCadence
	}
	if opts.Heartbeat <= 0 {
		opts.Heartbeat = DefaultHeartbeat
	}
	return &Hub{
		tokenCadence: opts.TokenCadence,
		heartbeat:    opts.Heartbeat,
		done:         make(chan struct{}),
		dishes:       make(map[string]*dishHub),
	}
}

// Close stops every dish loop and releases all subscribers. Idempotent.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	close(h.done)
}

// Notify delivers one resolved move outcome to the dish's loop. It is the
// orchestrator's Deps.Notify hook.
func (h *Hub) Notify(out orchestrator.Outcome) {
	d := h.dish(out.DishID, true)
	if d == nil {
		return
	}
	select {
	case d.outcomes <- out:
	case <-h.done:
	}
}

// Cancel interrupts the dish's rationale replay if one is in flight: token
// events stop and move-cancelled is emitted. It reports whether a replay was
// actually interrupted, so the cancel endpoint can treat "nothing streaming"
// as a no-op — mirroring the orchestrator's first-transition-wins rule.
func (h *Hub) Cancel(dishID string) bool {
	d := h.dish(dishID, false)
	if d == nil {
		return false
	}
	reply := make(chan bool, 1)
	select {
	case d.cancels <- reply:
		select {
		case interrupted := <-reply:
			return interrupted
		case <-h.done:
			return false
		}
	case <-h.done:
		return false
	}
}

// subscribers reports the dish's live subscriber count (test hook).
func (h *Hub) subscribers(dishID string) int {
	d := h.dish(dishID, false)
	if d == nil {
		return 0
	}
	return int(d.subCount.Load())
}

// dish returns the dish's hub, creating it (and starting its loop) when
// create is set. Returns nil once the hub is closed or when a non-creating
// lookup misses.
func (h *Hub) dish(dishID string, create bool) *dishHub {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return nil
	}
	d, ok := h.dishes[dishID]
	if !ok && create {
		d = &dishHub{
			hub:      h,
			dishID:   dishID,
			outcomes: make(chan orchestrator.Outcome, 16),
			subs:     make(chan subReq),
			cancels:  make(chan chan bool),
		}
		h.dishes[dishID] = d
		go d.run()
	}
	return d
}

// subReq adds or removes one subscriber on the dish loop.
type subReq struct {
	s   *subscriber
	add bool
}

// dishHub is one dish's fan-out: channels into the loop goroutine that owns
// all of the dish's writes.
type dishHub struct {
	hub      *Hub
	dishID   string
	outcomes chan orchestrator.Outcome
	subs     chan subReq
	cancels  chan chan bool
	subCount atomic.Int64
}

// subscribe registers sub with the loop; false means the hub already shut
// down. The loop greets the subscriber (": connected") on registration, so a
// client that has seen the greeting is guaranteed to receive every outcome
// notified afterwards.
func (d *dishHub) subscribe(s *subscriber) bool {
	select {
	case d.subs <- subReq{s: s, add: true}:
		return true
	case <-d.hub.done:
		return false
	}
}

// unsubscribe removes sub and blocks until the loop confirms (gone closed),
// so the caller's ResponseWriter is never written after it returns. The loop
// closes every gone channel on shutdown, so this cannot deadlock with Close.
func (d *dishHub) unsubscribe(s *subscriber) {
	select {
	case d.subs <- subReq{s: s, add: false}:
		<-s.gone
	case <-s.gone:
	}
}

// replay is an in-flight rationale replay: the words still to stream for
// queue[0], then its proposal-ready, then the next proposal (alternatives
// deliver two).
type replay struct {
	moveID string
	words  []string
	queue  []proposal.Proposal
}

// run is the dish's single writer: every SSE byte for this dish is written
// from this goroutine (SPEC §4a).
func (d *dishHub) run() {
	subs := make(map[*subscriber]struct{})
	heartbeat := time.NewTicker(d.hub.heartbeat)
	defer heartbeat.Stop()

	var (
		rp     *replay
		timer  *time.Timer
		timerC <-chan time.Time
	)

	drop := func(s *subscriber) {
		delete(subs, s)
		close(s.gone)
		d.subCount.Store(int64(len(subs)))
	}
	broadcast := func(name string, payload any) {
		data, err := json.Marshal(payload)
		if err != nil {
			slog.Error("transport: marshal SSE payload", "dish", d.dishID, "event", name, "err", err)
			return
		}
		for s := range subs {
			if err := s.writeEvent(name, data); err != nil {
				drop(s)
			}
		}
	}
	stopReplay := func() {
		if rp == nil {
			return
		}
		rp = nil
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timerC = nil
	}
	startReplay := func(out orchestrator.Outcome) {
		stopReplay()
		rp = &replay{
			moveID: out.MoveID,
			queue:  out.Proposals,
		}
		// SkipRationaleReplay: the first proposal's rationale already
		// reached subscribers live, as OutcomeToken events during
		// generation (orchestrator.generate's OnDraft path) — replaying it
		// here too would duplicate the proposing card's text. Any further
		// proposal (alternatives) still replays normally below.
		if !out.SkipRationaleReplay {
			rp.words = strings.Fields(out.Proposals[0].Rationale)
		}
		timer = time.NewTimer(d.hub.tokenCadence)
		timerC = timer.C
	}
	// step emits the next token — or, once the current proposal's words are
	// out, its proposal-ready — then re-arms the cadence timer or finishes.
	step := func() {
		if rp == nil {
			return
		}
		if len(rp.words) > 0 {
			text := rp.words[0]
			rp.words = rp.words[1:]
			if len(rp.words) > 0 {
				text += " "
			}
			broadcast(EventToken, tokenEvent{MoveID: rp.moveID, Text: text})
			if len(rp.words) > 0 {
				timer.Reset(d.hub.tokenCadence)
				return
			}
		}
		broadcast(EventProposalReady, proposalReadyEvent{MoveID: rp.moveID, Proposal: rp.queue[0]})
		rp.queue = rp.queue[1:]
		if len(rp.queue) == 0 {
			stopReplay()
			return
		}
		rp.words = strings.Fields(rp.queue[0].Rationale)
		timer.Reset(d.hub.tokenCadence)
	}

	for {
		select {
		case <-d.hub.done:
			for s := range subs {
				close(s.gone)
			}
			return

		case req := <-d.subs:
			if req.add {
				subs[req.s] = struct{}{}
				d.subCount.Store(int64(len(subs)))
				if err := req.s.writeComment("connected"); err != nil {
					drop(req.s)
				}
			} else if _, ok := subs[req.s]; ok {
				drop(req.s)
			}

		case out := <-d.outcomes:
			switch out.Kind {
			case orchestrator.OutcomeToken:
				// Live rationale, forwarded as generate() produces it — the
				// orchestrator only ever sends these for a move its own
				// early safety screen already cleared (never a blocked
				// one), so no gating is needed here.
				broadcast(EventToken, tokenEvent{MoveID: out.MoveID, Text: out.Token})
			case orchestrator.OutcomeReady:
				if len(out.Proposals) == 0 {
					slog.Error("transport: ready outcome without proposals", "dish", d.dishID, "move", out.MoveID)
					continue
				}
				startReplay(out)
			case orchestrator.OutcomeBlocked:
				stopReplay()
				broadcast(EventProposalBlocked, proposalBlockedEvent{MoveID: out.MoveID, Reason: out.Reason, RuleID: out.RuleID, Ops: out.Ops})
			case orchestrator.OutcomeCancelled:
				stopReplay()
				broadcast(EventMoveCancelled, moveCancelledEvent{MoveID: out.MoveID})
			case orchestrator.OutcomeFailed:
				stopReplay()
				broadcast(EventMoveFailed, moveFailedEvent{MoveID: out.MoveID, Reason: out.Reason})
			case orchestrator.OutcomeAutoAdvanced:
				// Not a pinned SSE event; the client re-syncs via GET.
			default:
				slog.Warn("transport: unknown outcome kind", "dish", d.dishID, "kind", out.Kind)
			}

		case <-timerC:
			step()

		case reply := <-d.cancels:
			if rp == nil {
				reply <- false
				continue
			}
			moveID := rp.moveID
			stopReplay()
			broadcast(EventMoveCancelled, moveCancelledEvent{MoveID: moveID})
			reply <- true

		case <-heartbeat.C:
			for s := range subs {
				if err := s.writeComment("ping"); err != nil {
					drop(s)
				}
			}
		}
	}
}

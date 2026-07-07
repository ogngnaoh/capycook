package transport

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

const waitTimeout = 3 * time.Second

// --- helpers ---

func newTestHub(t *testing.T, opts Options) *Hub {
	t.Helper()
	if opts.TokenCadence == 0 {
		opts.TokenCadence = time.Millisecond
	}
	h := New(opts)
	t.Cleanup(h.Close)
	return h
}

func serveDish(t *testing.T, h *Hub, dishID string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.ServeStream(w, r, dishID)
	}))
	t.Cleanup(srv.Close)
	return srv
}

type sseEvent struct {
	Name string
	Data string
}

// stream is one client-side SSE subscription: a goroutine parses the wire
// format into events and comments.
type stream struct {
	events   chan sseEvent
	comments chan string
	close    func()
}

func openStream(t *testing.T, url string) *stream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		cancel()
		t.Fatalf("NewRequest: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		cancel()
		t.Fatalf("GET %s: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		cancel()
		t.Fatalf("GET %s: status %d, want 200", url, resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		cancel()
		t.Fatalf("Content-Type = %q, want text/event-stream", ct)
	}
	s := &stream{
		events:   make(chan sseEvent, 256),
		comments: make(chan string, 256),
		close: func() {
			cancel()
			resp.Body.Close()
		},
	}
	t.Cleanup(s.close)
	go func() {
		defer close(s.events)
		sc := bufio.NewScanner(resp.Body)
		var name, data string
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, ":"):
				select {
				case s.comments <- strings.TrimSpace(strings.TrimPrefix(line, ":")):
				default:
				}
			case strings.HasPrefix(line, "event: "):
				name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				data = strings.TrimPrefix(line, "data: ")
			case line == "":
				if name != "" || data != "" {
					s.events <- sseEvent{Name: name, Data: data}
					name, data = "", ""
				}
			}
		}
	}()
	return s
}

// awaitConnected blocks until the hub's ": connected" greeting arrives —
// proof the subscription is registered in the dish loop, so a Notify after
// this cannot race the subscribe.
func (s *stream) awaitConnected(t *testing.T) {
	t.Helper()
	deadline := time.After(waitTimeout)
	for {
		select {
		case c := <-s.comments:
			if c == "connected" {
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for connected greeting")
		}
	}
}

func (s *stream) next(t *testing.T) sseEvent {
	t.Helper()
	select {
	case ev, ok := <-s.events:
		if !ok {
			t.Fatal("stream closed while waiting for an event")
		}
		return ev
	case <-time.After(waitTimeout):
		t.Fatal("timed out waiting for an SSE event")
	}
	panic("unreachable")
}

// collectUntil reads events up to and including the first one named stop.
func (s *stream) collectUntil(t *testing.T, stop string) []sseEvent {
	t.Helper()
	var evs []sseEvent
	for {
		ev := s.next(t)
		evs = append(evs, ev)
		if ev.Name == stop {
			return evs
		}
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(waitTimeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func sampleProposal(id, moveID, rationale string) proposal.Proposal {
	return proposal.Proposal{
		ID:           id,
		MoveID:       moveID,
		MoveType:     "flavor_direction",
		TargetFields: []string{"/ingredients"},
		Rationale:    rationale,
		Confidence:   0.8,
	}
}

// sentinel notifies a distinctly-named failed outcome; reading until its
// move-failed event bounds "nothing else was emitted" assertions without
// sleeping.
func sentinel(h *Hub, dishID string) {
	h.Notify(orchestrator.Outcome{
		DishID: dishID, MoveID: "mv_sentinel",
		Kind: orchestrator.OutcomeFailed, Reason: "sentinel",
	})
}

// wire payload shapes (pinned contract, camelCase keys)
type tokenData struct {
	MoveID string `json:"moveId"`
	Text   string `json:"text"`
}
type readyData struct {
	MoveID   string            `json:"moveId"`
	Proposal proposal.Proposal `json:"proposal"`
}
type blockedData struct {
	MoveID string `json:"moveId"`
	Reason string `json:"reason"`
	RuleID string `json:"ruleId"`
}
type cancelledData struct {
	MoveID string `json:"moveId"`
}
type failedData struct {
	MoveID string `json:"moveId"`
	Reason string `json:"reason"`
}

func decode[T any](t *testing.T, ev sseEvent) T {
	t.Helper()
	var v T
	if err := json.Unmarshal([]byte(ev.Data), &v); err != nil {
		t.Fatalf("decode %s payload %q: %v", ev.Name, ev.Data, err)
	}
	return v
}

// --- tests ---

func TestReadyReplaysTokensThenProposalReady(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	rationale := "Char the leeks hard, then mellow them in brown butter."
	h.Notify(orchestrator.Outcome{
		DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeReady,
		Proposals: []proposal.Proposal{sampleProposal("pr_1", "mv_1", rationale)},
	})

	evs := s.collectUntil(t, "proposal-ready")
	words := strings.Fields(rationale)
	if got, want := len(evs), len(words)+1; got != want {
		t.Fatalf("got %d events, want %d tokens + 1 proposal-ready", got, want)
	}
	var replayed strings.Builder
	for _, ev := range evs[:len(evs)-1] {
		if ev.Name != "token" {
			t.Fatalf("event before proposal-ready is %q, want token", ev.Name)
		}
		tok := decode[tokenData](t, ev)
		if tok.MoveID != "mv_1" {
			t.Errorf("token moveId = %q, want mv_1", tok.MoveID)
		}
		replayed.WriteString(tok.Text)
	}
	if got, want := replayed.String(), strings.Join(words, " "); got != want {
		t.Errorf("replayed rationale = %q, want %q", got, want)
	}
	rd := decode[readyData](t, evs[len(evs)-1])
	if rd.MoveID != "mv_1" {
		t.Errorf("proposal-ready moveId = %q, want mv_1", rd.MoveID)
	}
	if rd.Proposal.ID != "pr_1" || rd.Proposal.Rationale != rationale {
		t.Errorf("proposal-ready proposal = %+v, want full proposal pr_1", rd.Proposal)
	}
}

func TestReadyWithEmptyRationaleEmitsNoTokens(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	h.Notify(orchestrator.Outcome{
		DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeReady,
		Proposals: []proposal.Proposal{sampleProposal("pr_1", "mv_1", "")},
	})

	evs := s.collectUntil(t, "proposal-ready")
	if len(evs) != 1 {
		t.Fatalf("got %d events %v, want just proposal-ready", len(evs), evs)
	}
}

func TestAlternativesReplayEachProposalInOrder(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	h.Notify(orchestrator.Outcome{
		DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeReady,
		Proposals: []proposal.Proposal{
			sampleProposal("pr_1", "mv_1", "alpha beta"),
			sampleProposal("pr_2", "mv_1", "gamma delta epsilon"),
		},
	})

	first := s.collectUntil(t, "proposal-ready")
	second := s.collectUntil(t, "proposal-ready")
	wantNames := func(evs []sseEvent, tokens int) {
		t.Helper()
		if len(evs) != tokens+1 {
			t.Fatalf("got %d events, want %d tokens + 1 proposal-ready", len(evs), tokens)
		}
		for _, ev := range evs[:tokens] {
			if ev.Name != "token" {
				t.Fatalf("got event %q, want token", ev.Name)
			}
		}
	}
	wantNames(first, 2)
	wantNames(second, 3)
	if id := decode[readyData](t, first[len(first)-1]).Proposal.ID; id != "pr_1" {
		t.Errorf("first proposal-ready carries %q, want pr_1", id)
	}
	if id := decode[readyData](t, second[len(second)-1]).Proposal.ID; id != "pr_2" {
		t.Errorf("second proposal-ready carries %q, want pr_2", id)
	}
}

func TestBlockedEmitsOnlyProposalBlocked(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	h.Notify(orchestrator.Outcome{
		DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeBlocked,
		Reason: "anaerobic garlic-in-oil risk", RuleID: "anaerobic-garlic-oil",
	})
	sentinel(h, "d1")

	evs := s.collectUntil(t, "move-failed")
	for _, ev := range evs {
		if ev.Name == "token" || ev.Name == "proposal-ready" {
			t.Fatalf("blocked move emitted %q — must emit ONLY proposal-blocked", ev.Name)
		}
	}
	if len(evs) != 2 || evs[0].Name != "proposal-blocked" {
		t.Fatalf("got events %v, want exactly [proposal-blocked move-failed]", evs)
	}
	bd := decode[blockedData](t, evs[0])
	if bd.MoveID != "mv_1" || bd.Reason != "anaerobic garlic-in-oil risk" || bd.RuleID != "anaerobic-garlic-oil" {
		t.Errorf("proposal-blocked payload = %+v", bd)
	}
	// No proposal payload rides on the blocked event.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(evs[0].Data), &raw); err != nil {
		t.Fatalf("decode blocked payload: %v", err)
	}
	if _, ok := raw["proposal"]; ok {
		t.Error("proposal-blocked payload carries a proposal — it must not")
	}
}

func TestCancelMidReplayStopsTokensAndEmitsMoveCancelled(t *testing.T) {
	h := newTestHub(t, Options{TokenCadence: 5 * time.Millisecond})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	rationale := strings.TrimSpace(strings.Repeat("word ", 200))
	h.Notify(orchestrator.Outcome{
		DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeReady,
		Proposals: []proposal.Proposal{sampleProposal("pr_1", "mv_1", rationale)},
	})

	// Let the replay demonstrably start, then cancel it mid-flight.
	for i := 0; i < 2; i++ {
		if ev := s.next(t); ev.Name != "token" {
			t.Fatalf("got event %q, want token", ev.Name)
		}
	}
	if !h.Cancel("d1") {
		t.Fatal("Cancel mid-replay = false, want true")
	}

	evs := s.collectUntil(t, "move-cancelled")
	for _, ev := range evs[:len(evs)-1] {
		if ev.Name != "token" {
			t.Fatalf("got event %q before move-cancelled, want only tokens", ev.Name)
		}
	}
	if got := decode[cancelledData](t, evs[len(evs)-1]).MoveID; got != "mv_1" {
		t.Errorf("move-cancelled moveId = %q, want mv_1", got)
	}

	// After move-cancelled: no more tokens, no proposal-ready.
	sentinel(h, "d1")
	for _, ev := range s.collectUntil(t, "move-failed") {
		if ev.Name == "token" || ev.Name == "proposal-ready" {
			t.Fatalf("cancelled replay still emitted %q", ev.Name)
		}
	}

	if h.Cancel("d1") {
		t.Error("Cancel with no replay in flight = true, want false")
	}
	if h.Cancel("never-seen-dish") {
		t.Error("Cancel on an unknown dish = true, want false")
	}
}

func TestOutcomeKindsMapToEvents(t *testing.T) {
	tests := []struct {
		name      string
		out       orchestrator.Outcome
		wantEvent string
	}{
		{
			name:      "cancelled outcome emits move-cancelled",
			out:       orchestrator.Outcome{DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeCancelled},
			wantEvent: "move-cancelled",
		},
		{
			name:      "failed outcome emits move-failed with reason",
			out:       orchestrator.Outcome{DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeFailed, Reason: "llm exploded"},
			wantEvent: "move-failed",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newTestHub(t, Options{})
			srv := serveDish(t, h, "d1")
			s := openStream(t, srv.URL)
			s.awaitConnected(t)

			h.Notify(tt.out)
			ev := s.next(t)
			if ev.Name != tt.wantEvent {
				t.Fatalf("got event %q, want %q", ev.Name, tt.wantEvent)
			}
			switch tt.wantEvent {
			case "move-cancelled":
				if d := decode[cancelledData](t, ev); d.MoveID != "mv_1" {
					t.Errorf("payload = %+v", d)
				}
			case "move-failed":
				if d := decode[failedData](t, ev); d.MoveID != "mv_1" || d.Reason != "llm exploded" {
					t.Errorf("payload = %+v", d)
				}
			}
		})
	}
}

func TestAutoAdvancedEmitsNothing(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	h.Notify(orchestrator.Outcome{
		DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeAutoAdvanced,
		Proposals:    []proposal.Proposal{sampleProposal("pr_1", "mv_1", "scaled the batch")},
		NewVersionID: "ver_1",
	})
	sentinel(h, "d1")

	evs := s.collectUntil(t, "move-failed")
	if len(evs) != 1 {
		t.Fatalf("auto_advanced emitted %v — not a pinned SSE event, must emit nothing", evs[:len(evs)-1])
	}
}

func TestHeartbeatPings(t *testing.T) {
	h := newTestHub(t, Options{Heartbeat: 20 * time.Millisecond})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	deadline := time.After(waitTimeout)
	for {
		select {
		case c := <-s.comments:
			if c == "ping" {
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for a heartbeat ping")
		}
	}
}

func TestClientDisconnectCleansUpSubscription(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s := openStream(t, srv.URL)
	s.awaitConnected(t)

	waitFor(t, "subscriber registration", func() bool { return h.subscribers("d1") == 1 })
	s.close()
	waitFor(t, "subscription cleanup", func() bool { return h.subscribers("d1") == 0 })

	// Notifying with no subscribers must not wedge or panic.
	h.Notify(orchestrator.Outcome{DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeFailed, Reason: "x"})
}

func TestBroadcastReachesEverySubscriber(t *testing.T) {
	h := newTestHub(t, Options{})
	srv := serveDish(t, h, "d1")
	s1 := openStream(t, srv.URL)
	s1.awaitConnected(t)
	s2 := openStream(t, srv.URL)
	s2.awaitConnected(t)

	h.Notify(orchestrator.Outcome{DishID: "d1", MoveID: "mv_1", Kind: orchestrator.OutcomeFailed, Reason: "x"})
	for _, s := range []*stream{s1, s2} {
		if ev := s.next(t); ev.Name != "move-failed" {
			t.Fatalf("subscriber got %q, want move-failed", ev.Name)
		}
	}
}

func TestStreamsAreScopedPerDish(t *testing.T) {
	h := newTestHub(t, Options{})
	srvA := serveDish(t, h, "dish-a")
	srvB := serveDish(t, h, "dish-b")
	sa := openStream(t, srvA.URL)
	sa.awaitConnected(t)
	sb := openStream(t, srvB.URL)
	sb.awaitConnected(t)

	h.Notify(orchestrator.Outcome{DishID: "dish-b", MoveID: "mv_b", Kind: orchestrator.OutcomeFailed, Reason: "x"})
	if ev := sb.next(t); ev.Name != "move-failed" {
		t.Fatalf("dish-b subscriber got %q, want move-failed", ev.Name)
	}
	sentinel(h, "dish-a")
	evs := sa.collectUntil(t, "move-failed")
	if len(evs) != 1 {
		t.Fatalf("dish-a subscriber saw dish-b traffic: %v", evs[:len(evs)-1])
	}
}

// nonFlusher hides httptest.ResponseRecorder's Flush.
type nonFlusher struct{ w http.ResponseWriter }

func (n nonFlusher) Header() http.Header         { return n.w.Header() }
func (n nonFlusher) Write(b []byte) (int, error) { return n.w.Write(b) }
func (n nonFlusher) WriteHeader(code int)        { n.w.WriteHeader(code) }

func TestServeStreamRequiresFlusher(t *testing.T) {
	h := newTestHub(t, Options{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/dishes/d1/stream", nil)
	h.ServeStream(nonFlusher{rec}, req, "d1")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 for a non-flushable writer", rec.Code)
	}
}

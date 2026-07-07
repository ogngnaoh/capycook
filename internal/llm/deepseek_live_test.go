package llm

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// Live smoke test + recorder path (task 3.3). Runs ONLY under
// CAPYCOOK_LIVE_TEST=1 with a real DEEPSEEK_API_KEY — i.e. after Gate B.
// Everything else in this package replays hand-authored synthetic_*.json
// fixtures; this test is the sole producer of real recorded_*.json wire
// recordings.

// recordingTransport tees every chat-completion response body into
// testdata/recorded/recorded_*.json so a real exchange becomes a replayable
// fixture.
type recordingTransport struct {
	base http.RoundTripper
	dir  string
	n    int
}

func (rt *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := rt.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	rt.n++
	name := fmt.Sprintf("recorded_%d_%02d.json", time.Now().Unix(), rt.n)
	if werr := os.WriteFile(filepath.Join(rt.dir, name), body, 0o644); werr != nil {
		return nil, werr
	}
	return resp, nil
}

// TestLiveSmokeGenerateMove drives ONE real GenerateMove against the live
// DeepSeek API, within budget, recording the wire response. Skipped unless
// CAPYCOOK_LIVE_TEST=1 (Gate B rail: no live LLM calls before then).
func TestLiveSmokeGenerateMove(t *testing.T) {
	if os.Getenv("CAPYCOOK_LIVE_TEST") != "1" {
		t.Skip("live smoke skipped: set CAPYCOOK_LIVE_TEST=1 with a real DEEPSEEK_API_KEY (post-Gate-B only)")
	}
	key := os.Getenv("DEEPSEEK_API_KEY")
	if key == "" {
		t.Fatal("CAPYCOOK_LIVE_TEST=1 but DEEPSEEK_API_KEY is empty")
	}
	capUSD := 10.0
	if v := os.Getenv("LLM_BUDGET_USD"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			t.Fatalf("LLM_BUDGET_USD=%q: %v", v, err)
		}
		capUSD = f
	}
	meter, err := OpenUsageMeter(filepath.Join(t.TempDir(), "budget.json"), capUSD)
	if err != nil {
		t.Fatal(err)
	}
	rec := &recordingTransport{base: http.DefaultTransport, dir: filepath.Join("testdata", "recorded")}
	ds, err := NewDeepSeek(DeepSeekConfig{
		APIKey:     key,
		Meter:      meter,
		HTTPClient: &http.Client{Transport: rec},
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	p, err := ds.GenerateMove(ctx, MoveRequest{
		Draft:    baseDraft(),
		MoveType: MoveTypeFlavorDirection,
		Steer:    "lean brighter and more acidic",
	})
	if err != nil {
		t.Fatalf("live GenerateMove: %v", err)
	}
	if len(p.Change) == 0 {
		t.Error("live proposal changed nothing")
	}
	if p.Confidence < 0 || p.Confidence > 1 {
		t.Errorf("Confidence = %v, want [0,1]", p.Confidence)
	}
	if _, err := baseDraft().Apply(p.Change); err != nil {
		t.Errorf("live diff does not apply: %v", err)
	}
	spent := meter.Spent()
	if spent <= 0 || spent > capUSD {
		t.Errorf("Spent() = %v, want (0, %v]", spent, capUSD)
	}
	t.Logf("live smoke ok: %d ops, confidence %.2f, spent $%.4f, recorded %d response(s)",
		len(p.Change), p.Confidence, spent, rec.n)
}

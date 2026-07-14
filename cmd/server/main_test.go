package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ogngnaoh/capycook/internal/config"
)

// testHandler wires the full stack — real data-backed services from the
// committed data/ assets — against a temp database.
func testHandler(t *testing.T) http.Handler {
	t.Helper()
	handler, cleanup, err := wire(config.Config{
		Port:    "0",
		DBPath:  filepath.Join(t.TempDir(), "server.db"),
		DataDir: filepath.Join("..", "..", "data"),
		// The stub edge is budget-metered (BC-H-4); mirror config.Load's
		// default cap so moves aren't refused pre-call (LLM_BUDGET_USD=0).
		LLMBudgetUSD: 10,
	})
	if err != nil {
		t.Fatalf("wire: %v", err)
	}
	t.Cleanup(cleanup)
	return handler
}

// TestWireFailsWithoutDataAssets: wiring the real services demands the data/
// CSVs — a deployment (e.g. a container image) that ships without them must
// fail at startup, not at first use.
func TestWireFailsWithoutDataAssets(t *testing.T) {
	_, cleanup, err := wire(config.Config{
		Port:    "0",
		DBPath:  filepath.Join(t.TempDir(), "server.db"),
		DataDir: t.TempDir(), // no CSVs here
	})
	if err == nil {
		cleanup()
		t.Fatal("wire with an empty data dir succeeded, want a load error")
	}
}

// statusOf fetches GET /api/status from a wired handler.
func statusOf(t *testing.T, handler http.Handler) map[string]any {
	t.Helper()
	srv := httptest.NewServer(handler)
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/api/status")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/status = %d, want 200", resp.StatusCode)
	}
	var st map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatal(err)
	}
	return st
}

// TestStatusStubModeWithoutKey: no DEEPSEEK_API_KEY => Phase-1 stub LLM,
// reported on /api/status (the UI's "stub mode — no model key" banner
// source).
func TestStatusStubModeWithoutKey(t *testing.T) {
	st := statusOf(t, testHandler(t))
	if st["llm_mode"] != "stub" {
		t.Fatalf("llm_mode = %v, want stub", st["llm_mode"])
	}
}

// TestStatusLiveModeWithKey: a key selects the real DeepSeek client (no
// network at wiring time) and exposes the budget meter.
func TestStatusLiveModeWithKey(t *testing.T) {
	handler, cleanup, err := wire(config.Config{
		Port:           "0",
		DBPath:         filepath.Join(t.TempDir(), "server.db"),
		DataDir:        filepath.Join("..", "..", "data"),
		DeepSeekAPIKey: "test-key-not-used",
		LLMBudgetUSD:   10,
	})
	if err != nil {
		t.Fatalf("wire: %v", err)
	}
	defer cleanup()
	st := statusOf(t, handler)
	if st["llm_mode"] != "live" {
		t.Fatalf("llm_mode = %v, want live", st["llm_mode"])
	}
	if st["model"] != "deepseek-v4-pro" {
		t.Fatalf("model = %v, want deepseek-v4-pro", st["model"])
	}
	if st["budget_cap_usd"] != 10.0 || st["budget_spent_usd"] != 0.0 {
		t.Fatalf("budget = %v/%v, want 0/10", st["budget_spent_usd"], st["budget_cap_usd"])
	}
}

// TestStatusStubLLMOverridesKey: CAPYCOOK_STUB_LLM forces the stub even
// with a key present.
func TestStatusStubLLMOverridesKey(t *testing.T) {
	handler, cleanup, err := wire(config.Config{
		Port:           "0",
		DBPath:         filepath.Join(t.TempDir(), "server.db"),
		DataDir:        filepath.Join("..", "..", "data"),
		DeepSeekAPIKey: "test-key-not-used",
		StubLLM:        true,
	})
	if err != nil {
		t.Fatalf("wire: %v", err)
	}
	defer cleanup()
	if st := statusOf(t, handler); st["llm_mode"] != "stub" {
		t.Fatalf("llm_mode = %v, want stub (CAPYCOOK_STUB_LLM set)", st["llm_mode"])
	}
}

func TestHealthzReturnsOK(t *testing.T) {
	srv := httptest.NewServer(testHandler(t))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"status":"ok"}` {
		t.Fatalf("body = %q, want {\"status\":\"ok\"}", string(body))
	}
}

// TestWiredCreateDish smoke-tests the assembled stack end to end: the API
// surface, store, and event log are all live behind one handler.
func TestWiredCreateDish(t *testing.T) {
	srv := httptest.NewServer(testHandler(t))
	defer srv.Close()

	req, err := http.NewRequest("POST", srv.URL+"/api/dishes",
		strings.NewReader(`{"seed":"charred carrots","constraints":{"dietary":[],"allergens":[],"equipment":[],"skill":"beginner","servings":2,"on_hand":[],"cuisine":"western"}}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Session-Id", "sess-main")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 201 (body %s)", resp.StatusCode, body)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"state":"idle"`) {
		t.Fatalf("body = %s, want an idle dish detail", body)
	}
}

// dishView is the slice of GET /api/dishes/{id} the wired-loop test reads.
type dishView struct {
	ID    string `json:"id"`
	State string `json:"state"`
	Draft struct {
		Ingredients []struct {
			Name     string  `json:"name"`
			FDCID    *string `json:"fdc_id"`
			FoodOnID *string `json:"foodon_id"`
		} `json:"ingredients"`
		Analysis struct {
			Cost struct {
				TotalUSD    float64  `json:"total_usd"`
				Approximate bool     `json:"approximate"`
				Missing     []string `json:"missing"`
			} `json:"cost"`
			Nutrition struct {
				Calories   float64  `json:"calories"`
				Unverified []string `json:"unverified"`
			} `json:"nutrition"`
		} `json:"analysis"`
	} `json:"draft"`
	PendingProposal *struct {
		ID string `json:"id"`
	} `json:"pendingProposal"`
	Blocked *struct {
		RuleID string `json:"ruleId"`
	} `json:"blocked"`
}

func do(t *testing.T, method, url, body string, want int) []byte {
	t.Helper()
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Session-Id", "sess-main")
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		t.Fatalf("%s %s = %d, want %d (body %s)", method, url, resp.StatusCode, want, out)
	}
	return out
}

// waitDishState polls the dish until it reaches the wanted state (generation
// is asynchronous behind the 202).
func waitDishState(t *testing.T, base, dishID, want string) dishView {
	t.Helper()
	var dv dishView
	for i := 0; i < 200; i++ {
		out := do(t, "GET", base+"/api/dishes/"+dishID, "", http.StatusOK)
		if err := json.Unmarshal(out, &dv); err != nil {
			t.Fatalf("unmarshal dish: %v (%s)", err, out)
		}
		if dv.State == want {
			return dv
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("dish %s never reached state %q (last %q)", dishID, want, dv.State)
	return dv
}

// TestWiredRealServicesLoop proves the REAL data-backed edges are wired:
// grounding resolves ids (incl. the "flat-leaf parsley" alias) into the
// accepted snapshot, accept recomputes REAL analysis (vendored USDA numbers,
// committed cost table with its never-$0 footnote), and the seeded
// garlic-oil case blocks via the real safety gate's
// data/safety/anaerobic_lexicon.csv rule — with a Big-9 allergen declared,
// which the fail-closed allergen check only tolerates because every stub
// ingredient resolves.
func TestWiredRealServicesLoop(t *testing.T) {
	srv := httptest.NewServer(testHandler(t))
	defer srv.Close()

	out := do(t, "POST", srv.URL+"/api/dishes",
		`{"seed":"charred carrot salad","constraints":{"dietary":[],"allergens":["peanuts"],"equipment":[],"skill":"beginner","servings":2,"on_hand":[],"cuisine":"western"}}`,
		http.StatusCreated)
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(out, &created); err != nil || created.ID == "" {
		t.Fatalf("create dish: %v (%s)", err, out)
	}

	do(t, "POST", srv.URL+"/api/dishes/"+created.ID+"/move",
		`{"moveType":"seed_expand","steer":"keep it bright"}`, http.StatusAccepted)
	dv := waitDishState(t, srv.URL, created.ID, "awaiting_gate")
	if dv.PendingProposal == nil {
		t.Fatal("awaiting_gate with no pending proposal")
	}
	do(t, "POST", srv.URL+"/api/dishes/"+created.ID+"/gate",
		`{"proposalId":"`+dv.PendingProposal.ID+`","verb":"accept"}`, http.StatusOK)

	dv = waitDishState(t, srv.URL, created.ID, "idle")
	ids := map[string][2]string{} // name -> {fdc_id, foodon_id}
	for _, ing := range dv.Draft.Ingredients {
		var fdc, foodon string
		if ing.FDCID != nil {
			fdc = *ing.FDCID
		}
		if ing.FoodOnID != nil {
			foodon = *ing.FoodOnID
		}
		ids[ing.Name] = [2]string{fdc, foodon}
	}
	// Vendored ids: data/usda/nutrients.csv + data/foodon/allergens.csv;
	// "flat-leaf parsley" resolves only through data/aliases.csv -> parsley.
	if got := ids["olive oil"]; got[0] != "171413" || got[1] != "FOODON_03301826" {
		t.Errorf("olive oil ids = %v, want vendored 171413 / FOODON_03301826", got)
	}
	if got := ids["flat-leaf parsley"]; got[0] != "170416" || got[1] != "FOODON_03000230" {
		t.Errorf("flat-leaf parsley ids = %v, want alias-resolved 170416 / FOODON_03000230", got)
	}
	// Real analysis, not services-stub placeholders (420 kcal / $12.40).
	nut := dv.Draft.Analysis.Nutrition
	if nut.Calories <= 0 || nut.Calories == 420 {
		t.Errorf("calories = %v, want a real USDA-derived value", nut.Calories)
	}
	cost := dv.Draft.Analysis.Cost
	if !cost.Approximate || cost.TotalUSD <= 0 || cost.TotalUSD == 12.4 {
		t.Errorf("cost = %+v, want a real [approximate] table-derived total", cost)
	}
	// The cost table has no "flat-leaf parsley" row and does no alias
	// resolution: the line is footnoted, never $0.
	missing := strings.Join(cost.Missing, ",")
	if !strings.Contains(missing, "flat-leaf parsley") {
		t.Errorf("cost.missing = %v, want the unpriced flat-leaf parsley footnote", cost.Missing)
	}

	do(t, "POST", srv.URL+"/api/dishes/"+created.ID+"/move",
		`{"moveType":"iterate_feedback","steer":"finish with a garlic oil drizzle"}`, http.StatusAccepted)
	dv = waitDishState(t, srv.URL, created.ID, "blocked")
	if dv.Blocked == nil || dv.Blocked.RuleID != "anaerobic-garlic-oil" {
		t.Errorf("blocked = %+v, want the real lexicon rule anaerobic-garlic-oil", dv.Blocked)
	}
}

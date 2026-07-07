package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func getStatus(t *testing.T, api *API) LLMStatus {
	t.Helper()
	rr := httptest.NewRecorder()
	api.Handler(nil).ServeHTTP(rr, httptest.NewRequest("GET", "/api/status", nil))
	if rr.Code != 200 {
		t.Fatalf("GET /api/status = %d, want 200", rr.Code)
	}
	var st LLMStatus
	if err := json.Unmarshal(rr.Body.Bytes(), &st); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	return st
}

// TestStatusDefaultsToStub: without wiring, /api/status reports stub mode —
// the safe default (no key, no spend).
func TestStatusDefaultsToStub(t *testing.T) {
	api := New(nil, nil, nil, nil)
	st := getStatus(t, api)
	if st.Mode != "stub" {
		t.Fatalf("llm_mode = %q, want stub", st.Mode)
	}
	if st.BudgetSpentUSD != 0 {
		t.Fatalf("budget_spent_usd = %v, want 0", st.BudgetSpentUSD)
	}
}

// TestStatusReportsWiredLLM: cmd/server wires a status callback exposing
// live mode, model, and the budget meter.
func TestStatusReportsWiredLLM(t *testing.T) {
	api := New(nil, nil, nil, nil)
	api.SetLLMStatus(func() LLMStatus {
		return LLMStatus{Mode: "live", Model: "deepseek-v4-pro", BudgetSpentUSD: 1.25, BudgetCapUSD: 10}
	})
	st := getStatus(t, api)
	if st.Mode != "live" || st.Model != "deepseek-v4-pro" {
		t.Fatalf("status = %+v, want live deepseek-v4-pro", st)
	}
	if st.BudgetSpentUSD != 1.25 || st.BudgetCapUSD != 10 {
		t.Fatalf("budget = %v/%v, want 1.25/10", st.BudgetSpentUSD, st.BudgetCapUSD)
	}
}

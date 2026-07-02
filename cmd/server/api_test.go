package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProposalEndpointReturnsStub(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/proposal", nil)
	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["id"] == "" || body["id"] == nil {
		t.Fatalf("expected a proposal id, got %v", body["id"])
	}
}

func TestGateEndpointAcceptsVerb(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/gate", strings.NewReader(`{"proposalId":"stub-1","verb":"accept"}`))
	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"ok":true`) {
		t.Fatalf("want ok:true, got %s", rec.Body.String())
	}
}

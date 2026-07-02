package main

import (
	"encoding/json"
	"net/http"
)

// stubProposal is the hardcoded walking-skeleton proposal (S0.4). The real
// proposal contract lands with internal/proposal in milestone 01.
const stubProposal = `{
  "id": "stub-1",
  "diff": [{"op":"add","path":"ingredients","value":"2 cloves garlic, minced"}],
  "rationale": "Garlic deepens the aromatic base; bloomed in oil before the liquid goes in.",
  "citations": [{"source":"USDA FDC","ref":"11215"}],
  "confidence": 0.72,
  "unverified": ["cook time is an estimate"],
  "safetyBlock": null
}`

func handleProposal(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(stubProposal))
}

func handleGate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProposalID string `json:"proposalId"`
		Verb       string `json:"verb"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Verb == "" {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	// Phase C (blocked on S0.2): persist an accept event via internal/eventlog here.
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

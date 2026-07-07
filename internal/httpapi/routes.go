// Package httpapi mounts the pinned HTTP surface (spec §4) over the store,
// event log, orchestrator, and SSE hub. It owns request decoding, the
// session rule (every mutating request carries a client-minted
// X-Session-Id, stamped onto every event it appends), the exact status
// codes (202/409/404/400), and the two events no move produces:
// dish_created and branch_promoted.
package httpapi

import (
	"net/http"

	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/transport"
)

// API is the HTTP surface over its wired edges.
type API struct {
	store     store.Store
	log       eventlog.EventLog
	orch      *orchestrator.Orchestrator
	hub       *transport.Hub
	llmStatus func() LLMStatus // nil => stub-mode default
}

// LLMStatus is the GET /api/status payload: which model edge is wired
// (stub vs live) and the budget meter, for the UI's stub banner and spend
// display (task 3.3).
type LLMStatus struct {
	Mode           string  `json:"llm_mode"` // stub|live
	Model          string  `json:"model,omitempty"`
	BudgetSpentUSD float64 `json:"budget_spent_usd"`
	BudgetCapUSD   float64 `json:"budget_cap_usd"`
}

// SetLLMStatus wires the status callback (cmd/server). Nil keeps the
// stub-mode default.
func (a *API) SetLLMStatus(fn func() LLMStatus) { a.llmStatus = fn }

// New wires the API over its dependencies.
func New(st store.Store, lg eventlog.EventLog, orch *orchestrator.Orchestrator, hub *transport.Hub) *API {
	return &API{store: st, log: lg, orch: orch, hub: hub}
}

// Handler builds the full route table: /healthz, the /api surface, and spa
// (the embedded SPA handler) as the "/" fallback. A nil spa mounts no
// fallback (tests).
func (a *API) Handler(spa http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("GET /api/status", a.handleStatus)

	mux.HandleFunc("GET /api/dishes", a.handleListDishes)
	mux.HandleFunc("POST /api/dishes", a.handleCreateDish)
	mux.HandleFunc("GET /api/dishes/{id}", a.handleGetDish)
	mux.HandleFunc("PATCH /api/dishes/{id}", a.handlePatchDish)
	mux.HandleFunc("POST /api/dishes/{id}/move", a.handleMove)
	mux.HandleFunc("POST /api/dishes/{id}/cancel", a.handleCancel)
	mux.HandleFunc("POST /api/dishes/{id}/gate", a.handleGate)
	mux.HandleFunc("GET /api/dishes/{id}/versions", a.handleVersions)
	mux.HandleFunc("POST /api/dishes/{id}/promote", a.handlePromote)
	mux.HandleFunc("GET /api/dishes/{id}/stream", a.handleStream)

	if spa != nil {
		mux.Handle("/", spa)
	}
	return mux
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (a *API) handleStatus(w http.ResponseWriter, _ *http.Request) {
	st := LLMStatus{Mode: "stub"}
	if a.llmStatus != nil {
		st = a.llmStatus()
	}
	writeJSON(w, http.StatusOK, st)
}

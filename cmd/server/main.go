// Command server is the CapyCook HTTP entrypoint: config → store → event
// log → real deterministic services + grounding over the committed data/
// assets → orchestrator → SSE hub → httpapi, plus graceful shutdown. The
// LLM edge stays the deterministic stub until Phase 3 (no live LLM calls
// before Gate B).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/ogngnaoh/capycook/internal/config"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/httpapi"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/transport"
	"github.com/ogngnaoh/capycook/web"
)

// Deterministic-citation provenance for the recompute moves (task 2.8).
// Values transcribed from the committed provenance docs — the same set the
// user reviews at Gate A; update them if the assets are re-vendored.
var (
	// data/cost/PROVENANCE.md: assembled 2026-07-07; per-row source + as_of
	// (BLS 2026-05 / ERS 2023 / estimates 2026-07) in prices.csv itself.
	costCitation = proposal.Citation{
		Source: "capycook cost table [approximate]",
		Ref:    "data/cost/prices.csv (assembled 2026-07-07; per-row source + as_of in data/cost/PROVENANCE.md)",
		Date:   "2026-07-07",
	}
	// data/usda/PROVENANCE.md: Foundation Foods 2026-04-30 + SR Legacy
	// 2018-04, vendored 2026-07-06.
	nutritionCitation = proposal.Citation{
		Source: "USDA FoodData Central",
		Ref:    "data/usda/nutrients.csv (Foundation Foods 2026-04-30 + SR Legacy 2018-04; data/usda/PROVENANCE.md)",
		Date:   "2026-07-06",
	}
)

// wire assembles the full application handler over the database at
// cfg.DBPath and the data assets under cfg.DataDir. The returned cleanup
// closes the SSE hub and the store.
func wire(cfg config.Config) (http.Handler, func(), error) {
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		return nil, nil, err
	}
	closeStore := func() {
		if err := st.Close(); err != nil {
			slog.Error("store close failed", "err", err)
		}
	}

	nutrientsCSV := filepath.Join(cfg.DataDir, "usda", "nutrients.csv")
	portionsCSV := filepath.Join(cfg.DataDir, "usda", "portions.csv")
	allergensCSV := filepath.Join(cfg.DataDir, "foodon", "allergens.csv")
	nutrition, err := services.NewUSDANutrition(nutrientsCSV, portionsCSV)
	if err != nil {
		closeStore()
		return nil, nil, err
	}
	cost, err := services.NewTableCost(filepath.Join(cfg.DataDir, "cost", "prices.csv"), portionsCSV)
	if err != nil {
		closeStore()
		return nil, nil, err
	}
	allergen, err := services.NewAllergenChecker(allergensCSV)
	if err != nil {
		closeStore()
		return nil, nil, err
	}
	safety, err := services.NewSafetyGate(
		filepath.Join(cfg.DataDir, "safety", "min_temps.csv"),
		filepath.Join(cfg.DataDir, "safety", "anaerobic_lexicon.csv"),
		filepath.Join(cfg.DataDir, "safety", "protein_classes.csv"),
		allergen,
	)
	if err != nil {
		closeStore()
		return nil, nil, err
	}
	ground, err := grounding.NewService(
		filepath.Join(cfg.DataDir, "flavorgraph", "embeddings.csv"),
		filepath.Join(cfg.DataDir, "aliases.csv"),
		nutrientsCSV,
		allergensCSV,
	)
	if err != nil {
		closeStore()
		return nil, nil, err
	}

	evlog := eventlog.New(st)
	hub := transport.New(transport.Options{})
	orch := orchestrator.New(orchestrator.Deps{
		Store:             st,
		Log:               evlog,
		LLM:               llm.Stub{},
		Safety:            safety,
		Nutrition:         nutrition,
		Cost:              cost,
		Grounding:         ground,
		CostCitation:      costCitation,
		NutritionCitation: nutritionCitation,
		Notify:            hub.Notify,
	})
	api := httpapi.New(st, evlog, orch, hub)
	cleanup := func() {
		hub.Close()
		closeStore()
	}
	return api.Handler(web.Handler()), cleanup, nil
}

func main() {
	cfg := config.Load()

	handler, cleanup, err := wire(cfg)
	if err != nil {
		slog.Error("startup failed", "err", err)
		os.Exit(1)
	}
	defer cleanup()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("server starting", "addr", srv.Addr, "db", cfg.DBPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
	}
}

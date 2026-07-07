// Command server is the CapyCook HTTP entrypoint: config → store → event
// log → stub edges → orchestrator → SSE hub → httpapi, plus graceful
// shutdown. The Phase-1 edges are deterministic stubs behind the real
// interfaces (no live LLM calls before Gate B).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ogngnaoh/capycook/internal/config"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/httpapi"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/transport"
	"github.com/ogngnaoh/capycook/web"
)

// wire assembles the full application handler over the database at
// cfg.DBPath. The returned cleanup closes the SSE hub and the store.
func wire(cfg config.Config) (http.Handler, func(), error) {
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		return nil, nil, err
	}
	evlog := eventlog.New(st)
	hub := transport.New(transport.Options{})
	orch := orchestrator.New(orchestrator.Deps{
		Store:     st,
		Log:       evlog,
		LLM:       llm.Stub{},
		Safety:    services.StubSafetyGate{},
		Nutrition: services.StubNutrition{},
		Cost:      services.StubCost{},
		Grounding: grounding.Stub{},
		Notify:    hub.Notify,
	})
	api := httpapi.New(st, evlog, orch, hub)
	cleanup := func() {
		hub.Close()
		if err := st.Close(); err != nil {
			slog.Error("store close failed", "err", err)
		}
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

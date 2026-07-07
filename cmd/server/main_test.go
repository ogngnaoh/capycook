package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/config"
)

// testHandler wires the full stack against a temp database.
func testHandler(t *testing.T) http.Handler {
	t.Helper()
	handler, cleanup, err := wire(config.Config{Port: "0", DBPath: filepath.Join(t.TempDir(), "server.db")})
	if err != nil {
		t.Fatalf("wire: %v", err)
	}
	t.Cleanup(cleanup)
	return handler
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

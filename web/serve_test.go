package web

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlerServesEmbeddedFile(t *testing.T) {
	srv := httptest.NewServer(Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/.gitkeep")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200 for an embedded file, got %d", resp.StatusCode)
	}
}

// A client-routed path (deep link / reload of /dishes/:id) must serve the
// SPA index directly with 200 — never redirect. Routing the fallback
// through FileServer 301-canonicalizes /index.html to "./", which resolves
// against the client's URL and loops forever (ERR_TOO_MANY_REDIRECTS).
func TestHandlerSPAFallbackNeverRedirects(t *testing.T) {
	srv := httptest.NewServer(Handler())
	defer srv.Close()

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return errors.New("SPA fallback must not redirect")
		},
	}
	resp, err := client.Get(srv.URL + "/dishes/dish_abc123")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	// The embedded test tree may hold only .gitkeep (no built SPA): then
	// the fallback is an honest 404. With an index.html present it must be
	// a 200 carrying the index bytes as HTML.
	switch resp.StatusCode {
	case http.StatusOK:
		if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "text/html") {
			t.Fatalf("want text/html fallback, got %q", ct)
		}
		body, _ := io.ReadAll(resp.Body)
		if len(body) == 0 {
			t.Fatal("fallback served an empty body")
		}
	case http.StatusNotFound:
		// acceptable only when no SPA is embedded
	default:
		t.Fatalf("want 200 (or 404 without a built SPA), got %d", resp.StatusCode)
	}
}

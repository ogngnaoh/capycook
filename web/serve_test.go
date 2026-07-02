package web

import (
	"net/http"
	"net/http/httptest"
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

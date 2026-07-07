package web

import (
	"io/fs"
	"net/http"
	"strings"
)

// Handler serves the embedded SPA. Real files are served directly; any other
// GET (that is not an API or health route) falls back to index.html so the SPA
// can client-route. Returns 404 for index.html when only .gitkeep is embedded.
func Handler() http.Handler {
	sub, err := fs.Sub(Assets, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p != "" && p != "index.html" {
			if _, err := fs.Stat(sub, p); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback: serve the index bytes directly. Routing /index.html
		// through FileServer 301-canonicalizes it to "./", which resolves
		// against the client's URL (/dishes/:id) and loops forever.
		index, err := fs.ReadFile(sub, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	})
}

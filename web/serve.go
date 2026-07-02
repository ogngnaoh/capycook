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
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r2)
	})
}

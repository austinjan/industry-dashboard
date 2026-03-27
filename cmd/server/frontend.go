package main

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed all:frontend_dist
var frontendFS embed.FS

func serveFrontend(r chi.Router) {
	// In dev mode, frontend is served by Vite dev server
	if os.Getenv("DEV_MODE") == "1" {
		return
	}

	distFS, err := fs.Sub(frontendFS, "frontend_dist")
	if err != nil {
		return
	}

	fileServer := http.FileServer(http.FS(distFS))

	// Serve static assets directly
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file. If not found, serve index.html (SPA fallback)
		path := strings.TrimPrefix(r.URL.Path, "/")
		f, err := distFS.Open(path)
		if err != nil || path == "" {
			// SPA fallback - serve index.html
			indexFile, _ := distFS.Open("index.html")
			if indexFile != nil {
				defer indexFile.Close()
				stat, _ := indexFile.Stat()
				http.ServeContent(w, r, "index.html", stat.ModTime(), indexFile.(io.ReadSeeker))
				return
			}
		}
		if f != nil {
			f.Close()
		}
		fileServer.ServeHTTP(w, r)
	})
}

// Package web embeds the built Vite SPA (web/dist) and serves it. The dist
// directory is a build artifact; web/dist/.gitkeep keeps this compilable on a
// fresh checkout before `make web` runs.
package web

import "embed"

//go:embed all:dist
var Assets embed.FS

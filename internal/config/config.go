// Package config loads runtime configuration from the environment
// (SPEC §7). Missing LLM/Langfuse secrets warn but are non-fatal so the
// server can start (e.g. for /healthz) without them.
package config

import (
	"log/slog"
	"os"
)

// Config holds runtime configuration read from the environment.
type Config struct {
	Port              string
	DBPath            string
	DataDir           string // committed data/ assets (CSV tables), not the SQLite home
	DeepSeekAPIKey    string
	LangfusePublicKey string
	LangfuseSecretKey string
	LangfuseHost      string
}

// Load reads configuration from environment variables. Absent secrets are
// logged at warn level and left empty rather than failing.
func Load() Config {
	c := Config{
		Port:              getenvDefault("PORT", "8080"),
		DBPath:            getenvDefault("DB_PATH", "./data/capycook.db"),
		DataDir:           getenvDefault("DATA_DIR", "./data"),
		DeepSeekAPIKey:    os.Getenv("DEEPSEEK_API_KEY"),
		LangfusePublicKey: os.Getenv("LANGFUSE_PUBLIC_KEY"),
		LangfuseSecretKey: os.Getenv("LANGFUSE_SECRET_KEY"),
		LangfuseHost:      os.Getenv("LANGFUSE_HOST"),
	}
	for _, k := range []string{
		"DEEPSEEK_API_KEY", "LANGFUSE_PUBLIC_KEY",
		"LANGFUSE_SECRET_KEY", "LANGFUSE_HOST",
	} {
		if os.Getenv(k) == "" {
			slog.Warn("config: environment variable not set", "key", k)
		}
	}
	return c
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

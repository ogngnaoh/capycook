// Package config loads runtime configuration from the environment
// (SPEC §7). Missing LLM/Langfuse secrets warn but are non-fatal so the
// server can start (e.g. for /healthz) without them.
package config

import (
	"log/slog"
	"os"
	"strconv"
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
	LLMBudgetUSD      float64 // LLM_BUDGET_USD hard spend cap; default 10 (spec §3)
	StubLLM           bool    // CAPYCOOK_STUB_LLM: force the stub LLM even with a key
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
		LLMBudgetUSD:      10,
	}
	if v := os.Getenv("LLM_BUDGET_USD"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			slog.Warn("config: LLM_BUDGET_USD unparsable, keeping default", "value", v, "default", c.LLMBudgetUSD)
		} else {
			c.LLMBudgetUSD = f
		}
	}
	if v := os.Getenv("CAPYCOOK_STUB_LLM"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			slog.Warn("config: CAPYCOOK_STUB_LLM unparsable, keeping default false", "value", v)
		} else {
			c.StubLLM = b
		}
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

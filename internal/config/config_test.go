package config

import "testing"

func TestLoadReadsEnv(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "dk")
	t.Setenv("LANGFUSE_PUBLIC_KEY", "pk")
	t.Setenv("LANGFUSE_SECRET_KEY", "sk")
	t.Setenv("LANGFUSE_HOST", "https://lf.example")
	t.Setenv("PORT", "9090")

	c := Load()

	if c.DeepSeekAPIKey != "dk" || c.LangfusePublicKey != "pk" ||
		c.LangfuseSecretKey != "sk" || c.LangfuseHost != "https://lf.example" {
		t.Fatalf("secrets not read into Config: %+v", c)
	}
	if c.Port != "9090" {
		t.Fatalf("Port = %q, want 9090", c.Port)
	}
}

func TestLoadDefaultsPort(t *testing.T) {
	t.Setenv("PORT", "")
	if got := Load().Port; got != "8080" {
		t.Fatalf("default Port = %q, want 8080", got)
	}
}

func TestLoadDBPath(t *testing.T) {
	t.Setenv("DB_PATH", "")
	if got := Load().DBPath; got != "./data/capycook.db" {
		t.Fatalf("default DBPath = %q, want ./data/capycook.db", got)
	}

	t.Setenv("DB_PATH", "/data/other.db")
	if got := Load().DBPath; got != "/data/other.db" {
		t.Fatalf("DBPath = %q, want /data/other.db", got)
	}
}

func TestLoadDataDir(t *testing.T) {
	t.Setenv("DATA_DIR", "")
	if got := Load().DataDir; got != "./data" {
		t.Fatalf("default DataDir = %q, want ./data", got)
	}

	t.Setenv("DATA_DIR", "/srv/data")
	if got := Load().DataDir; got != "/srv/data" {
		t.Fatalf("DataDir = %q, want /srv/data", got)
	}
}

func TestLoadLLMBudgetUSD(t *testing.T) {
	t.Setenv("LLM_BUDGET_USD", "")
	if got := Load().LLMBudgetUSD; got != 10 {
		t.Fatalf("default LLMBudgetUSD = %v, want 10", got)
	}

	t.Setenv("LLM_BUDGET_USD", "2.5")
	if got := Load().LLMBudgetUSD; got != 2.5 {
		t.Fatalf("LLMBudgetUSD = %v, want 2.5", got)
	}

	t.Setenv("LLM_BUDGET_USD", "not-a-number")
	if got := Load().LLMBudgetUSD; got != 10 {
		t.Fatalf("unparsable LLMBudgetUSD = %v, want default 10", got)
	}
}

func TestLoadStubLLM(t *testing.T) {
	t.Setenv("CAPYCOOK_STUB_LLM", "")
	if Load().StubLLM {
		t.Fatal("StubLLM default = true, want false")
	}
	t.Setenv("CAPYCOOK_STUB_LLM", "1")
	if !Load().StubLLM {
		t.Fatal("CAPYCOOK_STUB_LLM=1 not read")
	}
	t.Setenv("CAPYCOOK_STUB_LLM", "true")
	if !Load().StubLLM {
		t.Fatal("CAPYCOOK_STUB_LLM=true not read")
	}
}

func TestLoadMissingSecretsNonFatal(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "")
	c := Load() // must not panic / must not exit
	if c.DeepSeekAPIKey != "" {
		t.Fatalf("expected empty DeepSeekAPIKey, got %q", c.DeepSeekAPIKey)
	}
}

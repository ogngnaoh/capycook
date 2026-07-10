package eval

// Tests for the plan-4.7 documentation deliverables. These pin the
// anti-fabrication invariants, not prose: the README results table now pins
// the exact digits landed by the milestone-02 live campaign (retuned from the
// original no-data-yet placeholder guard, as its own comment said it would
// be), and the T1 amendment draft pins every spec-§1.9 instrument by commit
// SHA while stating that the USER, never the builder, logs it into
// PREREGISTRATION §9.

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

const (
	readmePath  = "../../README.md"
	t1DraftPath = "../../docs/archive/01-end-to-end/T1-amendment-draft.md"
)

// resultsSection extracts the README's "## Results" section (heading to the
// next "## " heading or EOF).
func resultsSection(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("read README: %v", err)
	}
	body := string(raw)
	start := strings.Index(body, "\n## Results")
	if start < 0 {
		t.Fatalf("README has no \"## Results\" section")
	}
	rest := body[start+1:]
	if end := strings.Index(rest[3:], "\n## "); end >= 0 {
		rest = rest[:3+end]
	}
	return rest
}

// TestREADMEMethodologyLinksPrereg pins that the methodology section links to
// the frozen pre-registration instead of restating it.
func TestREADMEMethodologyLinksPrereg(t *testing.T) {
	raw, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("read README: %v", err)
	}
	body := string(raw)
	start := strings.Index(body, "\n## Methodology")
	if start < 0 {
		t.Fatalf("README has no \"## Methodology\" section")
	}
	section := body[start:]
	if end := strings.Index(section[3:], "\n## "); end >= 0 {
		section = section[:3+end]
	}
	if !strings.Contains(section, "docs/PREREGISTRATION.md") {
		t.Errorf("methodology section does not link docs/PREREGISTRATION.md")
	}
	for _, want := range []string{"h1", "h2", "h3", "single-operator", "κ"} {
		if !strings.Contains(strings.ToLower(section), want) {
			t.Errorf("methodology section missing %q", want)
		}
	}
}

// TestREADMEResultsPinned retunes the former TestREADMEResultsTableEmpty
// anti-fabrication guard now that the milestone-02 live campaign has landed
// (its original doc comment flagged this retune as expected). The guard's
// job flips: instead of pinning the no-data placeholder, it pins the exact
// landed digits, keeping the same anti-fabrication spirit — byte-exact
// strings, never a regex that would wave through any number — so a future
// edit can't silently drift the reported rates or agreement figure.
func TestREADMEResultsPinned(t *testing.T) {
	section := resultsSection(t)

	banner := "**No eval data yet.**"
	if strings.Contains(section, banner) {
		t.Errorf("results section still has the no-data banner %q; milestone-02 data has landed", banner)
	}

	for _, row := range []string{
		"| ungrounded | 150 | 150 | 1.000 | 0.000 | 0.000 |",
		"| flavorgraph | 203 | 203 | 1.000 | 0.000 | 0.000 |",
		"| grounded | 209 | 209 | 1.000 | 0.000 | 0.000 |",
	} {
		if !strings.Contains(section, row) {
			t.Errorf("results section missing landed §7a rate row %q", row)
		}
	}

	if !strings.Contains(section, "15/18") {
		t.Errorf("results section missing the blind-check agreement fraction \"15/18\"")
	}
}

// TestT1AmendmentDraftPinsInstruments pins the plan-4.7 T1 draft: every
// spec-§1.9 instrument path present, a full 40-hex commit SHA, the
// refresh-at-milestone-02 note, the FoodPuzzle-proxy deferral (spec §1.10),
// and the header rule that the USER logs the entry — the builder never edits
// PREREGISTRATION.md.
func TestT1AmendmentDraftPinsInstruments(t *testing.T) {
	raw, err := os.ReadFile(t1DraftPath)
	if err != nil {
		t.Fatalf("read T1 draft: %v", err)
	}
	body := string(raw)

	instruments := []string{
		"internal/llm/prompts/",
		"eval/fixtures/seeds.json",
		"internal/eval/runner.go",
		"data/safety/",
		"eval/fixtures/move_script.json",
		"internal/llm/evidence.go",
		"internal/eval/mapping.go",
	}
	for _, path := range instruments {
		if !strings.Contains(body, path) {
			t.Errorf("T1 draft does not pin instrument %q", path)
		}
	}
	if !regexp.MustCompile(`\b[0-9a-f]{40}\b`).MatchString(body) {
		t.Errorf("T1 draft has no full 40-hex commit SHA pin")
	}
	for _, want := range []string{
		"FoodPuzzle",
		"refreshed",
		"milestone-02 start",
		"the builder never edits",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("T1 draft missing %q", want)
		}
	}
	// The §9 entry itself is a markdown table row: | date | change | reason |.
	rowRe := regexp.MustCompile(`(?m)^\|[^|\n]+\|[^|\n]+\|[^|\n]+\|$`)
	found := false
	for _, row := range rowRe.FindAllString(body, -1) {
		if !strings.Contains(row, "---") && !strings.Contains(row, "Date") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("T1 draft has no three-cell markdown table row (the §9 entry text)")
	}
}

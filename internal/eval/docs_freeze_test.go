package eval

// Tests for the plan-4.7 documentation deliverables. These pin the
// anti-fabrication invariants, not prose: the README results table exists as
// STRUCTURE ONLY (every data cell "—", no numbers — the phase stop-line: no
// label values, gate decisions, or telemetry are ever pre-filled or
// example-filled outside internal/eval/testdata), and the T1 amendment draft
// pins every spec-§1.9 instrument by commit SHA while stating that the USER,
// never the builder, logs it into PREREGISTRATION §9.

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

// TestREADMEResultsTableEmpty pins the anti-fabrication guard on the Results
// section: it must show the exact no-eval-data banner, and until milestone-02
// data lands (this guard gets retuned alongside it) the section is prose-only
// — no markdown table rows at all (qualitative cells like "High"/"Low" are a
// fabrication vector too) and no percentages anywhere, in cells or prose. The
// all-dash-row and rate-like-cell checks remain as belt-and-braces.
func TestREADMEResultsTableEmpty(t *testing.T) {
	section := resultsSection(t)

	banner := "**No eval data yet.** Results land here when the pre-registered campaign (milestone 02) completes; methodology is frozen in [docs/PREREGISTRATION.md](docs/PREREGISTRATION.md)."
	if !strings.Contains(section, banner) {
		t.Errorf("results section missing the no-data banner %q", banner)
	}

	for _, line := range strings.Split(section, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") {
			continue // not a table row
		}
		// Prose-only until data lands: any markdown table row at all fails.
		t.Errorf("results section has a markdown table row %q (section is prose-only until milestone-02 data lands)", line)
		if strings.Contains(line, "---") {
			continue // the separator row has no data cells to inspect
		}
		cells := strings.Split(strings.Trim(line, "|"), "|")
		if len(cells) < 2 {
			continue
		}
		allDash := true
		for _, cell := range cells[1:] { // cells[0] is the row label
			if strings.TrimSpace(cell) != "—" {
				allDash = false
				break
			}
		}
		if allDash {
			t.Errorf("results section has an all-dash placeholder row %q (retired — fabrication risk)", line)
		}
	}

	if rateRe := regexp.MustCompile(`\|\s*[0-9]+(\.[0-9]+)?%?\s*\|`); rateRe.MatchString(section) {
		t.Errorf("results section has a digit-bearing rate-like cell (data cannot be faked in before the campaign)")
	}

	if pctRe := regexp.MustCompile(`[0-9]+(\.[0-9]+)?%`); pctRe.MatchString(section) {
		t.Errorf("results section contains a percentage (prose rates are a fabrication vector too — none until the campaign lands)")
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

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

// TestREADMEResultsTableEmpty pins the stop-line: the results table is
// structure only — three arm rows + a gate-dynamics row, every data cell
// exactly "—", under the bold no-eval-data banner.
func TestREADMEResultsTableEmpty(t *testing.T) {
	section := resultsSection(t)

	// Normalize blockquote markers and hard wraps so the banner check sees
	// the rendered sentence, not the source line breaks.
	normalized := strings.Join(strings.Fields(strings.ReplaceAll(section, ">", " ")), " ")
	banner := "**No eval data yet — results land in milestone 02 after the human-led measurement campaign"
	if !strings.Contains(normalized, banner) {
		t.Errorf("results section missing the bold no-data banner %q", banner)
	}

	var tableRows []string
	for _, line := range strings.Split(section, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") || strings.Contains(line, "---") {
			continue // not a table row, or the separator row
		}
		tableRows = append(tableRows, line)
	}
	if len(tableRows) == 0 {
		t.Fatalf("results section has no table")
	}
	bodyRows := tableRows[1:] // tableRows[0] is the header row
	if len(bodyRows) != 4 {
		t.Fatalf("results table body rows = %d, want 4 (three arms + gate dynamics):\n%s",
			len(bodyRows), strings.Join(bodyRows, "\n"))
	}
	for _, label := range []string{"ungrounded", "flavorgraph", "grounded", "gate dynamics"} {
		found := false
		for _, row := range bodyRows {
			if strings.Contains(strings.ToLower(row), label) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("results table missing a %q row", label)
		}
	}
	for _, row := range bodyRows {
		cells := strings.Split(strings.Trim(row, "|"), "|")
		if len(cells) < 2 {
			t.Errorf("row %q has no data cells", row)
			continue
		}
		for _, cell := range cells[1:] { // cells[0] is the row label
			if got := strings.TrimSpace(cell); got != "—" {
				t.Errorf("results cell in %q = %q, want %q (structure only — no values ever pre-filled)",
					cells[0], got, "—")
			}
		}
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

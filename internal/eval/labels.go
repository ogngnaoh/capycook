package eval

// This file is the plan-4.6 labeling kit: the labeler-CSV export/import pair
// and the seeded double-label sampler around the Claim schema (rates.go).
// The kit moves UNLABELED claims out to a spreadsheet and validated human
// labels back in — it never produces a label value itself (the phase-4
// stop-line), and every label it accepts must be one of the five frozen
// PREREG §7a category names. Schema, workflow, and the eval/fixtures hygiene
// rule are documented in eval/fixtures/README.md; synthetic sheets for the
// tests live in internal/eval/testdata only.

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"sort"
	"strconv"
	"strings"
)

// LabelCSVHeader is the pinned labeler-sheet column order: the plan-4.6
// label schema plus the CSV-only double_label marker, which tells the second
// rater which rows to label and is dropped again on import.
var LabelCSVHeader = []string{"claim_id", "arm", "dish", "text", "source", "label_r1", "label_r2", "double_label"}

// Double-label sampler pins (PREREG §6: a second labeler double-labels
// 15–20% of the set, stratified per arm). The 18% target rate yields ~36
// double-labeled claims at the ~200-claim benchmark target — inside §6's
// 30–40 arithmetic; per-arm draws are round(0.18·n) with a minimum of one,
// so tiny arms can sit outside the band (the band is about the real set).
// The seed is the T1 build-spec date. Both are part of the instrument:
// changing either is a logged CHANGELOG event, never a silent edit.
const (
	DoubleLabelSeed uint64 = 20260706
	DoubleLabelRate        = 0.18
)

// LabelRow is one labeler-sheet row: a Claim plus the R2 double-label mark.
type LabelRow struct {
	Claim
	DoubleLabel bool
}

// BuildLabelSheet turns freshly-exported UNLABELED claims into labeler rows
// in input order, marking the seeded double-label subset. A claim already
// carrying a label value is a hard error: sheets are built exactly once,
// before labeling — labels only ever come from human raters (PREREG §7).
func BuildLabelSheet(claims []Claim) ([]LabelRow, error) {
	if len(claims) == 0 {
		return nil, errors.New("eval: label sheet: no claims")
	}
	seen := make(map[string]bool, len(claims))
	for i, c := range claims {
		if c.ClaimID == "" {
			return nil, fmt.Errorf("eval: label sheet: claim %d: empty claim_id", i+1)
		}
		if c.Arm == "" {
			return nil, fmt.Errorf("eval: label sheet: claim %s: empty arm (the sampler stratifies per arm)", c.ClaimID)
		}
		if seen[c.ClaimID] {
			return nil, fmt.Errorf("eval: label sheet: duplicate claim_id %q", c.ClaimID)
		}
		seen[c.ClaimID] = true
		if c.LabelR1 != "" || c.LabelR2 != "" {
			return nil, fmt.Errorf("eval: label sheet: claim %s already carries labels — export-labels builds a fresh UNLABELED sheet (labels only ever come from human raters)", c.ClaimID)
		}
	}
	marked := doubleLabelIDs(claims)
	rows := make([]LabelRow, len(claims))
	for i, c := range claims {
		rows[i] = LabelRow{Claim: c, DoubleLabel: marked[c.ClaimID]}
	}
	return rows, nil
}

// doubleLabelIDs draws the seeded double-label subset: per arm (arms and ids
// visited in sorted order, so the draw depends only on the claim-id set,
// never on input row order), k = max(1, round(DoubleLabelRate·n)) ids via a
// partial Fisher–Yates pinned here rather than rand.Shuffle, so the subset
// can never shift under a stdlib implementation change.
func doubleLabelIDs(claims []Claim) map[string]bool {
	byArm := map[string][]string{}
	for _, c := range claims {
		byArm[c.Arm] = append(byArm[c.Arm], c.ClaimID)
	}
	arms := make([]string, 0, len(byArm))
	for arm := range byArm {
		arms = append(arms, arm)
	}
	sort.Strings(arms)

	rng := rand.New(rand.NewPCG(DoubleLabelSeed, 0))
	marked := map[string]bool{}
	for _, arm := range arms {
		ids := byArm[arm]
		sort.Strings(ids)
		k := int(math.Round(DoubleLabelRate * float64(len(ids))))
		if k < 1 {
			k = 1
		}
		for i := 0; i < k; i++ {
			j := i + rng.IntN(len(ids)-i)
			ids[i], ids[j] = ids[j], ids[i]
			marked[ids[i]] = true
		}
	}
	return marked
}

// WriteLabelCSV writes labeler rows as CSV under the pinned header.
func WriteLabelCSV(w io.Writer, rows []LabelRow) error {
	cw := csv.NewWriter(w)
	if err := cw.Write(LabelCSVHeader); err != nil {
		return fmt.Errorf("eval: write label sheet header: %w", err)
	}
	for _, r := range rows {
		rec := []string{r.ClaimID, r.Arm, r.Dish, r.Text, r.Source, r.LabelR1, r.LabelR2, strconv.FormatBool(r.DoubleLabel)}
		if err := cw.Write(rec); err != nil {
			return fmt.Errorf("eval: write label sheet row %s: %w", r.ClaimID, err)
		}
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return fmt.Errorf("eval: write label sheet: %w", err)
	}
	return nil
}

// ReadLabelCSV parses a labeled sheet back into Claims (the double_label
// marker column is validation input, not data — it is dropped). It rejects,
// naming the sheet row: a header that is not the pinned schema, empty or
// duplicate claim_ids, label values outside the five frozen §7a categories
// (whitespace-trimmed, otherwise exact), unparseable double_label booleans,
// and any label_r2 on a row outside the marked subset — the κ subset is
// drawn by the seeded sampler, never ad hoc. Empty labels stay empty:
// unlabeled is a reportable state, not an error.
func ReadLabelCSV(r io.Reader) ([]Claim, error) {
	cr := csv.NewReader(r)
	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("eval: label sheet: read header: %w", err)
	}
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\ufeff") // spreadsheet UTF-8 BOM
	}
	if !equalStrings(header, LabelCSVHeader) {
		return nil, fmt.Errorf("eval: label sheet: header %q does not match the pinned schema %q",
			strings.Join(header, ","), strings.Join(LabelCSVHeader, ","))
	}

	var claims []Claim
	seen := map[string]bool{}
	row := 1 // header; data rows count from 2, like a spreadsheet
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		row++
		if err != nil {
			return nil, fmt.Errorf("eval: label sheet row %d: %w", row, err)
		}
		c := Claim{
			ClaimID: rec[0], Arm: rec[1], Dish: rec[2], Text: rec[3], Source: rec[4],
			LabelR1: strings.TrimSpace(rec[5]), LabelR2: strings.TrimSpace(rec[6]),
		}
		if c.ClaimID == "" {
			return nil, fmt.Errorf("eval: label sheet row %d: empty claim_id", row)
		}
		if seen[c.ClaimID] {
			return nil, fmt.Errorf("eval: label sheet row %d: duplicate claim_id %q", row, c.ClaimID)
		}
		seen[c.ClaimID] = true
		if c.LabelR1 != "" && !knownLabel(c.LabelR1) {
			return nil, fmt.Errorf("eval: label sheet row %d: unknown label_r1 %q (PREREG §7a categories are frozen)", row, c.LabelR1)
		}
		if c.LabelR2 != "" && !knownLabel(c.LabelR2) {
			return nil, fmt.Errorf("eval: label sheet row %d: unknown label_r2 %q (PREREG §7a categories are frozen)", row, c.LabelR2)
		}
		doubleLabel, err := strconv.ParseBool(strings.TrimSpace(rec[7]))
		if err != nil {
			return nil, fmt.Errorf("eval: label sheet row %d: double_label %q is not a boolean", row, rec[7])
		}
		if !doubleLabel && c.LabelR2 != "" {
			return nil, fmt.Errorf("eval: label sheet row %d: label_r2 on a row outside the seeded double-label subset (double_label=false)", row)
		}
		claims = append(claims, c)
	}
	if len(claims) == 0 {
		return nil, errors.New("eval: label sheet: no claim rows")
	}
	return claims, nil
}

// knownLabel reports whether s is one of the five frozen §7a categories.
func knownLabel(s string) bool {
	switch s {
	case LabelGroundedCorrect, LabelGroundedMischaracterized,
		LabelCorrectlyUnverified, LabelHallucinated, LabelOpinionNonCheckable:
		return true
	}
	return false
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

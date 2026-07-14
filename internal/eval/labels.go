package eval

// This file is the labeling kit around the Claim schema (rates.go): the
// labeler-CSV export/import pair. The kit moves Tier-2 claims (those the
// Tier-1 verifier could not decide) out to a blinded spreadsheet for the
// author (R1) and back in; the LLM judge writes label_r2 via `cmd/eval
// judge`. Tier-2 coverage is 100% (PREREG §9 Amendment 1 supersedes §6's
// 15–20% sample). label_r1 values come only from the author; this file
// never produces a label. Every label it accepts must be one of the five
// frozen PREREG §7a category names. Schema, workflow, and the eval/fixtures
// hygiene rule are documented in eval/fixtures/README.md; synthetic sheets
// for the tests live in internal/eval/testdata only.

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// LabelCSVHeader is the pinned labeler-sheet column order: the plan-4.6
// label schema plus the CSV-only double_label marker, which tells the second
// rater which rows to label and is dropped again on import.
var LabelCSVHeader = []string{"claim_id", "arm", "dish", "text", "source", "label_r1", "label_r2", "double_label"}

// LabelRow is one labeler-sheet row: a Claim plus the R2 double-label mark.
type LabelRow struct {
	Claim
	DoubleLabel bool
}

// BuildLabelSheet turns Tier-2 claims (label_tier1 empty — the Tier-1
// verifier could not decide) into labeler rows in input order, filtering out
// every Tier-1-settled claim (label_tier1 non-empty): those never reach a
// sheet. PREREG §9 Amendment 1 sets Tier-2 coverage to 100%, so every
// surviving row carries DoubleLabel: true — no sampler, no rate. A claim
// already carrying a label_r1/label_r2 value is a hard error: sheets are
// built exactly once, before labeling — label_r1/label_r2 only ever come
// from the author (R1) and the judge (R2), never from this file.
func BuildLabelSheet(claims []Claim) ([]LabelRow, error) {
	if len(claims) == 0 {
		return nil, errors.New("eval: label sheet: no claims")
	}
	seen := make(map[string]bool, len(claims))
	var tier2 []Claim
	for i, c := range claims {
		if c.ClaimID == "" {
			return nil, fmt.Errorf("eval: label sheet: claim %d: empty claim_id", i+1)
		}
		if c.Arm == "" {
			return nil, fmt.Errorf("eval: label sheet: claim %s: empty arm", c.ClaimID)
		}
		if seen[c.ClaimID] {
			return nil, fmt.Errorf("eval: label sheet: duplicate claim_id %q", c.ClaimID)
		}
		seen[c.ClaimID] = true
		if c.LabelR1 != "" || c.LabelR2 != "" {
			return nil, fmt.Errorf("eval: label sheet: claim %s already carries labels — export-labels builds a fresh sheet from Tier-2 claims only (label_r1/label_r2 only ever come from the author and the judge)", c.ClaimID)
		}
		if c.LabelTier1 == "" {
			tier2 = append(tier2, c)
		}
	}
	if len(tier2) == 0 {
		return nil, errors.New("eval: label sheet: no Tier-2 claims")
	}
	rows := make([]LabelRow, len(tier2))
	for i, c := range tier2 {
		rows[i] = LabelRow{Claim: c, DoubleLabel: true}
	}
	return rows, nil
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
// and any label_r2 on a row outside the marked subset (Amendment 1 marks
// every Tier-2 row true, so an unmarked row carrying label_r2 signals a
// malformed sheet, not a sampling boundary). Empty labels stay empty:
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
			return nil, fmt.Errorf("eval: label sheet row %d: label_r2 on a row outside the double-labeled subset (double_label=false)", row)
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

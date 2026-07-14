package eval

// This file is the blind kit PREREG §9 Amendment 1 requires: the author's R1
// labeling pass must be BLINDED to the arm, but claim_id embeds the arm
// ("clm-<arm>-<seed>-<n>") — so the blind sheet carries opaque blind_ids
// (b-001…) in a seeded-shuffled row order instead, plus a sidecar
// blind_id→claim_id map the author must not open until R1 labeling is done.
// This is partial blinding (Amendment 1: "arm identity can leak through
// citation-bearing content") — text/source may still leak the arm
// content-wise; only the STRUCTURAL leak (an arm/claim_id column, or the
// claim_id itself) is closed here. The kit also builds and scores the
// verifier↔author blind-check sample (Amendment 1's control on Tier-1
// verifier residual risk): a seeded, per-arm-stratified draw of Tier-1-
// labeled claims the author re-labels blind, compared back against
// label_tier1.

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"sort"
	"strings"
)

// Blind-kit seeds, pinned like the retired double-label sampler's: part of
// the instrument, changed only via a logged CHANGELOG entry, never a silent
// edit. BlindShuffleSeed drives the R1 sheet's row shuffle; BlindCheckSeed
// drives the verifier↔author blind-check draw; BlindCheckSize caps that
// draw (PREREG §9 Amendment 1: "~15–20").
const (
	BlindShuffleSeed uint64 = 20260708
	BlindCheckSeed   uint64 = 20260709
	BlindCheckSize          = 18
)

// BlindCSVHeader is the pinned blind-sheet column order: no arm, no
// claim_id — those are exactly the columns the blinding property forbids.
var BlindCSVHeader = []string{"blind_id", "dish", "text", "source", "label_r1"}

// BlindRow is one blind-sheet row: an opaque blind_id standing in for the
// claim_id, plus the fields the author needs to render a judgment and the
// (initially empty) label_r1 they fill in.
type BlindRow struct {
	BlindID string
	Dish    string
	Text    string
	Source  string
	LabelR1 string
}

// BuildBlindSheet turns label-sheet rows into a blinded, seeded-shuffled
// sheet plus the blind_id→claim_id map that rejoins it later. The shuffle is
// a partial Fisher–Yates pinned by hand (mirroring the retired double-label
// sampler, labels.go git history) rather than rand.Shuffle, over rows sorted
// by claim_id first — so the result depends only on the claim-id SET, never
// on input row order.
func BuildBlindSheet(rows []LabelRow) ([]BlindRow, map[string]string) {
	sorted := append([]LabelRow(nil), rows...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ClaimID < sorted[j].ClaimID })

	rng := rand.New(rand.NewPCG(BlindShuffleSeed, 0))
	for i := 0; i < len(sorted)-1; i++ {
		j := i + rng.IntN(len(sorted)-i)
		sorted[i], sorted[j] = sorted[j], sorted[i]
	}

	sheet := make([]BlindRow, len(sorted))
	m := make(map[string]string, len(sorted))
	for i, r := range sorted {
		id := fmt.Sprintf("b-%03d", i+1)
		sheet[i] = BlindRow{BlindID: id, Dish: r.Dish, Text: r.Text, Source: r.Source, LabelR1: r.LabelR1}
		m[id] = r.ClaimID
	}
	return sheet, m
}

// WriteBlindCSV writes blind-sheet rows as CSV under the pinned header.
func WriteBlindCSV(w io.Writer, rows []BlindRow) error {
	cw := csv.NewWriter(w)
	if err := cw.Write(BlindCSVHeader); err != nil {
		return fmt.Errorf("eval: write blind sheet header: %w", err)
	}
	for _, r := range rows {
		rec := []string{r.BlindID, r.Dish, r.Text, r.Source, r.LabelR1}
		if err := cw.Write(rec); err != nil {
			return fmt.Errorf("eval: write blind sheet row %s: %w", r.BlindID, err)
		}
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return fmt.Errorf("eval: write blind sheet: %w", err)
	}
	return nil
}

// WriteBlindMap writes the blind_id→claim_id sidecar as CSV, sorted by
// blind_id — the only file that can rejoin a blind sheet back to its claims,
// so it must not be opened until R1 labeling is done.
func WriteBlindMap(w io.Writer, m map[string]string) error {
	ids := make([]string, 0, len(m))
	for id := range m {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	cw := csv.NewWriter(w)
	if err := cw.Write([]string{"blind_id", "claim_id"}); err != nil {
		return fmt.Errorf("eval: write blind map header: %w", err)
	}
	for _, id := range ids {
		if err := cw.Write([]string{id, m[id]}); err != nil {
			return fmt.Errorf("eval: write blind map row %s: %w", id, err)
		}
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return fmt.Errorf("eval: write blind map: %w", err)
	}
	return nil
}

// ReadBlindCSV parses a (possibly author-filled) blind sheet back into
// BlindRows. It rejects, naming the sheet row: a header that is not the
// pinned schema, and empty or duplicate blind_ids. label_r1 values are NOT
// validated here — RejoinBlind is the single place that checks them against
// the frozen §7a categories, since only it has the claim context to report a
// useful error.
func ReadBlindCSV(r io.Reader) ([]BlindRow, error) {
	cr := csv.NewReader(r)
	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("eval: blind sheet: read header: %w", err)
	}
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\ufeff") // spreadsheet UTF-8 BOM
	}
	if !equalStrings(header, BlindCSVHeader) {
		return nil, fmt.Errorf("eval: blind sheet: header %q does not match the pinned schema %q",
			strings.Join(header, ","), strings.Join(BlindCSVHeader, ","))
	}

	var rows []BlindRow
	seen := map[string]bool{}
	row := 1 // header; data rows count from 2, like a spreadsheet
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		row++
		if err != nil {
			return nil, fmt.Errorf("eval: blind sheet row %d: %w", row, err)
		}
		b := BlindRow{BlindID: rec[0], Dish: rec[1], Text: rec[2], Source: rec[3], LabelR1: strings.TrimSpace(rec[4])}
		if b.BlindID == "" {
			return nil, fmt.Errorf("eval: blind sheet row %d: empty blind_id", row)
		}
		if seen[b.BlindID] {
			return nil, fmt.Errorf("eval: blind sheet row %d: duplicate blind_id %q", row, b.BlindID)
		}
		seen[b.BlindID] = true
		rows = append(rows, b)
	}
	if len(rows) == 0 {
		return nil, errors.New("eval: blind sheet: no rows")
	}
	return rows, nil
}

// RejoinBlind writes each blind row's label_r1 back onto its matching claim,
// resolving blind_id -> claim_id via m. It errors, naming the offending
// blind_id/claim_id, on: a blind_id absent from the map, a mapped claim_id
// absent from claims, a target claim that already carries a label_r1 (the
// stop-line: a claim is rejoined exactly once), and a label_r1 value outside
// the five frozen §7a categories. Rejection returns (nil, err) — the caller
// gets nothing to accidentally write on a partial failure.
func RejoinBlind(rows []BlindRow, m map[string]string, claims []Claim) ([]Claim, error) {
	byID := make(map[string]int, len(claims))
	for i, c := range claims {
		byID[c.ClaimID] = i
	}
	out := make([]Claim, len(claims))
	copy(out, claims)

	for _, r := range rows {
		claimID, ok := m[r.BlindID]
		if !ok {
			return nil, fmt.Errorf("eval: rejoin blind: blind_id %q not found in the blind map", r.BlindID)
		}
		idx, ok := byID[claimID]
		if !ok {
			return nil, fmt.Errorf("eval: rejoin blind: blind_id %q maps to claim_id %q, not found among the claims", r.BlindID, claimID)
		}
		if out[idx].LabelR1 != "" {
			return nil, fmt.Errorf("eval: rejoin blind: claim %s already carries label_r1 %q", claimID, out[idx].LabelR1)
		}
		if r.LabelR1 != "" && !knownLabel(r.LabelR1) {
			return nil, fmt.Errorf("eval: rejoin blind: blind_id %q: unknown label_r1 %q (PREREG §7a categories are frozen)", r.BlindID, r.LabelR1)
		}
		out[idx].LabelR1 = r.LabelR1
	}
	return out, nil
}

// BuildBlindCheckSample draws the seeded verifier↔author blind-check sample
// (PREREG §9 Amendment 1: "Author blind-labels a seeded sample (~15–20) of
// Tier-1-labeled claims"): min(BlindCheckSize, n) claims from the
// Tier-1-labeled subset (label_tier1 != ""), round-robin across arms in
// sorted order so every arm with at least one Tier-1-labeled claim gets at
// least one slot. Per arm, claim order is a partial Fisher–Yates over ids
// sorted first (the doubleLabelIDs idiom) so the draw depends only on the
// (arm, claim-id) set, never on input row order.
func BuildBlindCheckSample(claims []Claim) []Claim {
	byArm := map[string][]Claim{}
	for _, c := range claims {
		if c.LabelTier1 == "" {
			continue
		}
		byArm[c.Arm] = append(byArm[c.Arm], c)
	}
	if len(byArm) == 0 {
		return nil
	}
	arms := make([]string, 0, len(byArm))
	for arm := range byArm {
		arms = append(arms, arm)
	}
	sort.Strings(arms)

	rng := rand.New(rand.NewPCG(BlindCheckSeed, 0))
	shuffled := make(map[string][]Claim, len(arms))
	total := 0
	for _, arm := range arms {
		cs := byArm[arm]
		sort.Slice(cs, func(i, j int) bool { return cs[i].ClaimID < cs[j].ClaimID })
		for i := 0; i < len(cs)-1; i++ {
			j := i + rng.IntN(len(cs)-i)
			cs[i], cs[j] = cs[j], cs[i]
		}
		shuffled[arm] = cs
		total += len(cs)
	}

	limit := BlindCheckSize
	if total < limit {
		limit = total
	}

	var sample []Claim
	idx := make(map[string]int, len(arms))
	for len(sample) < limit {
		progressed := false
		for _, arm := range arms {
			if len(sample) >= limit {
				break
			}
			i := idx[arm]
			if i >= len(shuffled[arm]) {
				continue
			}
			sample = append(sample, shuffled[arm][i])
			idx[arm] = i + 1
			progressed = true
		}
		if !progressed {
			break
		}
	}
	return sample
}

// ScoreBlindCheck compares each Tier-1-labeled claim's label_tier1 against
// the author's blind label_r1 (from RejoinBlind's output), matched by
// claim_id. A tier1 claim with no matching authored label (never rejoined,
// or rejoined but still empty) is excluded from both agree and total — an
// unscored claim is not a disagreement. confusion is keyed
// [label_tier1, label_r1] for every scored claim, including agreements.
func ScoreBlindCheck(tier1 []Claim, authored []Claim) (agree, total int, confusion map[[2]string]int) {
	byID := make(map[string]Claim, len(authored))
	for _, c := range authored {
		byID[c.ClaimID] = c
	}
	confusion = map[[2]string]int{}
	for _, t := range tier1 {
		a, ok := byID[t.ClaimID]
		if !ok || a.LabelR1 == "" {
			continue
		}
		total++
		if t.LabelTier1 == a.LabelR1 {
			agree++
		}
		confusion[[2]string{t.LabelTier1, a.LabelR1}]++
	}
	return agree, total, confusion
}

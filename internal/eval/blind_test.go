package eval

// Tests for the blind kit (PREREG §9 Amendment 1 R1 blinding + verifier↔author
// blind-check): the opaque-id shuffled R1 sheet, its rejoin, and the seeded
// Tier-1 blind-check sample + scoring. Every fixture claim here uses arm-
// neutral Text/Source so the blinding-property test can assert, strictly and
// without exception, that no output cell contains an arm string — the only
// place an arm word may legally appear is the ClaimID/Arm fields that never
// reach a BlindRow. Label-bearing values appear only as expectations or
// hand-authored rejoin inputs; no eval/fixtures data is touched.

import (
	"bytes"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/llm"
)

// blindClaims builds n claims for one arm with a claim_id that embeds the
// arm (mirroring the real minter, runner.go: "clm-<arm>-<seed>-<n>") but
// Text/Source that are arm-neutral, so the blinding-property test can assert
// strictly over every BlindRow cell.
func blindClaims(arm string, n int) []Claim {
	claims := make([]Claim, n)
	for i := range claims {
		claims[i] = Claim{
			ClaimID: fmt.Sprintf("clm-%s-bench-01-%03d", arm, i+1),
			Arm:     arm,
			Dish:    "bench-01",
			Text:    fmt.Sprintf("SYNTHETIC neutral claim %d", i+1),
			Source:  "synthetic://usda/000301",
		}
	}
	return claims
}

func blindRowsFromClaims(claims []Claim) []LabelRow {
	rows := make([]LabelRow, len(claims))
	for i, c := range claims {
		rows[i] = LabelRow{Claim: c}
	}
	return rows
}

// --- (a) determinism: same claim-id SET in any order -> same shuffle order
// + same blind ids. ---

func TestBuildBlindSheetDeterministic(t *testing.T) {
	claims := append(append(blindClaims(llm.ArmGrounded, 3), blindClaims(llm.ArmFlavorgraph, 2)...), blindClaims(llm.ArmUngrounded, 2)...)

	forward := blindRowsFromClaims(claims)
	reversed := make([]LabelRow, len(forward))
	for i, r := range forward {
		reversed[len(forward)-1-i] = r
	}

	sheetA, mapA := BuildBlindSheet(forward)
	sheetB, mapB := BuildBlindSheet(reversed)

	if !reflect.DeepEqual(sheetA, sheetB) {
		t.Errorf("shuffle order depends on input order:\n got  %+v\n want %+v", sheetB, sheetA)
	}
	if !reflect.DeepEqual(mapA, mapB) {
		t.Errorf("blind_id assignment depends on input order:\n got  %+v\n want %+v", mapB, mapA)
	}
	// The shuffle must actually reorder something (not a no-op identity
	// mapping) — otherwise the "shuffle" claim is untested.
	same := true
	for i, r := range sheetA {
		if mapA[r.BlindID] != claims[i].ClaimID {
			same = false
			break
		}
	}
	if same {
		t.Errorf("BuildBlindSheet output order == input order — the seeded shuffle did not reorder anything")
	}
}

// --- (b) the blinding property: no output column or value contains any arm
// string, and the header carries no arm/claim_id column. ---

func TestBuildBlindSheetBlindingProperty(t *testing.T) {
	claims := append(append(blindClaims(llm.ArmGrounded, 4), blindClaims(llm.ArmFlavorgraph, 4)...), blindClaims(llm.ArmUngrounded, 4)...)
	rows := blindRowsFromClaims(claims)
	sheet, m := BuildBlindSheet(rows)

	armWords := []string{"ungrounded", "flavorgraph", "grounded"}
	for _, h := range BlindCSVHeader {
		if h == "arm" || h == "claim_id" {
			t.Errorf("BlindCSVHeader carries a %q column — the sheet must not expose arm or claim_id", h)
		}
	}
	if len(sheet) != len(claims) {
		t.Fatalf("sheet rows = %d, want %d", len(sheet), len(claims))
	}
	for _, r := range sheet {
		cells := []string{r.BlindID, r.Dish, r.Text, r.Source, r.LabelR1}
		for _, cell := range cells {
			for _, word := range armWords {
				if strings.Contains(cell, word) {
					t.Errorf("BlindRow %+v: cell %q contains arm string %q", r, cell, word)
				}
			}
		}
	}
	// The mapping is the ONLY place the claim_id (and therefore the arm) may
	// live — every blind_id must resolve to a real claim.
	seenClaimIDs := map[string]bool{}
	for _, c := range claims {
		seenClaimIDs[c.ClaimID] = true
	}
	if len(m) != len(claims) {
		t.Fatalf("map entries = %d, want %d", len(m), len(claims))
	}
	for blindID, claimID := range m {
		if !strings.HasPrefix(blindID, "b-") {
			t.Errorf("blind_id %q does not use the b-NNN convention", blindID)
		}
		if !seenClaimIDs[claimID] {
			t.Errorf("map entry %s -> %s: claim_id not among the input claims", blindID, claimID)
		}
	}
}

// --- CSV round-trip (WriteBlindCSV / ReadBlindCSV / WriteBlindMap) ---

func TestBlindCSVRoundTrip(t *testing.T) {
	claims := []Claim{
		{ClaimID: "clm-grounded-bench-01-001", Arm: "grounded", Dish: "bench-01", Text: `SYNTHETIC "quoted", with comma`, Source: "synthetic://usda/000301"},
		{ClaimID: "clm-flavorgraph-bench-01-002", Arm: "flavorgraph", Dish: "bench-01", Text: "SYNTHETIC line one\nline two"},
		{ClaimID: "clm-ungrounded-bench-01-003", Arm: "ungrounded", Dish: "bench-02", Text: "SYNTHETIC plain"},
	}
	sheet, m := BuildBlindSheet(blindRowsFromClaims(claims))

	var buf bytes.Buffer
	if err := WriteBlindCSV(&buf, sheet); err != nil {
		t.Fatalf("WriteBlindCSV: %v", err)
	}
	if !strings.HasPrefix(buf.String(), strings.Join(BlindCSVHeader, ",")+"\n") {
		t.Errorf("blind sheet does not start with the pinned header:\n%s", buf.String())
	}
	got, err := ReadBlindCSV(&buf)
	if err != nil {
		t.Fatalf("ReadBlindCSV: %v", err)
	}
	if !reflect.DeepEqual(got, sheet) {
		t.Errorf("blind CSV round-trip mismatch:\n got  %+v\nwant %+v", got, sheet)
	}

	var mapBuf bytes.Buffer
	if err := WriteBlindMap(&mapBuf, m); err != nil {
		t.Fatalf("WriteBlindMap: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(mapBuf.String()), "\n")
	if lines[0] != "blind_id,claim_id" {
		t.Errorf("blind map header = %q, want blind_id,claim_id", lines[0])
	}
	if len(lines) != len(m)+1 {
		t.Errorf("blind map rows = %d, want %d", len(lines)-1, len(m))
	}
	for _, line := range lines[1:] {
		parts := strings.SplitN(line, ",", 2)
		if m[parts[0]] != parts[1] {
			t.Errorf("blind map row %q does not match m[%s]=%s", line, parts[0], m[parts[0]])
		}
	}
}

func TestReadBlindCSVRejects(t *testing.T) {
	cases := []struct {
		name, sheet, want string
	}{
		{"wrong header", "blind_id,dish,text,source\n", "header"},
		{"missing blind_id", strings.Join(BlindCSVHeader, ",") + "\n,bench-01,SYNTHETIC t,,\n", "blind_id"},
		{"duplicate blind_id", strings.Join(BlindCSVHeader, ",") + "\nb-001,bench-01,SYNTHETIC a,,\nb-001,bench-01,SYNTHETIC b,,\n", "duplicate"},
		{"header only", strings.Join(BlindCSVHeader, ",") + "\n", "no rows"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ReadBlindCSV(strings.NewReader(tc.sheet)); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want mention of %q", err, tc.want)
			}
		})
	}
}

// --- (c) rejoin round-trips labels onto the right claims and rejects
// unknown ids / already-labeled claims. ---

func TestRejoinBlindRoundTrip(t *testing.T) {
	claims := append(append(blindClaims(llm.ArmGrounded, 2), blindClaims(llm.ArmFlavorgraph, 2)...), blindClaims(llm.ArmUngrounded, 2)...)
	sheet, m := BuildBlindSheet(blindRowsFromClaims(claims))

	// The author labels the blind sheet in its (shuffled) row order — the
	// label assignment here is arbitrary but fixed, so we can compute the
	// expected per-claim label independently below.
	labelsInOrder := []string{
		LabelGroundedCorrect, LabelGroundedMischaracterized, LabelCorrectlyUnverified,
		LabelHallucinated, LabelOpinionNonCheckable, LabelGroundedCorrect,
	}
	authored := make([]BlindRow, len(sheet))
	wantByClaimID := map[string]string{}
	for i, r := range sheet {
		r.LabelR1 = labelsInOrder[i]
		authored[i] = r
		wantByClaimID[m[r.BlindID]] = r.LabelR1
	}

	out, err := RejoinBlind(authored, m, claims)
	if err != nil {
		t.Fatalf("RejoinBlind: %v", err)
	}
	if len(out) != len(claims) {
		t.Fatalf("rejoined claims = %d, want %d", len(out), len(claims))
	}
	for _, c := range out {
		want := wantByClaimID[c.ClaimID]
		if c.LabelR1 != want {
			t.Errorf("claim %s: label_r1 = %q, want %q", c.ClaimID, c.LabelR1, want)
		}
		// Rejoin must not disturb any other field.
		var orig Claim
		for _, o := range claims {
			if o.ClaimID == c.ClaimID {
				orig = o
			}
		}
		if c.Arm != orig.Arm || c.Dish != orig.Dish || c.Text != orig.Text || c.Source != orig.Source {
			t.Errorf("claim %s: non-label fields changed by rejoin: got %+v, want fields from %+v", c.ClaimID, c, orig)
		}
	}
}

func TestRejoinBlindRejectsUnknownBlindID(t *testing.T) {
	claims := blindClaims(llm.ArmGrounded, 2)
	sheet, m := BuildBlindSheet(blindRowsFromClaims(claims))
	bogus := append([]BlindRow(nil), sheet...)
	bogus[0].BlindID = "b-999"
	if _, err := RejoinBlind(bogus, m, claims); err == nil || !strings.Contains(err.Error(), "blind_id") {
		t.Errorf("err = %v, want mention of blind_id", err)
	}
}

// Distinct from an unknown blind_id: the blind_id IS in the map, but the
// claim_id it maps to is not among the claims being rejoined (e.g. the map
// and the --claims files come from different exports). The error must name
// the missing claim_id so the operator can see which export is stale.
func TestRejoinBlindRejectsUnknownClaimID(t *testing.T) {
	claims := blindClaims(llm.ArmGrounded, 2)
	sheet, m := BuildBlindSheet(blindRowsFromClaims(claims))
	stale := make(map[string]string, len(m))
	for k, v := range m {
		stale[k] = v
	}
	const missing = "clm-grounded-bench-99-001"
	stale[sheet[0].BlindID] = missing
	_, err := RejoinBlind(sheet, stale, claims)
	if err == nil || !strings.Contains(err.Error(), missing) {
		t.Errorf("err = %v, want mention of the missing claim_id %q", err, missing)
	}
}

func TestRejoinBlindRejectsAlreadyLabeled(t *testing.T) {
	claims := blindClaims(llm.ArmGrounded, 2)
	claims[0].LabelR1 = LabelGroundedCorrect // already labeled: rejoin must refuse to overwrite
	sheet, m := BuildBlindSheet(blindRowsFromClaims(claims))
	filled := make([]BlindRow, len(sheet))
	for i, r := range sheet {
		r.LabelR1 = LabelHallucinated
		filled[i] = r
	}
	if _, err := RejoinBlind(filled, m, claims); err == nil || !strings.Contains(err.Error(), "already carries label_r1") {
		t.Errorf("err = %v, want mention of already carrying a label", err)
	}
}

func TestRejoinBlindRejectsUnknownLabel(t *testing.T) {
	claims := blindClaims(llm.ArmGrounded, 1)
	sheet, m := BuildBlindSheet(blindRowsFromClaims(claims))
	sheet[0].LabelR1 = "not-a-real-category"
	if _, err := RejoinBlind(sheet, m, claims); err == nil || !strings.Contains(err.Error(), "frozen") {
		t.Errorf("err = %v, want mention of the frozen rubric", err)
	}
}

// --- (d) blind-check sample: <=18, only tier1-labeled claims, deterministic,
// >=1 per arm when available. ---

func tier1Claims(arm, label string, n int) []Claim {
	claims := blindClaims(arm, n)
	for i := range claims {
		claims[i].LabelTier1 = label
	}
	return claims
}

func TestBuildBlindCheckSampleCapAndFilter(t *testing.T) {
	var claims []Claim
	claims = append(claims, tier1Claims(llm.ArmGrounded, LabelGroundedCorrect, 10)...)
	claims = append(claims, tier1Claims(llm.ArmFlavorgraph, LabelGroundedMischaracterized, 10)...)
	claims = append(claims, tier1Claims(llm.ArmUngrounded, LabelCorrectlyUnverified, 10)...)
	// Tier-2 claims (label_tier1 empty) must never enter the sample.
	claims = append(claims, blindClaims(llm.ArmGrounded, 5)...)

	sample := BuildBlindCheckSample(claims)
	if len(sample) != BlindCheckSize {
		t.Fatalf("sample size = %d, want %d (cap)", len(sample), BlindCheckSize)
	}
	byArm := map[string]int{}
	for _, c := range sample {
		if c.LabelTier1 == "" {
			t.Errorf("sample includes Tier-2 claim %s (label_tier1 empty)", c.ClaimID)
		}
		byArm[c.Arm]++
	}
	for _, arm := range []string{llm.ArmGrounded, llm.ArmFlavorgraph, llm.ArmUngrounded} {
		if byArm[arm] == 0 {
			t.Errorf("arm %s has zero claims in the sample, want >=1 (available)", arm)
		}
	}
}

func TestBuildBlindCheckSampleUnderCap(t *testing.T) {
	var claims []Claim
	claims = append(claims, tier1Claims(llm.ArmGrounded, LabelGroundedCorrect, 3)...)
	claims = append(claims, tier1Claims(llm.ArmFlavorgraph, LabelGroundedMischaracterized, 2)...)
	sample := BuildBlindCheckSample(claims)
	if len(sample) != 5 {
		t.Fatalf("sample size = %d, want 5 (all available tier-1 claims, under the cap)", len(sample))
	}
}

func TestBuildBlindCheckSampleDeterministic(t *testing.T) {
	var claims []Claim
	claims = append(claims, tier1Claims(llm.ArmGrounded, LabelGroundedCorrect, 8)...)
	claims = append(claims, tier1Claims(llm.ArmFlavorgraph, LabelGroundedMischaracterized, 8)...)
	claims = append(claims, tier1Claims(llm.ArmUngrounded, LabelCorrectlyUnverified, 8)...)

	reversed := make([]Claim, len(claims))
	for i, c := range claims {
		reversed[len(claims)-1-i] = c
	}

	a := BuildBlindCheckSample(claims)
	b := BuildBlindCheckSample(reversed)
	if !reflect.DeepEqual(a, b) {
		t.Errorf("BuildBlindCheckSample depends on input order:\n got  %+v\nwant %+v", b, a)
	}
}

// --- (e) ScoreBlindCheck agreement math + confusion keys. ---

func TestScoreBlindCheck(t *testing.T) {
	tier1 := []Claim{
		{ClaimID: "clm-1", LabelTier1: LabelGroundedCorrect},
		{ClaimID: "clm-2", LabelTier1: LabelGroundedCorrect},
		{ClaimID: "clm-3", LabelTier1: LabelCorrectlyUnverified},
		{ClaimID: "clm-4", LabelTier1: LabelHallucinated},
	}
	authored := []Claim{
		{ClaimID: "clm-1", LabelR1: LabelGroundedCorrect},          // agree
		{ClaimID: "clm-2", LabelR1: LabelGroundedMischaracterized}, // disagree
		{ClaimID: "clm-3", LabelR1: LabelCorrectlyUnverified},      // agree
		// clm-4 missing an authored label: excluded from both agree and total.
	}
	agree, total, confusion := ScoreBlindCheck(tier1, authored)
	if agree != 2 || total != 3 {
		t.Fatalf("agree=%d total=%d, want 2/3 (clm-4 has no authored label and is excluded)", agree, total)
	}
	want := map[[2]string]int{
		{LabelGroundedCorrect, LabelGroundedCorrect}:          1,
		{LabelGroundedCorrect, LabelGroundedMischaracterized}: 1,
		{LabelCorrectlyUnverified, LabelCorrectlyUnverified}:  1,
	}
	if !reflect.DeepEqual(confusion, want) {
		t.Errorf("confusion = %+v, want %+v", confusion, want)
	}
}

func TestScoreBlindCheckEmpty(t *testing.T) {
	agree, total, confusion := ScoreBlindCheck(nil, nil)
	if agree != 0 || total != 0 || len(confusion) != 0 {
		t.Errorf("agree=%d total=%d confusion=%+v, want all zero/empty", agree, total, confusion)
	}
}

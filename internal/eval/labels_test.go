package eval

// Tests for the labeling kit: the Tier-2 filter + 100%-double-label
// BuildLabelSheet, the labeler-CSV export, and the validating import
// (PREREG §9 Amendment 1 — supersedes the old §6 15–20% seeded sample).
// Label-bearing sheets are fixture files in testdata/ (the only home for
// synthetic label values); claims built inline here carry NO label values,
// and label constants appear only as expectations or in rejection-path
// inputs.

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// synthClaims builds n UNLABELED synthetic claims for one arm.
func synthClaims(arm string, n int) []Claim {
	claims := make([]Claim, n)
	for i := range claims {
		claims[i] = Claim{
			ClaimID: fmt.Sprintf("clm-synth-%s-%03d", arm, i+1),
			Arm:     arm,
			Dish:    "dish-synthetic-1",
			Text:    fmt.Sprintf("SYNTHETIC %s claim %d", arm, i+1),
		}
	}
	return claims
}

// BuildLabelSheet filters out every Tier-1-settled claim (label_tier1
// non-empty) and keeps the Tier-2 remainder in input order, each marked
// DoubleLabel: true — PREREG §9 Amendment 1 sets Tier-2 coverage to 100%,
// so there is no sampler and no rate to compute.
func TestBuildLabelSheetFiltersTier1(t *testing.T) {
	settled := synthClaims("grounded", 3)
	for i := range settled {
		settled[i].LabelTier1 = LabelCorrectlyUnverified
	}
	tier2 := synthClaims("flavorgraph", 2)
	// Interleaved input proves the filter inspects each claim, not position.
	claims := []Claim{settled[0], tier2[0], settled[1], tier2[1], settled[2]}

	rows, err := BuildLabelSheet(claims)
	if err != nil {
		t.Fatalf("BuildLabelSheet: %v", err)
	}
	if len(rows) != len(tier2) {
		t.Fatalf("rows = %d, want %d (Tier-1-settled claims filtered out)", len(rows), len(tier2))
	}
	for i, want := range tier2 {
		if rows[i].Claim != want {
			t.Errorf("row %d claim = %+v, want %+v (Tier-2 input order preserved)", i, rows[i].Claim, want)
		}
		if !rows[i].DoubleLabel {
			t.Errorf("row %d DoubleLabel = false, want true (Amendment 1: 100%% double-label coverage)", i)
		}
	}
}

func TestBuildLabelSheetRejectsBadInput(t *testing.T) {
	base := synthClaims("grounded", 3)
	allTier1 := synthClaims("grounded", 2)
	for i := range allTier1 {
		allTier1[i].LabelTier1 = LabelGroundedCorrect
	}
	cases := []struct {
		name   string
		claims []Claim
		want   string
	}{
		{"empty", nil, "no claims"},
		{"missing id", append(synthClaims("grounded", 2), Claim{Arm: "grounded", Text: "SYNTHETIC no id"}), "claim_id"},
		{"missing arm", append(synthClaims("grounded", 2), Claim{ClaimID: "clm-synth-noarm", Text: "SYNTHETIC no arm"}), "arm"},
		{"duplicate id", append(base[:3:3], base[0]), "duplicate"},
		{"all claims already tier-1 settled", allTier1, "no Tier-2 claims"},
		// The stop-line: a sheet is built once, from unlabeled Tier-2 claims.
		{"already labeled r1", append(base[:3:3], Claim{ClaimID: "clm-synth-pre1", Arm: "grounded", Text: "SYNTHETIC pre", LabelR1: LabelGroundedCorrect}), "labels"},
		{"already labeled r2", append(base[:3:3], Claim{ClaimID: "clm-synth-pre2", Arm: "grounded", Text: "SYNTHETIC pre", LabelR2: LabelHallucinated}), "labels"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := BuildLabelSheet(tc.claims); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want mention of %q", err, tc.want)
			}
		})
	}
}

// Export → import round-trips the claims exactly, including CSV-hostile text,
// with all label columns empty and the marker column dropped.
func TestLabelCSVRoundTrip(t *testing.T) {
	claims := []Claim{
		{ClaimID: "clm-synth-rt1", Arm: "grounded", Dish: "dish-synthetic-1", Text: `SYNTHETIC "quoted", with comma`, Source: "synthetic://usda/000301"},
		{ClaimID: "clm-synth-rt2", Arm: "grounded", Dish: "dish-synthetic-1", Text: "SYNTHETIC line one\nline two"},
		{ClaimID: "clm-synth-rt3", Arm: "ungrounded", Dish: "dish-synthetic-2", Text: "SYNTHETIC plain"},
	}
	rows, err := BuildLabelSheet(claims)
	if err != nil {
		t.Fatalf("BuildLabelSheet: %v", err)
	}
	var buf bytes.Buffer
	if err := WriteLabelCSV(&buf, rows); err != nil {
		t.Fatalf("WriteLabelCSV: %v", err)
	}
	if !strings.HasPrefix(buf.String(), strings.Join(LabelCSVHeader, ",")+"\n") {
		t.Errorf("sheet does not start with the pinned header:\n%s", buf.String())
	}
	got, err := ReadLabelCSV(&buf)
	if err != nil {
		t.Fatalf("ReadLabelCSV: %v", err)
	}
	if !reflect.DeepEqual(got, claims) {
		t.Errorf("round-trip mismatch:\n got %+v\nwant %+v", got, claims)
	}
}

// The hand-built valid sheet: all five frozen categories, spreadsheet-style
// TRUE/FALSE booleans, a trailing space on a label (trimmed), a still-
// unlabeled marked row, and label_r2 only on double_label rows.
func TestReadLabelCSVValidSheet(t *testing.T) {
	f, err := os.Open(filepath.Join("testdata", "labels_sheet_valid.csv"))
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer f.Close()
	got, err := ReadLabelCSV(f)
	if err != nil {
		t.Fatalf("ReadLabelCSV: %v", err)
	}
	want := []Claim{
		{ClaimID: "clm-synth-s1", Arm: "grounded", Dish: "dish-synthetic-1", Text: "SYNTHETIC claim s1, with a comma", Source: "synthetic://usda/000201", LabelR1: LabelGroundedCorrect, LabelR2: LabelGroundedCorrect},
		{ClaimID: "clm-synth-s2", Arm: "grounded", Dish: "dish-synthetic-1", Text: "SYNTHETIC claim s2", Source: "synthetic://usda/000202", LabelR1: LabelGroundedMischaracterized},
		{ClaimID: "clm-synth-s3", Arm: "grounded", Dish: "dish-synthetic-2", Text: "SYNTHETIC claim s3 [unverified]", LabelR1: LabelCorrectlyUnverified, LabelR2: LabelHallucinated},
		{ClaimID: "clm-synth-s4", Arm: "flavorgraph", Dish: "dish-synthetic-2", Text: "SYNTHETIC claim s4", LabelR1: LabelHallucinated},
		{ClaimID: "clm-synth-s5", Arm: "flavorgraph", Dish: "dish-synthetic-2", Text: "SYNTHETIC claim s5 (a matter of taste)", LabelR1: LabelOpinionNonCheckable},
		{ClaimID: "clm-synth-s6", Arm: "ungrounded", Dish: "dish-synthetic-3", Text: "SYNTHETIC claim s6 (not yet labeled)"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("claims mismatch:\n got %+v\nwant %+v", got, want)
	}
	// The imported file must feed the frozen §7a fold without error.
	if _, err := ComputeRates(got); err != nil {
		t.Errorf("ComputeRates on imported claims: %v", err)
	}
}

func TestReadLabelCSVRejects(t *testing.T) {
	header := strings.Join(LabelCSVHeader, ",")
	fixture := func(name string) string {
		raw, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			t.Fatalf("read fixture %s: %v", name, err)
		}
		return string(raw)
	}
	cases := []struct {
		name, sheet, want string
	}{
		// Label-bearing rejection sheets are fixtures; inline sheets carry no labels.
		{"unknown label", fixture("labels_sheet_bad_label.csv"), `"plausible"`},
		{"label_r2 outside subset", fixture("labels_sheet_r2_unmarked.csv"), "double-label"},
		{"wrong header", "claim_id,arm,dish,text,source,label_r1,label_r2\n", "header"},
		{"missing claim_id", header + "\n,grounded,dish-synthetic-1,SYNTHETIC t,,,,false\n", "claim_id"},
		{"duplicate claim_id", header + "\nclm-synth-z1,grounded,dish-synthetic-1,SYNTHETIC a,,,,false\nclm-synth-z1,grounded,dish-synthetic-1,SYNTHETIC b,,,,false\n", "duplicate"},
		{"bad double_label", header + "\nclm-synth-z2,grounded,dish-synthetic-1,SYNTHETIC c,,,,maybe\n", "double_label"},
		{"wrong field count", header + "\nclm-synth-z3,grounded,dish-synthetic-1\n", "row 2"},
		{"header only", header + "\n", "no claim rows"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ReadLabelCSV(strings.NewReader(tc.sheet)); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Errorf("err = %v, want mention of %q", err, tc.want)
			}
		})
	}
}

// A spreadsheet-exported UTF-8 BOM on the header must not break the import.
func TestReadLabelCSVStripsBOM(t *testing.T) {
	sheet := "\ufeff" + strings.Join(LabelCSVHeader, ",") + "\nclm-synth-bom,grounded,dish-synthetic-1,SYNTHETIC bom,,,,false\n"
	claims, err := ReadLabelCSV(strings.NewReader(sheet))
	if err != nil {
		t.Fatalf("ReadLabelCSV with BOM: %v", err)
	}
	if len(claims) != 1 || claims[0].ClaimID != "clm-synth-bom" {
		t.Errorf("claims = %+v, want the single BOM-sheet row", claims)
	}
}

package services

import (
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// closeTo compares floats with a relative tolerance suited to exact
// definitional conversion factors and multi-hop round trips.
func closeTo(got, want float64) bool {
	return math.Abs(got-want) <= 1e-9*math.Max(1, math.Abs(want))
}

func TestConvertMass(t *testing.T) {
	tests := []struct {
		name     string
		qty      float64
		from, to string
		want     float64
	}{
		// 1 lb = 453.59237 g and 1 oz = 1/16 lb, exactly (international
		// avoirdupois definitions).
		{"pound to grams", 1, "lb", "g", 453.59237},
		{"ounce to grams", 1, "oz", "g", 28.349523125},
		{"ounces per pound", 1, "lb", "oz", 16},
		{"grams to ounces", 250, "g", "oz", 250 / 28.349523125},
		{"kilograms to pounds", 1, "kg", "lb", 1000 / 453.59237},
		{"identity", 42, "g", "g", 42},
		{"kilograms to grams", 1.5, "kg", "g", 1500},
		// spelling/case/plural normalization
		{"spelled-out pounds", 2, "Pounds", "g", 907.18474},
		{"lbs plural", 2, "lbs", "g", 907.18474},
		{"spelled-out ounce", 1, "ounce", "g", 28.349523125},
		{"trailing dot", 1, "oz.", "g", 28.349523125},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Convert(tt.qty, tt.from, tt.to)
			if err != nil {
				t.Fatalf("Convert(%v, %q, %q) error: %v", tt.qty, tt.from, tt.to, err)
			}
			if !closeTo(got, tt.want) {
				t.Errorf("Convert(%v, %q, %q) = %v, want %v", tt.qty, tt.from, tt.to, got, tt.want)
			}
		})
	}
}

func TestConvertVolume(t *testing.T) {
	tests := []struct {
		name     string
		qty      float64
		from, to string
		want     float64
	}{
		// US customary volume derives exactly from 1 gal = 231 in^3 and
		// 1 in = 2.54 cm: 1 gal = 3785.411784 ml.
		{"cup to ml", 1, "cup", "ml", 236.5882365},
		{"fluid ounce to ml", 1, "fl oz", "ml", 29.5735295625},
		{"teaspoon to ml", 1, "tsp", "ml", 4.92892159375},
		{"tablespoon to teaspoons", 1, "tbsp", "tsp", 3},
		{"cup to tablespoons", 1, "cup", "tbsp", 16},
		{"fluid ounce to tablespoons", 1, "fl oz", "tbsp", 2},
		{"pint to cups", 1, "pint", "cup", 2},
		{"quart to pints", 1, "quart", "pint", 2},
		{"gallon to quarts", 1, "gallon", "quart", 4},
		{"liter to ml", 1, "l", "ml", 1000},
		{"ml to liter", 500, "ml", "l", 0.5},
		{"liters to cups", 2, "L", "cup", 2000 / 236.5882365},
		// spelling/case/plural/abbreviation normalization
		{"spelled-out teaspoons", 3, "teaspoons", "ml", 3 * 4.92892159375},
		{"spelled-out fluid ounce", 1, "fluid ounce", "ml", 29.5735295625},
		{"gal abbreviation", 0.5, "gal", "fl oz", 64},
		{"qt abbreviation", 1, "qt", "fl oz", 32},
		{"pt abbreviation", 1, "pt", "fl oz", 16},
		{"millilitres spelling", 250, "millilitres", "cup", 250 / 236.5882365},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Convert(tt.qty, tt.from, tt.to)
			if err != nil {
				t.Fatalf("Convert(%v, %q, %q) error: %v", tt.qty, tt.from, tt.to, err)
			}
			if !closeTo(got, tt.want) {
				t.Errorf("Convert(%v, %q, %q) = %v, want %v", tt.qty, tt.from, tt.to, got, tt.want)
			}
		})
	}
}

func TestConvertRoundTrips(t *testing.T) {
	massUnits := []string{"g", "kg", "oz", "lb"}
	volumeUnits := []string{"ml", "l", "tsp", "tbsp", "fl oz", "cup", "pint", "quart", "gallon"}
	const qty = 3.7
	for _, units := range [][]string{massUnits, volumeUnits} {
		for _, from := range units {
			for _, to := range units {
				there, err := Convert(qty, from, to)
				if err != nil {
					t.Fatalf("Convert(%v, %q, %q) error: %v", qty, from, to, err)
				}
				back, err := Convert(there, to, from)
				if err != nil {
					t.Fatalf("Convert(%v, %q, %q) error: %v", there, to, from, err)
				}
				if !closeTo(back, qty) {
					t.Errorf("round trip %q -> %q -> %q: %v, want %v", from, to, from, back, qty)
				}
			}
		}
	}
}

func TestConvertErrors(t *testing.T) {
	t.Run("unknown from unit", func(t *testing.T) {
		_, err := Convert(1, "splash", "g")
		var unk *UnknownUnitError
		if !errors.As(err, &unk) {
			t.Fatalf("Convert error = %v, want *UnknownUnitError", err)
		}
		if unk.Unit != "splash" {
			t.Errorf("UnknownUnitError.Unit = %q, want %q", unk.Unit, "splash")
		}
	})
	t.Run("unknown to unit", func(t *testing.T) {
		_, err := Convert(1, "g", "smidgen")
		var unk *UnknownUnitError
		if !errors.As(err, &unk) {
			t.Fatalf("Convert error = %v, want *UnknownUnitError", err)
		}
		if unk.Unit != "smidgen" {
			t.Errorf("UnknownUnitError.Unit = %q, want %q", unk.Unit, "smidgen")
		}
	})
	// volume->mass (and the reverse) never converts without portions data:
	// there is no universal density to assume.
	t.Run("mass to volume is refused", func(t *testing.T) {
		if _, err := Convert(100, "g", "ml"); !errors.Is(err, ErrDimensionMismatch) {
			t.Fatalf("Convert error = %v, want ErrDimensionMismatch", err)
		}
	})
	t.Run("volume to mass is refused", func(t *testing.T) {
		if _, err := Convert(1, "cup", "lb"); !errors.Is(err, ErrDimensionMismatch) {
			t.Fatalf("Convert error = %v, want ErrDimensionMismatch", err)
		}
	})
}

// Synthetic portions fixture. Note "tablespoon" spelling (normalized at
// load), a broken zero row (skipped), and per-food volume-row coverage:
// widget fruit has cup, plain paste tbsp, fizzy syrup tsp+cup, solid
// block none.
const testUnitsPortionsCSV = `name,fdc_id,source_dataset,amount,unit,portion_description,gram_weight
widget fruit,900001,sr_legacy,2,cup,"cup, chopped",300
widget fruit,900001,sr_legacy,1,slice,slice,20
plain paste,900002,sr_legacy,1,tablespoon,tablespoon,15
solid block,900003,sr_legacy,1,whole,whole,120
fizzy syrup,900004,sr_legacy,0,cup,broken row,0
fizzy syrup,900004,sr_legacy,1,tsp,tsp,6
fizzy syrup,900004,sr_legacy,1,cup,cup,200
`

func syntheticPortionTable(t *testing.T) *PortionTable {
	t.Helper()
	path := filepath.Join(t.TempDir(), "portions.csv")
	if err := os.WriteFile(path, []byte(testUnitsPortionsCSV), 0o644); err != nil {
		t.Fatal(err)
	}
	pt, err := NewPortionTable(path)
	if err != nil {
		t.Fatalf("NewPortionTable(synthetic): %v", err)
	}
	return pt
}

func TestPortionTableGramMass(t *testing.T) {
	pt := syntheticPortionTable(t)
	tests := []struct {
		name string
		food string
		qty  float64
		unit string
		want float64
	}{
		// mass units convert definitionally, no portion row needed
		{"grams pass through", "widget fruit", 50, "g", 50},
		{"kilograms", "widget fruit", 0.25, "kg", 250},
		{"pounds", "widget fruit", 2, "lbs", 2 * 453.59237},
		{"ounces need no food row", "no such food", 4, "oz", 4 * 28.349523125},
		// household units via the food's portion rows (2 cup = 300 g)
		{"exact volume row", "widget fruit", 1, "cup", 150},
		{"exact household row", "widget fruit", 3, "slices", 60},
		{"load-side spelling normalization", "plain paste", 2, "Tablespoons", 30},
		// metric volume bridges through the first usable volume row:
		// ml -> row unit exactly, then the row's gram weight
		{"ml bridges via cup row", "widget fruit", 100, "ml", 100 / 236.5882365 * 150},
		{"liters bridge via tbsp row", "plain paste", 0.1, "l", 100 / 14.78676478125 * 15},
		{"broken rows skipped, first usable volume row wins", "fizzy syrup", 10, "ml", 10 / 4.92892159375 * 6},
		{"exact row beats bridging", "fizzy syrup", 1, "cup", 200},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := pt.GramMass(tt.food, tt.qty, tt.unit)
			if err != nil {
				t.Fatalf("GramMass(%q, %v, %q) error: %v", tt.food, tt.qty, tt.unit, err)
			}
			if !closeTo(got, tt.want) {
				t.Errorf("GramMass(%q, %v, %q) = %v, want %v", tt.food, tt.qty, tt.unit, got, tt.want)
			}
		})
	}
}

func TestPortionTableGramMassFailsClosed(t *testing.T) {
	pt := syntheticPortionTable(t)
	t.Run("volume unit with no volume rows", func(t *testing.T) {
		if _, err := pt.GramMass("solid block", 10, "ml"); !errors.Is(err, ErrNoPortion) {
			t.Fatalf("GramMass error = %v, want ErrNoPortion", err)
		}
	})
	t.Run("unknown food with volume unit", func(t *testing.T) {
		if _, err := pt.GramMass("no such food", 1, "cup"); !errors.Is(err, ErrNoPortion) {
			t.Fatalf("GramMass error = %v, want ErrNoPortion", err)
		}
	})
	t.Run("unknown unit", func(t *testing.T) {
		_, err := pt.GramMass("widget fruit", 1, "splash")
		var unk *UnknownUnitError
		if !errors.As(err, &unk) {
			t.Fatalf("GramMass error = %v, want *UnknownUnitError", err)
		}
		if unk.Unit != "splash" {
			t.Errorf("UnknownUnitError.Unit = %q, want %q", unk.Unit, "splash")
		}
	})
}

func TestNewPortionTableErrors(t *testing.T) {
	if _, err := NewPortionTable("does-not-exist.csv"); err == nil {
		t.Fatal("want error for missing file, got nil")
	}
	dir := t.TempDir()
	badHeader := filepath.Join(dir, "bad_header.csv")
	if err := os.WriteFile(badHeader, []byte("name,amount\nx,1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewPortionTable(badHeader); err == nil {
		t.Fatal("want error for missing columns, got nil")
	}
	badCell := filepath.Join(dir, "bad_cell.csv")
	if err := os.WriteFile(badCell,
		[]byte("name,amount,unit,gram_weight\nx,one,cup,100\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewPortionTable(badCell); err == nil {
		t.Fatal("want error for non-numeric amount, got nil")
	}
}

package services

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Unit conversion (task 2.3, spec §5): metric<->US conversions are exact
// within a dimension (mass or volume); volume->mass crosses dimensions and
// is done ONLY through the vendored USDA foodPortion table (PortionTable),
// never through an assumed density. Failures are typed errors the callers
// surface as [unverified] — a quantity is never guessed.
//
// The factors below are definitional, not measured: the international
// avoirdupois pound is exactly 453.59237 g (oz = 1/16 lb), and US customary
// liquid volume derives exactly from 1 gallon = 231 cubic inches with
// 1 inch = 2.54 cm (so 1 gal = 3785.411784 ml), subdivided as
// 1 gal = 4 qt = 8 pt = 16 cup = 128 fl oz and 1 fl oz = 2 tbsp = 6 tsp.

// massToGrams maps canonical mass unit tokens to grams per unit.
var massToGrams = map[string]float64{
	"g":  1,
	"kg": 1000,
	"oz": 28.349523125,
	"lb": 453.59237,
}

// volumeToML maps canonical volume unit tokens to milliliters per unit.
var volumeToML = map[string]float64{
	"ml":     1,
	"l":      1000,
	"tsp":    4.92892159375,
	"tbsp":   14.78676478125,
	"fl oz":  29.5735295625,
	"cup":    236.5882365,
	"pint":   473.176473,
	"quart":  946.352946,
	"gallon": 3785.411784,
}

// UnknownUnitError reports a unit outside the supported mass/volume
// vocabulary (and, for GramMass, outside the food's portion rows). Callers
// surface it as [unverified] rather than guessing.
type UnknownUnitError struct {
	Unit string // as given by the caller, before normalization
}

func (e *UnknownUnitError) Error() string {
	return fmt.Sprintf("unknown unit %q", e.Unit)
}

// ErrDimensionMismatch is returned by Convert for a mass<->volume request:
// crossing dimensions requires a per-food density, which exists only in the
// USDA portions table (use PortionTable.GramMass).
var ErrDimensionMismatch = errors.New("mass<->volume conversion requires the USDA portions table")

// ErrNoPortion is returned by GramMass when a volume quantity has no
// portions-table path to grams for the food. The line stays [unverified].
var ErrNoPortion = errors.New("no usable portion row for volume->mass conversion")

// Convert converts qty between two units of the same dimension — mass
// (g, kg, oz, lb) or volume (ml, l, tsp, tbsp, fl oz, cup, pint, quart,
// gallon) — using the exact definitional factors above. Unit spellings are
// normalized (case, plurals, common abbreviations). An unrecognized unit
// yields *UnknownUnitError; a mass<->volume request yields
// ErrDimensionMismatch.
func Convert(qty float64, fromUnit, toUnit string) (float64, error) {
	from, to := normalizeUnit(fromUnit), normalizeUnit(toUnit)
	fromMass, fromIsMass := massToGrams[from]
	fromVol, fromIsVol := volumeToML[from]
	toMass, toIsMass := massToGrams[to]
	toVol, toIsVol := volumeToML[to]
	switch {
	case !fromIsMass && !fromIsVol:
		return 0, &UnknownUnitError{Unit: fromUnit}
	case !toIsMass && !toIsVol:
		return 0, &UnknownUnitError{Unit: toUnit}
	case fromIsMass && toIsMass:
		return qty * fromMass / toMass, nil
	case fromIsVol && toIsVol:
		return qty * fromVol / toVol, nil
	}
	return 0, fmt.Errorf("%w: %s -> %s", ErrDimensionMismatch, from, to)
}

// PortionTable is the vendored USDA foodPortion subset
// (data/usda/portions.csv, provenance in data/usda/PROVENANCE.md): per-food
// household-measure gram weights. It is the shared volume->mass hook for
// the nutrition and cost services — both pro-rate by the gram mass it
// resolves.
type PortionTable struct {
	byFood map[string][]usdaPortion // canonical universe name -> rows, table order
}

type usdaPortion struct {
	amount     float64 // e.g. 2 for "2 tbsp = 35.8 g"
	unit       string  // normalized unit token
	gramWeight float64
}

// NewPortionTable loads the vendored portions CSV, normalizing unit
// spellings so draft units match the vendored rows.
func NewPortionTable(path string) (*PortionTable, error) {
	t := &PortionTable{byFood: make(map[string][]usdaPortion)}
	if err := forEachCSVRow(path,
		[]string{"name", "amount", "unit", "gram_weight"},
		func(row map[string]string) error {
			amount, err := strconv.ParseFloat(row["amount"], 64)
			if err != nil {
				return fmt.Errorf("bad amount for %q: %w", row["name"], err)
			}
			gramWeight, err := strconv.ParseFloat(row["gram_weight"], 64)
			if err != nil {
				return fmt.Errorf("bad gram_weight for %q: %w", row["name"], err)
			}
			name := row["name"]
			t.byFood[name] = append(t.byFood[name], usdaPortion{
				amount:     amount,
				unit:       normalizeUnit(row["unit"]),
				gramWeight: gramWeight,
			})
			return nil
		}); err != nil {
		return nil, fmt.Errorf("load portions: %w", err)
	}
	return t, nil
}

// GramMass resolves qty+unit of the named food (the canonical universe
// name, the portions join key) to grams:
//
//  1. mass units convert definitionally, food-independent;
//  2. any other unit matches the food's portion rows exactly (first usable
//     row in table order wins — this is how household measures like clove
//     or slice resolve);
//  3. a known volume unit with no exact row bridges through the first
//     usable volume portion row: exact volume->volume conversion, then the
//     row's gram weight. The density always comes from the portions table.
//
// Everything else fails closed: *UnknownUnitError for a unit outside the
// vocabulary and the food's rows, ErrNoPortion when no portions-table path
// to mass exists. Callers surface both as [unverified].
func (t *PortionTable) GramMass(food string, qty float64, unit string) (float64, error) {
	u := normalizeUnit(unit)
	if perUnit, ok := massToGrams[u]; ok {
		return qty * perUnit, nil
	}
	rows := t.byFood[food]
	for _, p := range rows {
		if p.unit == u && p.amount > 0 && p.gramWeight > 0 {
			return qty * p.gramWeight / p.amount, nil
		}
	}
	ml, isVolume := volumeToML[u]
	if !isVolume {
		return 0, &UnknownUnitError{Unit: unit}
	}
	for _, p := range rows {
		rowML, ok := volumeToML[p.unit]
		if ok && p.amount > 0 && p.gramWeight > 0 {
			return qty * ml / rowML * p.gramWeight / p.amount, nil
		}
	}
	return 0, fmt.Errorf("%w: %q has no volume portion row for unit %q", ErrNoPortion, food, unit)
}

// normalizeUnit canonicalizes unit spellings so draft units match the
// conversion tables and vendored portion units: case/whitespace-insensitive,
// plural-insensitive, folding common long forms and abbreviations.
func normalizeUnit(u string) string {
	u = strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(u))), " ")
	u = strings.TrimSuffix(u, ".")
	switch u {
	case "g", "gram", "grams":
		return "g"
	case "kg", "kilogram", "kilograms":
		return "kg"
	case "oz", "ounce", "ounces":
		return "oz"
	case "lb", "lbs", "pound", "pounds":
		return "lb"
	case "ml", "milliliter", "milliliters", "millilitre", "millilitres":
		return "ml"
	case "l", "liter", "liters", "litre", "litres":
		return "l"
	case "tsp", "tsps", "teaspoon", "teaspoons":
		return "tsp"
	case "tbsp", "tbsps", "tablespoon", "tablespoons":
		return "tbsp"
	case "fl oz", "floz", "fluid ounce", "fluid ounces":
		return "fl oz"
	case "pt", "pint", "pints":
		return "pint"
	case "qt", "quart", "quarts":
		return "quart"
	case "gal", "gallon", "gallons":
		return "gallon"
	}
	return singularizeToken(u)
}

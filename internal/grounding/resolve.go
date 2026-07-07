package grounding

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// entity is one resolvable universe ingredient, pointer-free so every Resolve
// call hands out fresh pointers the caller cannot alias (same property as the
// stub). Empty id = that vocabulary has no match for the ingredient.
type entity struct {
	fdcID     string
	foodOnID  string
	canonical string
}

// Resolve maps an ingredient name to its canonical universe entity: normalize
// (lowercase, non-alphanumerics to space, naive-singularize), look up among
// canonical names then the curated alias table (data/aliases.csv), and — only
// if that misses — retry with preparation qualifiers ("fresh", "chopped", …)
// stripped. Strictly deterministic; no-match returns ok=false.
func (s *Service) Resolve(name string) (Resolution, bool) {
	key, ok := s.canonicalKey(name)
	if !ok {
		return Resolution{}, false
	}
	e := s.entities[key]
	r := Resolution{Canonical: e.canonical}
	if e.fdcID != "" {
		id := e.fdcID
		r.FDCID = &id
	}
	if e.foodOnID != "" {
		id := e.foodOnID
		r.FoodOnID = &id
	}
	return r, true
}

// canonicalKey resolves any ingredient name to the normalized key of its
// universe entity. Exact normalized lookup (canonical, then alias) runs
// before qualifier stripping so identity-bearing names are never mangled.
func (s *Service) canonicalKey(name string) (string, bool) {
	k := normalizeKey(name)
	if k == "" {
		return "", false
	}
	if _, ok := s.entities[k]; ok {
		return k, true
	}
	if c, ok := s.aliases[k]; ok {
		return c, true
	}
	if st := stripQualifiers(k); st != "" && st != k {
		if _, ok := s.entities[st]; ok {
			return st, true
		}
		if c, ok := s.aliases[st]; ok {
			return c, true
		}
	}
	return "", false
}

// loadEntities builds the entity table as the union of the two vendored id
// tables: data/foodon/allergens.csv (name, foodon_id — one row per universe
// ingredient) joined with data/usda/nutrients.csv (name, fdc_id). An
// ingredient present in either file resolves; an id column left blank stays
// nil in the Resolution.
func (s *Service) loadEntities(nutrientsPath, allergensPath string) error {
	if err := forEachCSVRow(allergensPath, []string{"name", "foodon_id"},
		func(row map[string]string) error {
			name := row["name"]
			s.entities[normalizeKey(name)] = entity{
				foodOnID:  strings.TrimSpace(row["foodon_id"]),
				canonical: name,
			}
			return nil
		}); err != nil {
		return fmt.Errorf("load allergens table: %w", err)
	}
	if err := forEachCSVRow(nutrientsPath, []string{"name", "fdc_id"},
		func(row map[string]string) error {
			name := row["name"]
			key := normalizeKey(name)
			e, ok := s.entities[key]
			if !ok {
				e = entity{canonical: name}
			}
			e.fdcID = strings.TrimSpace(row["fdc_id"])
			s.entities[key] = e
			return nil
		}); err != nil {
		return fmt.Errorf("load nutrients table: %w", err)
	}
	return nil
}

// loadAliases reads the curated alias table. Every canonical value must be a
// resolvable universe name — a dangling row is a curation bug, surfaced at
// load rather than as a silent dead alias.
func (s *Service) loadAliases(aliasesPath string) error {
	if err := forEachCSVRow(aliasesPath, []string{"alias", "canonical"},
		func(row map[string]string) error {
			key := normalizeKey(row["canonical"])
			if _, ok := s.entities[key]; !ok {
				return fmt.Errorf("alias %q: canonical %q not in the universe",
					row["alias"], row["canonical"])
			}
			s.aliases[normalizeKey(row["alias"])] = key
			return nil
		}); err != nil {
		return fmt.Errorf("load alias table: %w", err)
	}
	return nil
}

// qualifiers are preparation/size tokens dropped by the second-pass lookup
// ("chopped fresh garlic" -> "garlic"). Identity-bearing modifiers are
// deliberately absent: "ground", "dried", "whole", "canned", and "smoked"
// distinguish universe ingredients (ground beef, dried basil, whole chicken,
// canned tomato) and must never be stripped.
var qualifiers = map[string]bool{
	"fresh": true, "freshly": true, "finely": true, "coarsely": true,
	"roughly": true, "thinly": true, "chopped": true, "diced": true,
	"minced": true, "sliced": true, "grated": true, "shredded": true,
	"peeled": true, "trimmed": true, "boneless": true, "skinless": true,
	"cooked": true, "raw": true, "ripe": true,
	"large": true, "small": true, "medium": true,
}

// stripQualifiers drops qualifier tokens from an already-normalized key.
func stripQualifiers(key string) string {
	var kept []string
	for _, t := range strings.Split(key, " ") {
		if !qualifiers[t] {
			kept = append(kept, t)
		}
	}
	return strings.Join(kept, " ")
}

// normalizeKey is the shared lookup normalization: lowercase, non-alphanumeric
// runs to a single space, naive-singularize each token — the same rule as the
// vendoring scripts (scripts/convert_flavorgraph.py, vendor_usda.py,
// vendor_foodon.py), so both sides of every table normalize alike.
func normalizeKey(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteByte(' ')
		}
	}
	fields := strings.Fields(b.String())
	for i, t := range fields {
		fields[i] = singularizeToken(t)
	}
	return strings.Join(fields, " ")
}

// singularizeToken applies the same naive plural rules as the vendoring
// scripts' matcher (and internal/services' normalizeName).
func singularizeToken(t string) string {
	switch {
	case len(t) > 3 && strings.HasSuffix(t, "ies"):
		return t[:len(t)-3] + "y"
	case len(t) > 3 && (strings.HasSuffix(t, "oes") ||
		strings.HasSuffix(t, "shes") || strings.HasSuffix(t, "ches") ||
		strings.HasSuffix(t, "sses") || strings.HasSuffix(t, "xes") ||
		strings.HasSuffix(t, "zes")):
		return t[:len(t)-2]
	case len(t) > 2 && strings.HasSuffix(t, "s") && !strings.HasSuffix(t, "ss"):
		return t[:len(t)-1]
	}
	return t
}

// forEachCSVRow streams a headered CSV, requiring the named columns and
// passing each row to fn as a column->value map (mirrors the unexported
// helper in internal/services).
func forEachCSVRow(path string, required []string, fn func(map[string]string) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	r := csv.NewReader(f)
	header, err := r.Read()
	if err != nil {
		return fmt.Errorf("read header of %s: %w", path, err)
	}
	col := make(map[string]int, len(header))
	for i, h := range header {
		col[h] = i
	}
	for _, want := range required {
		if _, ok := col[want]; !ok {
			return fmt.Errorf("%s: missing required column %q", path, want)
		}
	}
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		row := make(map[string]string, len(required))
		for _, name := range required {
			row[name] = rec[col[name]]
		}
		if err := fn(row); err != nil {
			return err
		}
	}
}

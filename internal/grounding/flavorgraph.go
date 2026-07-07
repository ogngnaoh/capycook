package grounding

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

// suggestTopK is the fixed pairing fan-out (spec §5: top-k=10 into context).
const suggestTopK = 10

// Service is the real, data-backed Grounding (task 2.7): FlavorGraph pairing
// suggestions over the vendored universe-subset embeddings
// (data/flavorgraph/embeddings.csv, provenance in its PROVENANCE.md) plus
// deterministic USDA/FoodOn entity resolution (resolve.go). The Phase-1 Stub
// stays for other packages' tests; wiring swaps this in at task 2.8.
type Service struct {
	aliases  map[string]string    // normalized alias -> canonical entity key
	entities map[string]entity    // canonical entity key -> ids + display name
	embNames []string             // canonical names with embeddings, sorted
	vectors  map[string][]float64 // canonical name -> unit-normalized vector
	dim      int
}

var _ Grounding = (*Service)(nil)

// NewService loads the four vendored tables. Every embedding row must name a
// resolvable universe ingredient — the vendored suggestion vocabulary is
// restricted to the universe by construction so each suggestion is
// resolvable/costable, and a violation is a data bug surfaced at load.
func NewService(embeddingsPath, aliasesPath, nutrientsPath, allergensPath string) (*Service, error) {
	s := &Service{
		aliases:  make(map[string]string),
		entities: make(map[string]entity),
		vectors:  make(map[string][]float64),
	}
	if err := s.loadEntities(nutrientsPath, allergensPath); err != nil {
		return nil, fmt.Errorf("grounding: %w", err)
	}
	if err := s.loadAliases(aliasesPath); err != nil {
		return nil, fmt.Errorf("grounding: %w", err)
	}
	if err := s.loadEmbeddings(embeddingsPath); err != nil {
		return nil, fmt.Errorf("grounding: %w", err)
	}
	return s, nil
}

// Suggest returns the top-10 FlavorGraph pairings for the draft's seed
// ingredients. Each seed is canonicalized like Resolve input; seeds that do
// not canonicalize (or have no embedding) contribute nothing. The query is
// the mean of the seed unit vectors, so a candidate's score is its mean
// cosine similarity to the seeds; candidates are scored in sorted-name order
// and ranked score-descending with ties broken by name ascending — fully
// deterministic. Seeds themselves are never suggested.
func (s *Service) Suggest(ingredients []string) []Pairing {
	seedSet := make(map[string]bool)
	var seedVecs [][]float64
	for _, in := range ingredients {
		key, ok := s.canonicalKey(in)
		if !ok {
			continue
		}
		name := s.entities[key].canonical
		vec, ok := s.vectors[name]
		if !ok || seedSet[name] {
			continue
		}
		seedSet[name] = true
		seedVecs = append(seedVecs, vec)
	}
	if len(seedVecs) == 0 {
		return nil
	}

	query := make([]float64, s.dim)
	for _, vec := range seedVecs {
		for i, x := range vec {
			query[i] += x
		}
	}
	for i := range query {
		query[i] /= float64(len(seedVecs))
	}

	type scored struct {
		name  string
		score float64
	}
	candidates := make([]scored, 0, len(s.embNames))
	for _, name := range s.embNames {
		if seedSet[name] {
			continue
		}
		var dot float64
		for i, x := range s.vectors[name] {
			dot += x * query[i]
		}
		candidates = append(candidates, scored{name, dot})
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		return candidates[i].name < candidates[j].name
	})

	k := suggestTopK
	if len(candidates) < k {
		k = len(candidates)
	}
	out := make([]Pairing, k)
	for i := range out {
		out[i] = Pairing{Ingredient: candidates[i].name, Score: candidates[i].score}
	}
	return out
}

// loadEmbeddings reads the vendored subset CSV (name, node_id, fg_name,
// v0..v299) and pre-normalizes each vector to unit length, so Suggest's dot
// products are cosine similarities.
func (s *Service) loadEmbeddings(path string) error {
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
	if len(header) < 4 || header[0] != "name" || !strings.HasPrefix(header[3], "v") {
		return fmt.Errorf("%s: unexpected header %v", path, header[:min(len(header), 4)])
	}
	s.dim = len(header) - 3
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		name := rec[0]
		key := normalizeKey(name)
		if e, ok := s.entities[key]; !ok || e.canonical != name {
			return fmt.Errorf("%s: embedding row %q is not a canonical universe ingredient", path, name)
		}
		vec := make([]float64, s.dim)
		var sumSq float64
		for i, field := range rec[3:] {
			x, err := strconv.ParseFloat(field, 64)
			if err != nil {
				return fmt.Errorf("%s: row %q component %d: %w", path, name, i, err)
			}
			vec[i] = x
			sumSq += x * x
		}
		if sumSq == 0 {
			return fmt.Errorf("%s: row %q has a zero vector", path, name)
		}
		norm := math.Sqrt(sumSq)
		for i := range vec {
			vec[i] /= norm
		}
		if _, dup := s.vectors[name]; dup {
			return fmt.Errorf("%s: duplicate embedding row %q", path, name)
		}
		s.vectors[name] = vec
		s.embNames = append(s.embNames, name)
	}
	sort.Strings(s.embNames)
	return nil
}

package proposal

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// ComputeDiff emits the minimal RFC-6902-style op list transforming old
// into new, addressed by RFC-6901 JSON Pointers, with From filled on
// replace. Property: old.Apply(ComputeDiff(old, new)) deep-equals new.
// The diff is computed on the drafts' JSON trees — the same representation
// draft.Apply patches — so ops always line up with the wire schema. Lists
// are aligned on unchanged elements (longest common subsequence); edited
// elements diff in place, everything else becomes targeted add/remove ops.
func ComputeDiff(old, new draft.Draft) []Op {
	return diffValues("", toTree(old), toTree(new))
}

// toTree round-trips a Draft through JSON into the generic tree
// (map[string]any / []any / float64 / string / bool / nil) the diff walks.
func toTree(d draft.Draft) any {
	raw, err := json.Marshal(d)
	if err != nil {
		panic(fmt.Sprintf("proposal: marshal draft: %v", err)) // unreachable: Draft is plain data
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		panic(fmt.Sprintf("proposal: unmarshal draft: %v", err)) // unreachable: input is json.Marshal output
	}
	return v
}

// diffValues diffs two JSON values at path, recursing into containers of
// the same kind and emitting a single replace otherwise.
func diffValues(path string, old, new any) []Op {
	if reflect.DeepEqual(old, new) {
		return nil
	}
	if om, ok := old.(map[string]any); ok {
		if nm, ok := new.(map[string]any); ok {
			return diffObjects(path, om, nm)
		}
	}
	if oa, ok := old.([]any); ok {
		if na, ok := new.([]any); ok {
			return diffArrays(path, oa, na)
		}
	}
	return []Op{{Op: "replace", Path: path, Value: mustRaw(new), From: mustRaw(old)}}
}

// diffObjects walks the union of member names in sorted order (for
// deterministic output). Between two valid Drafts both sides always carry
// the same members, but missing members are handled anyway.
func diffObjects(path string, old, new map[string]any) []Op {
	keys := make([]string, 0, len(old))
	for k := range old {
		keys = append(keys, k)
	}
	for k := range new {
		if _, ok := old[k]; !ok {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	var ops []Op
	for _, k := range keys {
		childPath := path + "/" + escapeToken(k)
		ov, inOld := old[k]
		nv, inNew := new[k]
		switch {
		case inOld && inNew:
			ops = append(ops, diffValues(childPath, ov, nv)...)
		case inOld:
			ops = append(ops, Op{Op: "remove", Path: childPath})
		default:
			ops = append(ops, Op{Op: "add", Path: childPath, Value: mustRaw(nv)})
		}
	}
	return ops
}

// diffArrays aligns the two arrays on their longest common subsequence of
// deep-equal elements. Unmatched elements between anchors are paired up
// positionally and diffed in place (an edit stays a targeted nested op);
// leftovers become removes (old longer) or adds (new longer). Indices in
// emitted pointers account for the length changes of earlier ops, since
// draft.Apply applies ops sequentially.
func diffArrays(path string, old, new []any) []Op {
	matches := lcsMatches(old, new)
	matches = append(matches, match{len(old), len(new)}) // sentinel closes the tail gap

	var ops []Op
	offset := 0 // adds minus removes emitted so far
	oi, ni := 0, 0
	for _, m := range matches {
		oldRun, newRun := old[oi:m.i], new[ni:m.j]
		pairs := min(len(oldRun), len(newRun))
		cur := oi + offset // intermediate-array index of the gap's start
		for p := 0; p < pairs; p++ {
			ops = append(ops, diffValues(path+"/"+strconv.Itoa(cur+p), oldRun[p], newRun[p])...)
		}
		for k := 0; k < len(oldRun)-pairs; k++ {
			// Each remove shifts the rest left, so the index stays put.
			ops = append(ops, Op{Op: "remove", Path: path + "/" + strconv.Itoa(cur+pairs)})
			offset--
		}
		for k := pairs; k < len(newRun); k++ {
			ops = append(ops, Op{Op: "add", Path: path + "/" + strconv.Itoa(cur+k), Value: mustRaw(newRun[k])})
			offset++
		}
		oi, ni = m.i+1, m.j+1
	}
	return ops
}

// match pairs old index i with new index j for one deep-equal element.
type match struct{ i, j int }

// lcsMatches returns the longest common subsequence of deep-equal elements
// as ordered (i, j) index pairs — the anchors diffArrays aligns on.
func lcsMatches(a, b []any) []match {
	// dp[i][j] = LCS length of a[i:] vs b[j:].
	dp := make([][]int, len(a)+1)
	for i := range dp {
		dp[i] = make([]int, len(b)+1)
	}
	for i := len(a) - 1; i >= 0; i-- {
		for j := len(b) - 1; j >= 0; j-- {
			if reflect.DeepEqual(a[i], b[j]) {
				dp[i][j] = dp[i+1][j+1] + 1
			} else {
				dp[i][j] = max(dp[i+1][j], dp[i][j+1])
			}
		}
	}
	var out []match
	for i, j := 0, 0; i < len(a) && j < len(b); {
		switch {
		case reflect.DeepEqual(a[i], b[j]) && dp[i][j] == dp[i+1][j+1]+1:
			out = append(out, match{i, j})
			i++
			j++
		case dp[i+1][j] >= dp[i][j+1]:
			i++
		default:
			j++
		}
	}
	return out
}

// escapeToken applies RFC-6901 escaping: ~ => ~0 first, then / => ~1.
func escapeToken(tok string) string {
	tok = strings.ReplaceAll(tok, "~", "~0")
	return strings.ReplaceAll(tok, "/", "~1")
}

// mustRaw marshals a value taken from a JSON tree back to raw JSON.
func mustRaw(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("proposal: marshal diff value: %v", err)) // unreachable: v came from json.Unmarshal
	}
	return raw
}

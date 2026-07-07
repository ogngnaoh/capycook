package draft

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Op is one RFC-6902-style patch operation against a Draft, addressed by an
// RFC-6901 JSON Pointer. It lives here rather than in internal/proposal so
// draft carries no dependency on proposal; proposal re-exports it as a type
// alias (spec §4).
type Op struct {
	Op    string          `json:"op"`   // add|remove|replace
	Path  string          `json:"path"` // RFC-6901 JSON Pointer
	Value json.RawMessage `json:"value,omitempty"`
	From  json.RawMessage `json:"from,omitempty"` // old value on replace (audit only; ignored by Apply)
}

// Apply applies ops in order and returns the resulting Draft. The receiver
// is never modified: Apply works on a deep copy via a JSON round-trip, so on
// any error — bad pointer, bad op, or a result that no longer fits the Draft
// schema — the caller's Draft is untouched and a zero Draft is returned.
func (d Draft) Apply(ops []Op) (Draft, error) {
	raw, err := json.Marshal(d)
	if err != nil {
		return Draft{}, fmt.Errorf("draft: marshal: %w", err)
	}
	var doc any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return Draft{}, fmt.Errorf("draft: unmarshal: %w", err)
	}
	for i, op := range ops {
		doc, err = applyOp(doc, op)
		if err != nil {
			return Draft{}, fmt.Errorf("draft: op %d (%s %s): %w", i, op.Op, op.Path, err)
		}
	}
	out, err := json.Marshal(doc)
	if err != nil {
		return Draft{}, fmt.Errorf("draft: marshal result: %w", err)
	}
	dec := json.NewDecoder(bytes.NewReader(out))
	dec.DisallowUnknownFields()
	var applied Draft
	if err := dec.Decode(&applied); err != nil {
		return Draft{}, fmt.Errorf("draft: result does not fit the Draft schema: %w", err)
	}
	return applied, nil
}

// applyOp applies a single op to the generic JSON tree and returns the
// (possibly re-allocated) document root.
func applyOp(doc any, op Op) (any, error) {
	tokens, err := parsePointer(op.Path)
	if err != nil {
		return nil, err
	}
	switch op.Op {
	case "add", "replace":
		if op.Value == nil {
			return nil, fmt.Errorf("missing value")
		}
		var v any
		if err := json.Unmarshal(op.Value, &v); err != nil {
			return nil, fmt.Errorf("invalid value: %w", err)
		}
		return setValue(doc, tokens, v, op.Op == "add")
	case "remove":
		return removeValue(doc, tokens)
	default:
		return nil, fmt.Errorf("unknown op %q", op.Op)
	}
}

// parsePointer splits an RFC-6901 JSON Pointer into unescaped reference
// tokens. The empty pointer addresses the whole document and yields nil.
func parsePointer(p string) ([]string, error) {
	if p == "" {
		return nil, nil
	}
	if !strings.HasPrefix(p, "/") {
		return nil, fmt.Errorf("pointer %q must start with /", p)
	}
	tokens := strings.Split(p[1:], "/")
	for i, tok := range tokens {
		tok = strings.ReplaceAll(tok, "~1", "/") // order matters: ~1 before ~0
		tokens[i] = strings.ReplaceAll(tok, "~0", "~")
	}
	return tokens, nil
}

// setValue writes v at the location named by tokens and returns the
// (possibly re-allocated) container. add inserts into arrays ("-" appends,
// index == len allowed) and creates or replaces object members; replace
// requires the target to already exist.
func setValue(doc any, tokens []string, v any, isAdd bool) (any, error) {
	if len(tokens) == 0 {
		return v, nil // whole-document add/replace
	}
	tok, rest := tokens[0], tokens[1:]
	switch c := doc.(type) {
	case map[string]any:
		if len(rest) == 0 {
			if _, ok := c[tok]; !ok && !isAdd {
				return nil, fmt.Errorf("replace: member %q not found", tok)
			}
			c[tok] = v
			return c, nil
		}
		child, ok := c[tok]
		if !ok {
			return nil, fmt.Errorf("member %q not found", tok)
		}
		next, err := setValue(child, rest, v, isAdd)
		if err != nil {
			return nil, err
		}
		c[tok] = next
		return c, nil
	case []any:
		if len(rest) == 0 && isAdd {
			if tok == "-" {
				return append(c, v), nil
			}
			i, err := arrayIndex(tok, len(c), true)
			if err != nil {
				return nil, err
			}
			out := make([]any, 0, len(c)+1)
			out = append(out, c[:i]...)
			out = append(out, v)
			out = append(out, c[i:]...)
			return out, nil
		}
		i, err := arrayIndex(tok, len(c), false)
		if err != nil {
			return nil, err
		}
		if len(rest) == 0 {
			c[i] = v
			return c, nil
		}
		next, err := setValue(c[i], rest, v, isAdd)
		if err != nil {
			return nil, err
		}
		c[i] = next
		return c, nil
	default:
		return nil, fmt.Errorf("cannot descend into non-container at %q", tok)
	}
}

// removeValue deletes the location named by tokens and returns the
// (possibly re-allocated) container. The target must exist.
func removeValue(doc any, tokens []string) (any, error) {
	if len(tokens) == 0 {
		return nil, fmt.Errorf("cannot remove the whole document")
	}
	tok, rest := tokens[0], tokens[1:]
	switch c := doc.(type) {
	case map[string]any:
		if len(rest) == 0 {
			if _, ok := c[tok]; !ok {
				return nil, fmt.Errorf("remove: member %q not found", tok)
			}
			delete(c, tok)
			return c, nil
		}
		child, ok := c[tok]
		if !ok {
			return nil, fmt.Errorf("member %q not found", tok)
		}
		next, err := removeValue(child, rest)
		if err != nil {
			return nil, err
		}
		c[tok] = next
		return c, nil
	case []any:
		i, err := arrayIndex(tok, len(c), false)
		if err != nil {
			return nil, err
		}
		if len(rest) == 0 {
			return append(c[:i:i], c[i+1:]...), nil
		}
		next, err := removeValue(c[i], rest)
		if err != nil {
			return nil, err
		}
		c[i] = next
		return c, nil
	default:
		return nil, fmt.Errorf("cannot descend into non-container at %q", tok)
	}
}

// arrayIndex parses an RFC-6901 array reference token: decimal digits only,
// no leading zeros. allowEnd permits index == length (add appends there).
// "-" is handled by the add path before this is called, so it is always an
// error here.
func arrayIndex(tok string, length int, allowEnd bool) (int, error) {
	if tok == "-" {
		return 0, fmt.Errorf(`"-" is only valid when adding to an array`)
	}
	if tok == "" || (len(tok) > 1 && tok[0] == '0') {
		return 0, fmt.Errorf("invalid array index %q", tok)
	}
	for _, r := range tok {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("invalid array index %q", tok)
		}
	}
	i, err := strconv.Atoi(tok)
	if err != nil {
		return 0, fmt.Errorf("invalid array index %q", tok)
	}
	limit := length - 1
	if allowEnd {
		limit = length
	}
	if i > limit {
		return 0, fmt.Errorf("array index %d out of range (len %d)", i, length)
	}
	return i, nil
}

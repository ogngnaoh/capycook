package httpapi

// Post-cook iterate flow over the wire (task 5.3): POST /move with the
// additive baseVersion field.

import (
	"net/http"
	"testing"

	"github.com/ogngnaoh/capycook/internal/orchestrator"
)

// TestMoveWithBaseVersion: a move against a cooked version generates one
// re-proposal from that version's draft; accepting parents the new version
// to the cooked base (a sibling branch beside the trunk head).
func TestMoveWithBaseVersion(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	_, p1 := e.toGate(t, id, "seed_expand", "")
	cooked := e.accept(t, id, p1.ID).NewVersionID
	_, p2 := e.toGate(t, id, "technique_step", "")
	head := e.accept(t, id, p2.ID).NewVersionID

	rec := e.do("POST", "/api/dishes/"+id+"/move", session,
		map[string]any{"moveType": "iterate_feedback", "steer": "less oil next time", "baseVersion": cooked})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("move with baseVersion: status %d, body %s", rec.Code, rec.Body.String())
	}
	det := e.waitFor(t, id, func(d dishDetail) bool { return d.State == orchestrator.StateAwaitingGate })
	newVer := e.accept(t, id, det.PendingProposal.ID).NewVersionID

	vers := decode[versionsResponse](t, e.do("GET", "/api/dishes/"+id+"/versions", "", nil))
	var parent *string
	for _, v := range vers.Versions {
		if v.ID == newVer {
			parent = v.ParentVersionID
		}
	}
	if parent == nil || *parent != cooked {
		t.Errorf("post-cook version parent = %v, want the cooked base %q (trunk head was %q)", parent, cooked, head)
	}
	if vers.CurrentVersionID == nil || *vers.CurrentVersionID != newVer {
		t.Errorf("currentVersionId = %v, want the accepted post-cook version %q", vers.CurrentVersionID, newVer)
	}
}

// TestMoveWithUnknownBaseVersion400: an invalid baseVersion is a 400, not a
// 404/500.
func TestMoveWithUnknownBaseVersion400(t *testing.T) {
	e := newEnv(t)
	id := e.createDish(t)
	rec := e.do("POST", "/api/dishes/"+id+"/move", session,
		map[string]any{"moveType": "iterate_feedback", "steer": "x", "baseVersion": "ver_ghost"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body %s", rec.Code, rec.Body.String())
	}
}

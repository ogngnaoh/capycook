// Package eval is the hand-rolled eval harness (hero artifact; SPEC §3/§5,
// PREREGISTRATION §5–§8): it replays the append-only event log into the H2
// gate-dynamics fold (native distribution per move category + the stated
// frozen-five derivation), computes the three frozen §7a provenance rates
// over labeled-claim files, and computes Cohen's κ + the confusion matrix
// over the double-labeled subset. The 3-arm runner and the tiered labeling
// kit (Tier-1 deterministic verifier + blinded author R1 + judge R2, PREREG
// §9 Amendment 1) land here too; the CLI over this package lives in cmd/eval.
package eval

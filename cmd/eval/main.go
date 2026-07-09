// Command eval is the hand-rolled eval-harness CLI (plan 4.4, spec §7): a
// thin front over internal/eval. Subcommands: run (scripted 3-arm runner over
// the stub LLM — --live is hard-gated behind CAPYCOOK_LIVE_TEST=1 + a key and
// spends the metered budget), replay (H2 gate-dynamics report from the event
// log), rates (PREREG §7a rates over a labeled-claim file), kappa (Cohen's κ
// + confusion matrix over the double-labeled subset), and report (composes
// everything into paste-ready markdown on stdout plus a JSON document).
//
// Phase-4 rails the CLI enforces rather than merely documents: exported
// claims carry no human labels (label_r1/label_r2 empty at export); seeds
// resolve to the Gate-C-ratified eval/fixtures/seeds.json (2026-07-07),
// falling back to the archived draft only if the fixture is missing; gate
// dynamics fold run_kind=operator events only and always carry the explicit
// N + single-operator caveat.
package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ogngnaoh/capycook/internal/eval"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
)

// Default instrument and data locations, relative to the repo root (the
// make eval-* targets run from there; flags override for other layouts).
const (
	defaultScriptPath = "eval/fixtures/move_script.json"
	ratifiedSeeds     = "eval/fixtures/seeds.json"
	proposedSeeds     = "docs/archive/01-end-to-end/proposed-benchmark-seeds.json"
	defaultOutDir     = "eval/out"
)

// Methodology notes pinned as constants so markdown and JSON report the
// identical frozen wording (PREREG §5/§7a/§8; spec §4 mapping).
const (
	singleOperatorCaveat = "Single-operator telemetry: one human (the author) generated every gate " +
		"decision — descriptive autobiographical-design data with an explicit N, never a bare % " +
		"and never a quality or user-research claim (PREREG §3 H2 / §8 rule 3)."
	frozenFiveNote = "Frozen-five derivation (spec §4 mapping; the native distribution is primary): " +
		"cancel folds into reject; alternatives, take_over, blocked, and auto_advanced remain " +
		"additional labeled rows — PREREG froze only accept/edit/regenerate/reject/redirect."
	ratesNote = "PREREG §7a: three rates over the checkable denominator (labeled claims minus " +
		"opinion/non-checkable); grounded-mischaracterized counts neither for nor against — " +
		"it is its own visible bucket."
	kappaBandsNote = "κ bands (PREREG §6): > 0.6 substantial · < 0.4 ambiguous rubric — interpretation " +
		"belongs to the writeup, not this tool; at ~30–40 double-labeled claims the confidence " +
		"interval is wide."
	bannerNoLabels = "NO LABELED DATA — no labeled-claim file (--labels): every rate and κ below is " +
		"absent by design; exported claims stay UNLABELED until Tier-2 labeling (author R1 + " +
		"judge R2, PREREG §9 Amendment 1)."
	bannerUnlabeled = "UNLABELED — the claims file carries no label_r1 values yet: rates and κ await " +
		"Tier-2 labeling (author R1 + judge R2, PREREG §9 Amendment 1); the explicit zero " +
		"denominators below carry the message."
)

// errUsage marks flag/usage errors: the flag package (or the caller) has
// already written the message, so Run maps it to exit 2 without reprinting.
var errUsage = errors.New("usage error")

func main() { os.Exit(Run(os.Args[1:], os.Stdout, os.Stderr)) }

// Run is the CLI entrypoint tests drive directly (plan 4.4: package-func
// tests, never exec). It returns the process exit code: 0 ok, 1 command
// error, 2 usage error.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return 2
	}
	var err error
	switch args[0] {
	case "run":
		err = cmdRun(args[1:], stdout, stderr)
	case "replay":
		err = cmdReplay(args[1:], stdout, stderr)
	case "rates":
		err = cmdRates(args[1:], stdout, stderr)
	case "export-labels":
		err = cmdExportLabels(args[1:], stdout, stderr)
	case "import-labels":
		err = cmdImportLabels(args[1:], stdout, stderr)
	case "blind-check":
		err = cmdBlindCheck(args[1:], stdout, stderr)
	case "blind-check-score":
		err = cmdBlindCheckScore(args[1:], stdout, stderr)
	case "kappa":
		err = cmdKappa(args[1:], stdout, stderr)
	case "report":
		err = cmdReport(args[1:], stdout, stderr)
	case "help", "-h", "--help":
		usage(stdout)
		return 0
	default:
		fmt.Fprintf(stderr, "eval: unknown subcommand %q\n\n", args[0])
		usage(stderr)
		return 2
	}
	switch {
	case err == nil:
		return 0
	case errors.Is(err, errUsage):
		return 2
	default:
		msg := err.Error()
		if !strings.HasPrefix(msg, "eval: ") {
			msg = "eval: " + msg
		}
		fmt.Fprintln(stderr, msg)
		return 1
	}
}

func usage(w io.Writer) {
	fmt.Fprint(w, `usage: eval <subcommand> [flags]

  run     drive the scripted arm runner over the benchmark seeds (stub LLM;
          --live is refused without CAPYCOOK_LIVE_TEST=1 + DEEPSEEK_API_KEY)
  replay  fold the event log into the H2 gate-dynamics report
  rates   PREREG §7a provenance/mischaracterization/hallucination rates
          over a labeled-claim JSONL file
  kappa   Cohen's κ + confusion matrix over the double-labeled subset
  report  compose rates + κ + gate dynamics into markdown (stdout) + JSON

  export-labels
          filter the run subcommand's claims JSONL down to Tier-2 claims
          (label_tier1 empty) and write a labeler CSV sheet, every row
          marked for double-labeling (PREREG §9 Amendment 1: 100% coverage)
  import-labels
          validate a labeled CSV sheet against the five frozen PREREG §7a
          categories and write the labeled-claim JSONL rates/kappa consume
          (--blind rejoins a blind sheet via --map onto --claims first)

  blind-check
          draw the seeded verifier<->author blind-check sample (Tier-1-
          labeled claims, stratified per arm) and export it as a blind sheet
          with label_tier1 withheld (PREREG §9 Amendment 1 verifier
          validation)
  blind-check-score
          score an author-filled blind-check sheet against label_tier1:
          agreement + confusion counts

Run 'eval <subcommand> -h' for flags.
`)
}

// parseFlags parses args and rejects stray positionals; the FlagSet has
// already written any message to its output.
func parseFlags(fs *flag.FlagSet, args []string) error {
	if err := fs.Parse(args); err != nil {
		return errUsage
	}
	if fs.NArg() > 0 {
		fmt.Fprintf(fs.Output(), "eval %s: unexpected arguments: %s\n", fs.Name(), strings.Join(fs.Args(), " "))
		return errUsage
	}
	return nil
}

func defaultDBPath() string {
	if v := os.Getenv("DB_PATH"); v != "" {
		return v
	}
	return "./data/capycook.db"
}

func defaultDataDir() string {
	if v := os.Getenv("DATA_DIR"); v != "" {
		return v
	}
	return "./data"
}

// --- run ---

func cmdRun(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	fs.SetOutput(stderr)
	arm := fs.String("arm", "all", "arm to run: all|"+strings.Join(eval.Arms, "|"))
	seedsFlag := fs.String("seeds", "", "benchmark seeds JSON (default: "+ratifiedSeeds+" once ratified, else the UNRATIFIED "+proposedSeeds+")")
	scriptFlag := fs.String("script", defaultScriptPath, "versioned move-script instrument")
	db := fs.String("db", defaultDBPath(), "SQLite database harness events append to (run_kind=harness, excluded from H2)")
	dataDir := fs.String("data", defaultDataDir(), "committed data/ assets directory")
	outDir := fs.String("out", defaultOutDir, "output directory for claims_<arm>.jsonl (gitignored)")
	live := fs.Bool("live", false, "use the live DeepSeek client instead of the stub (requires CAPYCOOK_LIVE_TEST=1 and DEEPSEEK_API_KEY; spends the metered budget)")
	if err := parseFlags(fs, args); err != nil {
		return err
	}

	arms, err := resolveArms(*arm)
	if err != nil {
		return err
	}

	// The live gate runs before anything else touches disk or seeds: a
	// refusal must be unconditional (phase-4 rail: no live LLM calls).
	edge := llm.LLM(llm.Stub{})
	if *live {
		liveEdge, err := liveLLM(*db, stdout)
		if err != nil {
			return err
		}
		edge = liveEdge
	} else {
		fmt.Fprintln(stdout, "llm: stub mode (deterministic, no live calls) — --live is gated behind CAPYCOOK_LIVE_TEST=1 post-Gate-B")
	}

	seedsPath, warning := resolveSeeds(*seedsFlag, ratifiedSeeds, proposedSeeds)
	if warning != "" {
		fmt.Fprintln(stderr, warning)
	}
	seeds, err := eval.LoadSeeds(seedsPath)
	if err != nil {
		return err
	}
	script, err := eval.LoadScript(*scriptFlag)
	if err != nil {
		return err
	}

	deps, cleanup, err := buildDeps(*db, *dataDir, edge)
	if err != nil {
		return err
	}
	defer cleanup()

	fmt.Fprintf(stdout, "seeds: %d from %s\n", len(seeds), seedsPath)
	fmt.Fprintf(stdout, "script: %s (version %d, %d moves, policy %s/%s)\n",
		*scriptFlag, script.Version, len(script.Moves), script.Policy.Verb, script.Policy.OnBlocked)

	byArm, err := eval.Runner{Deps: deps, Script: script, Seeds: seeds, OutDir: *outDir}.Run(context.Background(), arms)
	if err != nil {
		return err
	}
	ran := arms
	if len(ran) == 0 {
		ran = eval.Arms
	}
	for _, a := range ran {
		claims := byArm[a]
		fmt.Fprintf(stdout, "arm %-11s %3d claims -> %s\n", a, len(claims), filepath.Join(*outDir, "claims_"+a+".jsonl"))
		// S3-exit coverage flag (PREREG §9 Amendment 1): the operator must see,
		// per arm, how many claims the Tier-1 verifier settled machine-side vs.
		// how many fell through to Tier 2 — never inferred from silence.
		tc := eval.Tier1Coverage(claims)
		fmt.Fprintf(stdout, "tier-1: %-11s %d/%d labeled (fell through to Tier 2: %d)\n",
			a, tc.Labeled, tc.Labeled+tc.FellThrough, tc.FellThrough)
	}
	fmt.Fprintln(stdout, "label_r1/label_r2 are EMPTY — author R1 and judge R2 label Tier-2 claims (PREREG §9 Amendment 1); harness events carry run_kind=harness and are excluded from H2.")
	return nil
}

// resolveArms maps --arm to the runner's arm list (nil = all three).
func resolveArms(v string) ([]string, error) {
	if v == "all" {
		return nil, nil
	}
	for _, a := range eval.Arms {
		if a == v {
			return []string{v}, nil
		}
	}
	return nil, fmt.Errorf("run: --arm must be all|%s (got %q)", strings.Join(eval.Arms, "|"), v)
}

// resolveSeeds picks the seeds file: an explicit --seeds wins; otherwise the
// ratified eval/fixtures/seeds.json is preferred once it exists (Gate C), and
// until then the run falls back to the proposed draft. Any use of the
// proposed draft — default or explicit — returns the UNRATIFIED warning.
func resolveSeeds(explicit, ratified, proposed string) (path, warning string) {
	path = explicit
	if path == "" {
		if _, err := os.Stat(ratified); err == nil {
			return ratified, ""
		}
		path = proposed
	}
	if filepath.Clean(path) == filepath.Clean(proposed) {
		warning = "WARNING: seeds at " + proposed + " are UNRATIFIED until Gate C — outputs are dry-run instrument checks, not benchmark data (" + ratified + " is preferred once it exists)."
	}
	return path, warning
}

// liveLLM is the --live gate. The budget state prints on every --live
// invocation — refused or not — so the operator always sees the spend before
// any call could happen; the refusal itself is unconditional without
// CAPYCOOK_LIVE_TEST=1 and a key (global rail: live tests only behind the
// env gate, budget hard-stop in the meter).
func liveLLM(dbPath string, stdout io.Writer) (llm.LLM, error) {
	meter, err := llm.OpenUsageMeter(dbPath+".budget.json", budgetUSD())
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(stdout, "llm budget: $%.4f spent of $%.2f cap (%s)\n", meter.Spent(), meter.Cap(), dbPath+".budget.json")
	if os.Getenv("CAPYCOOK_LIVE_TEST") != "1" {
		return nil, errors.New("refusing --live: CAPYCOOK_LIVE_TEST=1 is required (no live LLM calls outside the Gate-B rail)")
	}
	key := os.Getenv("DEEPSEEK_API_KEY")
	if key == "" {
		return nil, errors.New("refusing --live: DEEPSEEK_API_KEY is not set")
	}
	ds, err := llm.NewDeepSeek(llm.DeepSeekConfig{APIKey: key, Meter: meter})
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(stdout, "llm: LIVE mode — model %s, usage metered against the cap\n", ds.Model())
	return ds, nil
}

func budgetUSD() float64 {
	if v := os.Getenv("LLM_BUDGET_USD"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return 10
}

// buildDeps wires the same real deterministic services + grounding cmd/server
// uses (minus telemetry) over the committed data/ assets, with the given LLM
// edge, onto the SQLite store at dbPath.
func buildDeps(dbPath, dataDir string, edge llm.LLM) (orchestrator.Deps, func(), error) {
	st, err := store.Open(dbPath)
	if err != nil {
		return orchestrator.Deps{}, nil, err
	}
	cleanup := func() { st.Close() }
	fail := func(err error) (orchestrator.Deps, func(), error) {
		cleanup()
		return orchestrator.Deps{}, nil, err
	}

	nutrientsCSV := filepath.Join(dataDir, "usda", "nutrients.csv")
	portionsCSV := filepath.Join(dataDir, "usda", "portions.csv")
	allergensCSV := filepath.Join(dataDir, "foodon", "allergens.csv")
	nutrition, err := services.NewUSDANutrition(nutrientsCSV, portionsCSV)
	if err != nil {
		return fail(err)
	}
	cost, err := services.NewTableCost(filepath.Join(dataDir, "cost", "prices.csv"), portionsCSV)
	if err != nil {
		return fail(err)
	}
	allergen, err := services.NewAllergenChecker(allergensCSV)
	if err != nil {
		return fail(err)
	}
	safety, err := services.NewSafetyGate(
		filepath.Join(dataDir, "safety", "min_temps.csv"),
		filepath.Join(dataDir, "safety", "anaerobic_lexicon.csv"),
		filepath.Join(dataDir, "safety", "protein_classes.csv"),
		allergen,
	)
	if err != nil {
		return fail(err)
	}
	ground, err := grounding.NewService(
		filepath.Join(dataDir, "flavorgraph", "embeddings.csv"),
		filepath.Join(dataDir, "aliases.csv"),
		nutrientsCSV,
		allergensCSV,
	)
	if err != nil {
		return fail(err)
	}
	return orchestrator.Deps{
		Store:     st,
		Log:       eventlog.New(st),
		LLM:       edge,
		Safety:    safety,
		Nutrition: nutrition,
		Cost:      cost,
		Grounding: ground,
	}, cleanup, nil
}

// --- replay ---

func cmdReplay(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("replay", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dish := fs.String("dish", "", "restrict the fold to one dish id (default: all dishes)")
	db := fs.String("db", defaultDBPath(), "SQLite database holding the event log")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	events, err := loadEvents(context.Background(), *db, *dish)
	if err != nil {
		return err
	}
	writeGateDynamics(stdout, eval.FoldGateDynamics(events))
	return nil
}

// loadEvents replays events from the SQLite log; a missing database file is
// an explicit error — the CLI never conjures an empty log into existence.
func loadEvents(ctx context.Context, dbPath, dishID string) ([]eventlog.Event, error) {
	if _, err := os.Stat(dbPath); err != nil {
		return nil, fmt.Errorf("no event-log database at %s (run the server or pass --db)", dbPath)
	}
	st, err := store.Open(dbPath)
	if err != nil {
		return nil, err
	}
	defer st.Close()
	return eventlog.New(st).Replay(ctx, dishID)
}

// writeGateDynamics renders the H2 fold as markdown: the caveat and the
// frozen-five note always print (they qualify the methodology, not the
// data), then the native distribution per move type / roll-up / total and
// the frozen-five derivation of the totals.
func writeGateDynamics(w io.Writer, g eval.GateDynamics) {
	fmt.Fprintln(w, "## Gate dynamics — H2 (run_kind=operator only)")
	fmt.Fprintln(w)
	fmt.Fprintln(w, singleOperatorCaveat)
	fmt.Fprintln(w)
	fmt.Fprintln(w, frozenFiveNote)
	fmt.Fprintln(w)
	fmt.Fprintf(w, "N=%d gate decisions across %d sessions, single operator. move_failed=%d (parse/retry exhaustion — tracked beside the distribution, never inside N).\n",
		g.Total.N, g.Sessions, g.Total.MoveFailed)
	fmt.Fprintln(w)
	if g.Total.N == 0 && g.Total.MoveFailed == 0 {
		fmt.Fprintln(w, "No operator gate decisions in the event log (harness events are excluded from H2).")
		return
	}

	fmt.Fprintln(w, "Native distribution (primary):")
	fmt.Fprintln(w)
	header := "| category | N |"
	sep := "|---|---|"
	for _, row := range eval.VerbMapping {
		header += " " + row.Label + " |"
		sep += "---|"
	}
	header += " move_failed |"
	sep += "---|"
	fmt.Fprintln(w, header)
	fmt.Fprintln(w, sep)
	writeRow := func(name string, d *eval.Dynamics) {
		fmt.Fprintf(w, "| %s | %d |", name, d.N)
		for _, row := range eval.VerbMapping {
			fmt.Fprintf(w, " %d |", d.Counts[row.Native])
		}
		fmt.Fprintf(w, " %d |\n", d.MoveFailed)
	}
	moveTypes := make([]string, 0, len(g.ByMoveType))
	for mt := range g.ByMoveType {
		moveTypes = append(moveTypes, mt)
	}
	sort.Strings(moveTypes)
	for _, mt := range moveTypes {
		writeRow(mt, g.ByMoveType[mt])
	}
	for _, ru := range []string{eval.RollupCreative, eval.RollupDeterministic, eval.Unknown} {
		if d, ok := g.ByRollup[ru]; ok {
			writeRow(ru+" (roll-up)", d)
		}
	}
	writeRow("TOTAL", g.Total)
	fmt.Fprintln(w)

	frozen := eval.FrozenFiveRollup(g.Total.Counts)
	cols := frozenColumns(frozen)
	header = "| category |"
	sep = "|---|"
	for _, c := range cols {
		header += " " + c + " |"
		sep += "---|"
	}
	fmt.Fprintln(w, header)
	fmt.Fprintln(w, sep)
	fmt.Fprint(w, "| TOTAL (frozen five) |")
	for _, c := range cols {
		fmt.Fprintf(w, " %d |", frozen[c])
	}
	fmt.Fprintln(w)
}

// frozenColumns fixes the frozen-five table column order from the mapping
// table (frozen five first, additional labeled rows after), appending any
// out-of-table passthrough keys sorted so nothing is silently dropped.
func frozenColumns(frozen map[string]int) []string {
	var cols []string
	seen := map[string]bool{}
	for _, row := range eval.VerbMapping {
		key := row.Frozen
		if key == "" {
			key = row.Label
		}
		if !seen[key] {
			seen[key] = true
			cols = append(cols, key)
		}
	}
	var extras []string
	for key := range frozen {
		if !seen[key] {
			extras = append(extras, key)
		}
	}
	sort.Strings(extras)
	return append(cols, extras...)
}

// --- rates ---

func cmdRates(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("rates", flag.ContinueOnError)
	fs.SetOutput(stderr)
	labels := fs.String("labels", "", "labeled-claim JSONL file (required)")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	if *labels == "" {
		return errors.New("rates: --labels is required (a labeled-claim JSONL file)")
	}
	claims, err := readClaimsFile(*labels)
	if err != nil {
		return err
	}
	rates, err := eval.ComputeRates(claims)
	if err != nil {
		return err
	}
	writeRates(stdout, rates)
	return nil
}

func readClaimsFile(path string) ([]eval.Claim, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open claims: %w", err)
	}
	defer f.Close()
	return eval.ReadClaims(f)
}

func writeRates(w io.Writer, rates map[string]eval.ArmRates) {
	fmt.Fprintln(w, "## Provenance rates — PREREG §7a (per arm, checkable denominator)")
	fmt.Fprintln(w)
	fmt.Fprintln(w, ratesNote)
	fmt.Fprintln(w)
	if labeledClaims(rates) == 0 {
		fmt.Fprintln(w, "All claims are UNLABELED — rates await Tier-2 labeling (author R1 + judge R2, PREREG §9 Amendment 1).")
		fmt.Fprintln(w)
	}
	fmt.Fprint(w, eval.RatesTable(rates))
}

func labeledClaims(rates map[string]eval.ArmRates) int {
	n := 0
	for _, r := range rates {
		n += r.Total - r.Unlabeled
	}
	return n
}

// --- export-labels / import-labels (plan 4.6 labeling kit) ---

// cmdExportLabels turns the runner's claims exports into one labeler CSV
// sheet, filtering out every Tier-1-settled claim (label_tier1 non-empty) so
// the sheet carries Tier-2 claims only (schema + workflow:
// eval/fixtures/README.md). The label_r1/label_r2 columns are always empty
// — the Amendment-1 stop-line — and every row is marked for double-labeling:
// PREREG §9 Amendment 1 sets Tier-2 coverage to 100%, superseding §6's
// 15–20% sample. --blind exports a blinded sheet instead (opaque blind_id,
// no arm/claim_id columns, seeded-shuffled row order) plus the sidecar
// blind_id→claim_id map — PREREG §9 Amendment 1's R1 blinding requirement.
func cmdExportLabels(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("export-labels", flag.ContinueOnError)
	fs.SetOutput(stderr)
	claimsFlag := fs.String("claims", "", "comma-separated UNLABELED claims JSONL files (required; the run subcommand's claims_<arm>.jsonl exports)")
	out := fs.String("out", "", "labeler CSV sheet to write (default: "+filepath.Join(defaultOutDir, "labels.csv")+", or "+filepath.Join(defaultOutDir, "labels_blind.csv")+" with --blind)")
	blind := fs.Bool("blind", false, "export a blinded sheet: opaque blind_id, no arm/claim_id columns, seeded-shuffled row order (PREREG §9 Amendment 1 R1 blinding)")
	mapOut := fs.String("map", "", "blind_id→claim_id map CSV to write (--blind only; default: "+filepath.Join(defaultOutDir, "labels_blind_map.csv")+")")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	if *claimsFlag == "" {
		return errors.New("export-labels: --claims is required (comma-separated claims JSONL files)")
	}
	var claims []eval.Claim
	files := 0
	for _, p := range strings.Split(*claimsFlag, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		cs, err := readClaimsFile(p)
		if err != nil {
			return err
		}
		claims = append(claims, cs...)
		files++
	}
	rows, err := eval.BuildLabelSheet(claims)
	if err != nil {
		return err
	}

	fmt.Fprintf(stdout, "claims: %d from %d files\n", len(claims), files)
	fmt.Fprintf(stdout, "tier-2 sheet: %d claims (tier-1 already labeled: %d) — every row double-labeled (Amendment 1)\n",
		len(rows), len(claims)-len(rows))

	if *blind {
		outPath := *out
		if outPath == "" {
			outPath = filepath.Join(defaultOutDir, "labels_blind.csv")
		}
		mapPath := *mapOut
		if mapPath == "" {
			mapPath = filepath.Join(defaultOutDir, "labels_blind_map.csv")
		}
		sheet, m := eval.BuildBlindSheet(rows)
		if err := writeBlindFiles(outPath, mapPath, sheet, m); err != nil {
			return err
		}
		fmt.Fprintf(stdout, "blind sheet -> %s\n", outPath)
		fmt.Fprintf(stdout, "blind map -> %s\n", mapPath)
		fmt.Fprintln(stdout, "do not open the map until R1 labeling is done")
		return nil
	}

	outPath := *out
	if outPath == "" {
		outPath = filepath.Join(defaultOutDir, "labels.csv")
	}
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}
	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	if err := eval.WriteLabelCSV(f, rows); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}

	fmt.Fprintf(stdout, "labeler sheet -> %s\n", outPath)
	fmt.Fprintln(stdout, "label_r1/label_r2 are EMPTY — author R1 and judge R2 label Tier-2 claims (PREREG §9 Amendment 1).")
	return nil
}

// writeBlindFiles writes the blind sheet and its blind_id→claim_id map,
// creating each file's parent directory as needed.
func writeBlindFiles(sheetPath, mapPath string, sheet []eval.BlindRow, m map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(sheetPath), 0o755); err != nil {
		return err
	}
	f, err := os.Create(sheetPath)
	if err != nil {
		return err
	}
	if err := eval.WriteBlindCSV(f, sheet); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(mapPath), 0o755); err != nil {
		return err
	}
	mf, err := os.Create(mapPath)
	if err != nil {
		return err
	}
	if err := eval.WriteBlindMap(mf, m); err != nil {
		mf.Close()
		return err
	}
	return mf.Close()
}

// readBlindMap parses the blind_id,claim_id sidecar WriteBlindMap writes.
func readBlindMap(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open blind map: %w", err)
	}
	defer f.Close()
	cr := csv.NewReader(f)
	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("blind map: read header: %w", err)
	}
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\ufeff")
	}
	if len(header) != 2 || header[0] != "blind_id" || header[1] != "claim_id" {
		return nil, fmt.Errorf("blind map: header %q does not match the pinned blind_id,claim_id schema", strings.Join(header, ","))
	}
	m := map[string]string{}
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("blind map: %w", err)
		}
		if rec[0] == "" {
			return nil, errors.New("blind map: empty blind_id")
		}
		m[rec[0]] = rec[1]
	}
	if len(m) == 0 {
		return nil, errors.New("blind map: no rows")
	}
	return m, nil
}

// cmdImportLabels validates a labeled sheet (frozen §7a categories only;
// label_r2 only inside the marked subset) and writes the labeled-claim JSONL
// that rates/kappa/report consume. Rejection writes nothing. --blind treats
// --csv as a blind sheet (opaque blind_id) and rejoins it via --map onto
// --claims before writing — PREREG §9 Amendment 1's R1 blinding.
func cmdImportLabels(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("import-labels", flag.ContinueOnError)
	fs.SetOutput(stderr)
	csvFlag := fs.String("csv", "", "labeled CSV sheet (required; a blind sheet with --blind)")
	out := fs.String("out", filepath.Join(defaultOutDir, "claims_labeled.jsonl"), "labeled-claim JSONL to write")
	blind := fs.Bool("blind", false, "--csv is a blind sheet: rejoin via --map onto --claims (PREREG §9 Amendment 1 R1 blinding)")
	mapFlag := fs.String("map", "", "blind_id→claim_id map CSV (required with --blind)")
	claimsFlag := fs.String("claims", "", "comma-separated claims JSONL files to rejoin blind labels onto (required with --blind)")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	if *csvFlag == "" {
		return errors.New("import-labels: --csv is required (the labeled sheet)")
	}

	var claims []eval.Claim
	if *blind {
		if *mapFlag == "" {
			return errors.New("import-labels --blind: --map is required (the blind_id→claim_id map CSV)")
		}
		if *claimsFlag == "" {
			return errors.New("import-labels --blind: --claims is required (comma-separated claims JSONL files to rejoin blind labels onto)")
		}
		f, err := os.Open(*csvFlag)
		if err != nil {
			return fmt.Errorf("open blind sheet: %w", err)
		}
		rows, err := eval.ReadBlindCSV(f)
		f.Close()
		if err != nil {
			return err
		}
		m, err := readBlindMap(*mapFlag)
		if err != nil {
			return err
		}
		var base []eval.Claim
		for _, p := range strings.Split(*claimsFlag, ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			cs, err := readClaimsFile(p)
			if err != nil {
				return err
			}
			base = append(base, cs...)
		}
		claims, err = eval.RejoinBlind(rows, m, base)
		if err != nil {
			return err
		}
	} else {
		f, err := os.Open(*csvFlag)
		if err != nil {
			return fmt.Errorf("open label sheet: %w", err)
		}
		cs, err := eval.ReadLabelCSV(f)
		f.Close()
		if err != nil {
			return err
		}
		claims = cs
	}

	if err := eval.WriteClaims(*out, claims); err != nil {
		return err
	}
	labeled, double, unlabeled := 0, 0, 0
	for _, c := range claims {
		if c.LabelR1 != "" {
			labeled++
		}
		if c.LabelR1 != "" && c.LabelR2 != "" {
			double++
		}
		if c.LabelR1 == "" && c.LabelR2 == "" {
			unlabeled++
		}
	}
	fmt.Fprintf(stdout, "claims: %d imported (%d labeled by R1, %d double-labeled, %d still unlabeled)\n",
		len(claims), labeled, double, unlabeled)
	fmt.Fprintf(stdout, "labeled claims -> %s\n", *out)
	fmt.Fprintf(stdout, "next: eval rates --labels=%s · eval kappa --labels=%s\n", *out, *out)
	return nil
}

// --- blind-check / blind-check-score (PREREG §9 Amendment 1 verifier
// validation: the author blind-labels a seeded sample of Tier-1-labeled
// claims; agreement with label_tier1 is the control on Tier-1's residual
// risk) ---

// cmdBlindCheck draws the seeded blind-check sample from a Tier-1-labeled
// claims file and exports it as a blind sheet (label_tier1 withheld, same
// opaque-id/no-arm shape as the R1 blind sheet) plus its blind_id→claim_id
// map.
func cmdBlindCheck(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("blind-check", flag.ContinueOnError)
	fs.SetOutput(stderr)
	claimsFlag := fs.String("claims", "", "Tier-1-labeled claims JSONL (required; label_tier1 non-empty rows are sampled)")
	out := fs.String("out", filepath.Join(defaultOutDir, "blind_check.csv"), "blind-check sheet CSV to write (label_tier1 withheld)")
	mapOut := fs.String("map", "", "blind_id→claim_id map CSV to write (default: derived from --out)")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	if *claimsFlag == "" {
		return errors.New("blind-check: --claims is required (a Tier-1-labeled claims JSONL file)")
	}
	claims, err := readClaimsFile(*claimsFlag)
	if err != nil {
		return err
	}
	sample := eval.BuildBlindCheckSample(claims)
	if len(sample) == 0 {
		return errors.New("blind-check: no Tier-1-labeled claims found (label_tier1 empty for every claim)")
	}
	rows := make([]eval.LabelRow, len(sample))
	for i, c := range sample {
		rows[i] = eval.LabelRow{Claim: c}
	}
	sheet, m := eval.BuildBlindSheet(rows)

	mapPath := *mapOut
	if mapPath == "" {
		mapPath = derivedMapPath(*out)
	}
	if err := writeBlindFiles(*out, mapPath, sheet, m); err != nil {
		return err
	}

	byArm := map[string]int{}
	for _, c := range sample {
		byArm[c.Arm]++
	}
	arms := make([]string, 0, len(byArm))
	for a := range byArm {
		arms = append(arms, a)
	}
	sort.Strings(arms)
	fmt.Fprintf(stdout, "blind-check sample: %d of %d Tier-1-labeled claims\n", len(sample), tier1LabeledCount(claims))
	for _, a := range arms {
		fmt.Fprintf(stdout, "  %-11s %d\n", a, byArm[a])
	}
	fmt.Fprintf(stdout, "blind-check sheet -> %s\n", *out)
	fmt.Fprintf(stdout, "blind-check map -> %s\n", mapPath)
	fmt.Fprintln(stdout, "label_tier1 is withheld — do not open the map until the author's blind pass is done")
	return nil
}

// derivedMapPath appends _map before a blind sheet path's extension
// (labels_blind.csv -> labels_blind_map.csv), the same convention
// export-labels' default --map uses.
func derivedMapPath(out string) string {
	ext := filepath.Ext(out)
	return strings.TrimSuffix(out, ext) + "_map" + ext
}

func tier1LabeledCount(claims []eval.Claim) int {
	n := 0
	for _, c := range claims {
		if c.LabelTier1 != "" {
			n++
		}
	}
	return n
}

// cmdBlindCheckScore rejoins an author-filled blind-check sheet back onto
// the same Tier-1-labeled claims file the sample was drawn from (recomputing
// the deterministic sample), then reports verifier↔author agreement and the
// confusion counts.
func cmdBlindCheckScore(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("blind-check-score", flag.ContinueOnError)
	fs.SetOutput(stderr)
	csvFlag := fs.String("csv", "", "author-filled blind-check sheet CSV (required)")
	mapFlag := fs.String("map", "", "blind_id→claim_id map CSV (required)")
	claimsFlag := fs.String("claims", "", "the same Tier-1-labeled claims JSONL blind-check sampled from (required)")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	if *csvFlag == "" {
		return errors.New("blind-check-score: --csv is required (the author-filled blind-check sheet)")
	}
	if *mapFlag == "" {
		return errors.New("blind-check-score: --map is required (the blind_id→claim_id map)")
	}
	if *claimsFlag == "" {
		return errors.New("blind-check-score: --claims is required (the Tier-1-labeled claims JSONL)")
	}

	f, err := os.Open(*csvFlag)
	if err != nil {
		return fmt.Errorf("open blind-check sheet: %w", err)
	}
	rows, err := eval.ReadBlindCSV(f)
	f.Close()
	if err != nil {
		return err
	}
	m, err := readBlindMap(*mapFlag)
	if err != nil {
		return err
	}
	claims, err := readClaimsFile(*claimsFlag)
	if err != nil {
		return err
	}
	sample := eval.BuildBlindCheckSample(claims)
	if len(sample) == 0 {
		return errors.New("blind-check-score: no Tier-1-labeled claims found (label_tier1 empty for every claim)")
	}
	authored, err := eval.RejoinBlind(rows, m, claims)
	if err != nil {
		return err
	}
	agree, total, confusion := eval.ScoreBlindCheck(sample, authored)
	if total == 0 {
		return errors.New("blind-check-score: no scored claims (no authored label_r1 matched a sampled claim)")
	}
	fmt.Fprintf(stdout, "verifier↔author agreement: %d/%d (%.0f%%)\n", agree, total, float64(agree)/float64(total)*100)
	keys := make([][2]string, 0, len(confusion))
	for k := range confusion {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i][0] != keys[j][0] {
			return keys[i][0] < keys[j][0]
		}
		return keys[i][1] < keys[j][1]
	})
	for _, k := range keys {
		fmt.Fprintf(stdout, "  %s -> %s: %d\n", k[0], k[1], confusion[k])
	}
	return nil
}

// --- kappa ---

func cmdKappa(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("kappa", flag.ContinueOnError)
	fs.SetOutput(stderr)
	labels := fs.String("labels", "", "labeled-claim JSONL file (required)")
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	if *labels == "" {
		return errors.New("kappa: --labels is required (a labeled-claim JSONL file)")
	}
	claims, err := readClaimsFile(*labels)
	if err != nil {
		return err
	}
	res, err := eval.ComputeKappa(claims)
	if err != nil {
		return err
	}
	writeKappa(stdout, res)
	return nil
}

func writeKappa(w io.Writer, res eval.KappaResult) {
	fmt.Fprintln(w, "## Inter-rater reliability — Cohen's κ (PREREG §6/§7)")
	fmt.Fprintln(w)
	fmt.Fprintf(w, "N=%d double-labeled claims (both label_r1 and label_r2 set).\n", res.N)
	fmt.Fprintf(w, "p_o=%.3f observed agreement · p_e=%.3f chance agreement · κ=%.3f\n", res.Observed, res.Expected, res.Kappa)
	fmt.Fprintln(w)
	fmt.Fprintln(w, kappaBandsNote)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Confusion matrix (rows = label_r1, cols = label_r2):")
	fmt.Fprintln(w)
	header := "| label_r1 \\ label_r2 |"
	sep := "|---|"
	for _, c := range eval.KappaCategories {
		header += " " + c + " |"
		sep += "---|"
	}
	fmt.Fprintln(w, header)
	fmt.Fprintln(w, sep)
	for i, c := range eval.KappaCategories {
		fmt.Fprintf(w, "| %s |", c)
		for j := range eval.KappaCategories {
			fmt.Fprintf(w, " %d |", res.Matrix[i][j])
		}
		fmt.Fprintln(w)
	}
}

// --- report ---

// reportData is everything the composed report renders, in both markdown and
// JSON. nil sections mean "no data" — surfaced via banner/notes, never
// invented.
type reportData struct {
	banner       string
	rates        map[string]eval.ArmRates // nil => no labels file given
	labelsNote   string
	kappa        *eval.KappaResult
	kappaNote    string
	dynamics     *eval.GateDynamics
	dynamicsNote string
}

func cmdReport(args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	fs.SetOutput(stderr)
	labels := fs.String("labels", "", "labeled-claim JSONL file (optional; absent => UNLABELED/no-data banner)")
	db := fs.String("db", defaultDBPath(), "SQLite database holding the event log")
	jsonOut := fs.String("json", filepath.Join(defaultOutDir, "report.json"), `path for the composed JSON report ("-" for stdout, "" to skip)`)
	if err := parseFlags(fs, args); err != nil {
		return err
	}
	d, err := composeReport(context.Background(), *labels, *db)
	if err != nil {
		return err
	}
	writeReportMarkdown(stdout, d)
	if *jsonOut == "" {
		return nil
	}
	raw, err := json.MarshalIndent(reportToJSON(d), "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	if *jsonOut == "-" {
		_, err := stdout.Write(raw)
		return err
	}
	if err := os.MkdirAll(filepath.Dir(*jsonOut), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(*jsonOut, raw, 0o644); err != nil {
		return err
	}
	fmt.Fprintf(stderr, "json report -> %s\n", *jsonOut)
	return nil
}

func composeReport(ctx context.Context, labelsPath, dbPath string) (reportData, error) {
	var d reportData
	if labelsPath == "" {
		d.banner = bannerNoLabels
		d.labelsNote = "no labeled-claim file provided (--labels)"
		d.kappaNote = "no labeled-claim file — κ not computed"
	} else {
		claims, err := readClaimsFile(labelsPath)
		if err != nil {
			return reportData{}, err
		}
		rates, err := eval.ComputeRates(claims)
		if err != nil {
			return reportData{}, err
		}
		d.rates = rates
		if labeledClaims(rates) == 0 {
			d.banner = bannerUnlabeled
		}
		if doubleLabeled(claims) == 0 {
			d.kappaNote = "no double-labeled subset — κ is not measurable (an empty subset is never reported as κ=0)"
		} else {
			res, err := eval.ComputeKappa(claims)
			if err != nil {
				return reportData{}, err
			}
			d.kappa = &res
		}
	}
	if _, err := os.Stat(dbPath); err != nil {
		d.dynamicsNote = fmt.Sprintf("no event-log database at %s — no operator telemetry to fold", dbPath)
	} else {
		events, err := loadEvents(ctx, dbPath, "")
		if err != nil {
			return reportData{}, err
		}
		g := eval.FoldGateDynamics(events)
		d.dynamics = &g
	}
	return d, nil
}

func doubleLabeled(claims []eval.Claim) int {
	n := 0
	for _, c := range claims {
		if c.LabelR1 != "" && c.LabelR2 != "" {
			n++
		}
	}
	return n
}

func writeReportMarkdown(w io.Writer, d reportData) {
	fmt.Fprintln(w, "# CapyCook eval report")
	fmt.Fprintln(w)
	if d.banner != "" {
		fmt.Fprintf(w, "> **%s**\n\n", d.banner)
	}
	if d.rates != nil {
		writeRates(w, d.rates)
	} else {
		fmt.Fprintln(w, "## Provenance rates — PREREG §7a (per arm, checkable denominator)")
		fmt.Fprintln(w)
		fmt.Fprintln(w, d.labelsNote)
	}
	fmt.Fprintln(w)
	if d.kappa != nil {
		writeKappa(w, *d.kappa)
	} else {
		fmt.Fprintln(w, "## Inter-rater reliability — Cohen's κ (PREREG §6/§7)")
		fmt.Fprintln(w)
		fmt.Fprintln(w, d.kappaNote)
	}
	fmt.Fprintln(w)
	if d.dynamics != nil {
		writeGateDynamics(w, *d.dynamics)
	} else {
		fmt.Fprintln(w, "## Gate dynamics — H2 (run_kind=operator only)")
		fmt.Fprintln(w)
		fmt.Fprintln(w, singleOperatorCaveat)
		fmt.Fprintln(w)
		fmt.Fprintln(w, frozenFiveNote)
		fmt.Fprintln(w)
		fmt.Fprintln(w, d.dynamicsNote)
	}
}

// JSON mirror types: the eval package's result structs carry no json tags,
// so the report pins its own stable wire shape with explicit Ns throughout.
type reportJSON struct {
	GeneratedAt          string         `json:"generated_at"`
	Banner               string         `json:"banner,omitempty"`
	RatesNote            string         `json:"rates_note"`
	SingleOperatorCaveat string         `json:"single_operator_caveat"`
	FrozenFiveNote       string         `json:"frozen_five_note"`
	Rates                []armRatesJSON `json:"rates"`
	Kappa                *kappaJSON     `json:"kappa"`
	KappaNote            string         `json:"kappa_note,omitempty"`
	GateDynamics         *dynamicsJSON  `json:"gate_dynamics"`
	GateDynamicsNote     string         `json:"gate_dynamics_note,omitempty"`
}

type armRatesJSON struct {
	Arm                 string         `json:"arm"`
	Total               int            `json:"total"`
	Unlabeled           int            `json:"unlabeled"`
	Excluded            int            `json:"excluded"`
	Checkable           int            `json:"checkable"`
	Counts              map[string]int `json:"counts"`
	Provenance          float64        `json:"provenance"`
	Mischaracterization float64        `json:"mischaracterization"`
	Hallucination       float64        `json:"hallucination"`
}

type kappaJSON struct {
	N          int       `json:"n"`
	Observed   float64   `json:"observed"`
	Expected   float64   `json:"expected"`
	Kappa      float64   `json:"kappa"`
	Categories [5]string `json:"categories"`
	Matrix     [5][5]int `json:"matrix"`
}

type categoryJSON struct {
	Counts     map[string]int `json:"counts"`
	N          int            `json:"n"`
	MoveFailed int            `json:"move_failed"`
}

type dynamicsJSON struct {
	N          int                     `json:"n"`
	Sessions   int                     `json:"sessions"`
	ByMoveType map[string]categoryJSON `json:"by_move_type"`
	ByRollup   map[string]categoryJSON `json:"by_rollup"`
	Total      categoryJSON            `json:"total"`
	FrozenFive map[string]int          `json:"frozen_five"`
}

func reportToJSON(d reportData) reportJSON {
	rep := reportJSON{
		GeneratedAt:          time.Now().UTC().Format(time.RFC3339),
		Banner:               d.banner,
		RatesNote:            ratesNote,
		SingleOperatorCaveat: singleOperatorCaveat,
		FrozenFiveNote:       frozenFiveNote,
		KappaNote:            d.kappaNote,
		GateDynamicsNote:     d.dynamicsNote,
	}
	arms := make([]string, 0, len(d.rates))
	for arm := range d.rates {
		arms = append(arms, arm)
	}
	sort.Strings(arms)
	for _, arm := range arms {
		r := d.rates[arm]
		rep.Rates = append(rep.Rates, armRatesJSON{
			Arm: r.Arm, Total: r.Total, Unlabeled: r.Unlabeled,
			Excluded: r.Excluded, Checkable: r.Checkable, Counts: r.Counts,
			Provenance: r.Provenance, Mischaracterization: r.Mischaracterization,
			Hallucination: r.Hallucination,
		})
	}
	if d.kappa != nil {
		rep.Kappa = &kappaJSON{
			N: d.kappa.N, Observed: d.kappa.Observed, Expected: d.kappa.Expected,
			Kappa: d.kappa.Kappa, Categories: eval.KappaCategories, Matrix: d.kappa.Matrix,
		}
	}
	if d.dynamics != nil {
		g := d.dynamics
		toCat := func(dy *eval.Dynamics) categoryJSON {
			return categoryJSON{Counts: dy.Counts, N: dy.N, MoveFailed: dy.MoveFailed}
		}
		dyn := dynamicsJSON{
			N:          g.Total.N,
			Sessions:   g.Sessions,
			ByMoveType: map[string]categoryJSON{},
			ByRollup:   map[string]categoryJSON{},
			Total:      toCat(g.Total),
			FrozenFive: eval.FrozenFiveRollup(g.Total.Counts),
		}
		for mt, dy := range g.ByMoveType {
			dyn.ByMoveType[mt] = toCat(dy)
		}
		for ru, dy := range g.ByRollup {
			dyn.ByRollup[ru] = toCat(dy)
		}
		rep.GateDynamics = &dyn
	}
	return rep
}

#!/usr/bin/env bash
# e2e_check.sh — Phase-1 oracle (end-to-end build plan task 1.11).
#
# Drives the skeleton acceptance loop (skeleton spec §6) via curl against
# BOTH a locally-built binary (DB_PATH in a temp dir) and the docker
# container (named volume mounted at /data):
#
#   create dish (constraints incl. an allergen)
#     -> move (normal steer): SSE tokens stream, proposal-ready
#     -> gate accept: version 1 (the seed version)
#     -> move (steer contains "garlic oil"): proposal-blocked, NO tokens
#     -> gate redirect (safe steer) off the block -> proposal-ready
#     -> gate accept: version 2
#     -> versions chain length 2, dish shows the updated draft
#     -> restart (same DB / same volume): dish + versions survive.
#
# Ordering note: the state machine forbids a new move while a proposal is
# awaiting the gate (409) and while blocked (409, regenerate/redirect only),
# and dish creation stores no version — so the seed_expand proposal is
# accepted BEFORE the seeded-unsafe move, and the block is cleared with a
# redirect before the final accept. That is the only order in which every
# §6 assertion (incl. "versions length 2 = seed version + accepted") holds.
#
# Usage: scripts/e2e_check.sh [local|docker|all]   (default: all)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-all}"

LOCAL_PORT="${E2E_LOCAL_PORT:-18080}"
DOCKER_PORT="${E2E_DOCKER_PORT:-18081}"
CONTAINER="capycook-e2e"
VOLUME="capycook-e2e-data"
SESSION="e2e-check-$$-$(date +%s)"

# Set by the flows; read by cleanup and the persistence re-check.
STREAM_PID=""
SERVER_PID=""
DOCKER_UP=""
WORK=""
DISH_ID=""
V1=""
V2=""
RESP=""

# --- plumbing ---------------------------------------------------------------

banner() { printf '\n=====================================================\n== %s\n=====================================================\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

cleanup() {
    code=$?
    if [ -n "$STREAM_PID" ]; then kill "$STREAM_PID" 2>/dev/null || true; fi
    if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
    if [ -n "$DOCKER_UP" ]; then
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
        docker volume rm "$VOLUME" >/dev/null 2>&1 || true
    fi
    if [ "$code" -eq 0 ]; then
        if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
    else
        echo "E2E CHECK FAILED (exit $code)" >&2
        if [ -n "$WORK" ]; then echo "work dir kept for debugging: $WORK" >&2; fi
    fi
}
trap cleanup EXIT

# req <expected-status> <method> <url> [json-body] — curl once, assert the
# status, leave the body in $RESP.
req() {
    expect="$1" method="$2" url="$3" body="${4:-}"
    if [ -n "$body" ]; then
        out=$(curl -sS -X "$method" -H 'Content-Type: application/json' \
            -H "X-Session-Id: $SESSION" -d "$body" -w $'\n%{http_code}' "$url")
    else
        out=$(curl -sS -X "$method" -H "X-Session-Id: $SESSION" \
            -w $'\n%{http_code}' "$url")
    fi
    status="${out##*$'\n'}"
    RESP="${out%$'\n'*}"
    if [ "$status" != "$expect" ]; then
        echo "$RESP" >&2
        fail "$method $url returned $status, expected $expect"
    fi
}

jqr() { echo "$RESP" | jq -r "$1"; }

assert_eq() { # assert_eq <got> <want> <what>
    if [ "$1" != "$2" ]; then fail "$3: got '$1', expected '$2'"; fi
}

assert_set() { # assert_set <value> <what>
    if [ -z "$1" ] || [ "$1" = "null" ]; then fail "$2 is missing"; fi
}

# sse_data <file> <event-name> — print the data payload of every captured
# SSE frame with that event name.
sse_data() {
    awk -v ev="$2" '
        /^event: / { cur = substr($0, 8); next }
        /^data: /  { if (cur == ev) print substr($0, 7); next }
        /^$/       { cur = "" }
    ' "$1"
}

wait_healthz() { # wait_healthz <base> <what>
    for _ in $(seq 1 150); do
        if curl -fsS -o /dev/null "$1/healthz" 2>/dev/null; then return 0; fi
        sleep 0.2
    done
    fail "$2 at $1 never became healthy"
}

wait_file() { # wait_file <file> <substring> <what>
    for _ in $(seq 1 150); do
        if grep -qF "$2" "$1" 2>/dev/null; then return 0; fi
        sleep 0.2
    done
    fail "timed out waiting for $3 (no '$2' in $1)"
}

wait_sse() { # wait_sse <file> <event-name> <substring> <what>
    for _ in $(seq 1 150); do
        if sse_data "$1" "$2" | grep -qF "$3"; then return 0; fi
        sleep 0.2
    done
    echo "--- captured stream ---" >&2
    cat "$1" >&2 || true
    fail "timed out waiting for SSE '$2' carrying '$3' ($4)"
}

# --- the acceptance loop (shared by both modes) ------------------------------

drive_loop() { # drive_loop <base-url> <stream-capture-file>
    base="$1" stream="$2"

    step "create dish: seed + constraints (incl. peanuts allergen)"
    req 201 POST "$base/api/dishes" '{
        "seed": "charred carrot salad with herb yogurt",
        "constraints": {
            "dietary": [], "allergens": ["peanuts"], "equipment": ["oven"],
            "skill": "intermediate", "servings": 2, "on_hand": [],
            "cuisine": "western"
        }
    }'
    DISH_ID=$(jqr .id)
    assert_set "$DISH_ID" "dish id"
    assert_eq "$(jqr '.draft.constraints.allergens[0]')" "peanuts" "stored allergen"
    echo "    dish: $DISH_ID"

    step "open SSE stream (curl -N, captured in background)"
    curl -sN "$base/api/dishes/$DISH_ID/stream" >"$stream" &
    STREAM_PID=$!
    wait_file "$stream" "connected" "SSE greeting"

    step "move 1: seed_expand with a normal steer -> 202"
    req 202 POST "$base/api/dishes/$DISH_ID/move" \
        '{"moveType": "seed_expand", "steer": "keep it bright and fresh"}'
    move1=$(jqr .moveId)
    assert_set "$move1" "move 1 id"
    echo "    move: $move1"

    step "stream carries token events then proposal-ready for move 1"
    wait_sse "$stream" proposal-ready "$move1" "move 1 proposal"
    tokens1=$(sse_data "$stream" token | grep -cF "$move1" || true)
    if [ "$tokens1" -lt 1 ]; then fail "no streamed token events for move 1"; fi
    echo "    token events: $tokens1, proposal-ready: yes"

    step "gate accept the seed_expand proposal -> version 1 (seed version)"
    req 200 GET "$base/api/dishes/$DISH_ID"
    assert_eq "$(jqr .state)" awaiting_gate "state after proposal-ready"
    prop1=$(jqr .pendingProposal.id)
    assert_set "$prop1" "pending proposal id"
    assert_eq "$(jqr .pendingProposal.move_id)" "$move1" "pending proposal's move"
    req 200 POST "$base/api/dishes/$DISH_ID/gate" \
        "{\"proposalId\": \"$prop1\", \"verb\": \"accept\"}"
    V1=$(jqr .newVersionId)
    assert_set "$V1" "accept newVersionId"
    echo "    version: $V1"

    step "move 2: steer contains 'garlic oil' -> proposal-blocked, NO tokens"
    req 202 POST "$base/api/dishes/$DISH_ID/move" \
        '{"moveType": "iterate_feedback", "steer": "finish with a garlic oil drizzle"}'
    move2=$(jqr .moveId)
    assert_set "$move2" "move 2 id"
    echo "    move: $move2"
    wait_sse "$stream" proposal-blocked "$move2" "seeded unsafe steer"
    blocked=$(sse_data "$stream" proposal-blocked | grep -F "$move2")
    assert_eq "$(echo "$blocked" | jq -r .ruleId)" anaerobic-garlic-oil "blocked rule id"
    tokens2=$(sse_data "$stream" token | grep -cF "$move2" || true)
    assert_eq "$tokens2" 0 "token events for the blocked move"
    echo "    proposal-blocked (anaerobic-garlic-oil), token events: 0"

    step "gate redirect off the block with a safe steer -> new move"
    req 200 POST "$base/api/dishes/$DISH_ID/gate" \
        "{\"proposalId\": \"$move2\", \"verb\": \"redirect\", \"edit\": {\"steer\": \"use lemon zest instead\"}}"
    move3=$(jqr .newMoveId)
    assert_set "$move3" "redirect newMoveId"
    echo "    move: $move3"
    wait_sse "$stream" proposal-ready "$move3" "redirected move proposal"

    step "gate accept the safe proposal -> version 2"
    req 200 GET "$base/api/dishes/$DISH_ID"
    prop2=$(jqr .pendingProposal.id)
    assert_set "$prop2" "pending proposal id"
    assert_eq "$(jqr .pendingProposal.move_id)" "$move3" "pending proposal's move"
    req 200 POST "$base/api/dishes/$DISH_ID/gate" \
        "{\"proposalId\": \"$prop2\", \"verb\": \"accept\"}"
    V2=$(jqr .newVersionId)
    assert_set "$V2" "accept newVersionId"
    echo "    version: $V2"

    step "versions chain has length 2; dish shows the updated draft"
    verify_state "$base"

    kill "$STREAM_PID" 2>/dev/null || true
    wait "$STREAM_PID" 2>/dev/null || true
    STREAM_PID=""
}

# verify_state <base-url> — the post-accept (and post-restart) invariants
# for $DISH_ID: two chained versions, current pointer on V2, non-empty draft.
verify_state() {
    base="$1"

    req 200 GET "$base/api/dishes/$DISH_ID/versions"
    assert_eq "$(jqr '.versions | length')" 2 "version count"
    assert_eq "$(jqr .currentVersionId)" "$V2" "versions currentVersionId"
    assert_eq "$(jqr ".versions[] | select(.id == \"$V2\") | .parentVersionId")" \
        "$V1" "version 2 parent"

    req 200 GET "$base/api/dishes/$DISH_ID"
    assert_eq "$(jqr .currentVersionId)" "$V2" "dish currentVersionId"
    assert_eq "$(jqr .state)" idle "dish state"
    title=$(jqr .draft.title)
    assert_set "$title" "draft title"
    echo "    versions: 2 (chain $V1 -> $V2); draft: \"$title\""
}

# --- modes -------------------------------------------------------------------

run_local() {
    banner "LOCAL MODE: built binary, DB_PATH in a temp dir"
    base="http://127.0.0.1:$LOCAL_PORT"
    WORK=$(mktemp -d "${TMPDIR:-/tmp}/capycook-e2e.XXXXXX")
    db="$WORK/capycook.db"

    step "make build"
    make -C "$ROOT" build

    step "start server (DB_PATH=$db, PORT=$LOCAL_PORT, DATA_DIR=$ROOT/data)"
    DB_PATH="$db" PORT="$LOCAL_PORT" DATA_DIR="$ROOT/data" "$ROOT/bin/capycook" >"$WORK/server-1.log" 2>&1 &
    SERVER_PID=$!
    wait_healthz "$base" "local server"

    drive_loop "$base" "$WORK/stream.sse"

    step "restart server on the same DB_PATH"
    kill "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
    DB_PATH="$db" PORT="$LOCAL_PORT" DATA_DIR="$ROOT/data" "$ROOT/bin/capycook" >"$WORK/server-2.log" 2>&1 &
    SERVER_PID=$!
    wait_healthz "$base" "restarted local server"

    step "dish + versions survive the restart"
    verify_state "$base"

    kill "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
    rm -rf "$WORK"
    WORK=""
    printf '\nLOCAL MODE: PASS\n'
}

run_docker() {
    banner "DOCKER MODE: container, named volume mounted at /data"
    base="http://127.0.0.1:$DOCKER_PORT"
    WORK=$(mktemp -d "${TMPDIR:-/tmp}/capycook-e2e.XXXXXX")

    step "docker build -t capycook:dev ."
    docker build -t capycook:dev "$ROOT"

    step "start container (fresh volume $VOLUME -> /data, port $DOCKER_PORT)"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME" >/dev/null 2>&1 || true
    docker volume create "$VOLUME" >/dev/null
    DOCKER_UP=1
    docker run -d --name "$CONTAINER" -p "127.0.0.1:$DOCKER_PORT:8080" \
        -v "$VOLUME:/data" capycook:dev >/dev/null
    wait_healthz "$base" "container"

    drive_loop "$base" "$WORK/stream.sse"

    # A fresh container on the same volume, not docker stop+start: stop+start
    # keeps the old container's writable layer, so it would "pass" even if the
    # DB never landed on the volume (e.g. a relative DB_PATH under the image's
    # /home/nonroot workdir). Removing the container first proves the data
    # survives via /data alone.
    step "restart: remove the container, start a fresh one on the same volume"
    docker rm -f "$CONTAINER" >/dev/null
    docker run -d --name "$CONTAINER" -p "127.0.0.1:$DOCKER_PORT:8080" \
        -v "$VOLUME:/data" capycook:dev >/dev/null
    wait_healthz "$base" "restarted container"

    step "dish + versions survive the restart"
    verify_state "$base"

    docker rm -f "$CONTAINER" >/dev/null
    docker volume rm "$VOLUME" >/dev/null
    DOCKER_UP=""
    rm -rf "$WORK"
    WORK=""
    printf '\nDOCKER MODE: PASS\n'
}

# --- main --------------------------------------------------------------------

command -v jq >/dev/null || fail "jq is required"
command -v curl >/dev/null || fail "curl is required"

case "$MODE" in
local)
    run_local
    ;;
docker)
    command -v docker >/dev/null || fail "docker is required for docker mode"
    run_docker
    ;;
all)
    command -v docker >/dev/null || fail "docker is required for mode 'all'"
    run_local
    run_docker
    ;;
*)
    fail "unknown mode '$MODE' (expected local|docker|all)"
    ;;
esac

printf '\nE2E CHECK: PASS (%s)\n' "$MODE"

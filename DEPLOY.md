# Deploying CapyCook

The fork kit: one `docker compose up` gives you the full workbench — proposals,
the deterministic safety gate, versioning, and SQLite persistence — with **no
API key and no external calls**. Live model access and self-hosted tracing are
strictly opt-in. For the non-Docker path (build the binary yourself), see the
[Quickstart in the README](README.md#quickstart-fork--run).

## TL;DR

```sh
git clone https://github.com/ogngnaoh/capycook.git
cd capycook
cp .env.example .env        # every value optional — keyless runs in stub mode
docker compose up           # builds the image, serves the workbench on :8080
```

Open <http://localhost:8080>. The header shows a **"stub mode — no model key"**
banner: the model edge is a deterministic stub, but the entire human-gated loop
is real. This is the exact mode every demo GIF in the README was captured in.

Stop with `Ctrl-C`; `docker compose down` removes the container (your data
survives in the volume — see [Persisting your data](#persisting-your-data)).

## What `docker compose up` starts

Just one service: **`app`**. It builds from the [`Dockerfile`](Dockerfile) (a
Vite build of the SPA, then a static `CGO_ENABLED=0` Go binary that embeds it)
and runs on a distroless nonroot base.

- **Port** — the container always listens on `8080` internally; compose maps it
  to host `8080`. Reach it on a different host port without editing anything
  tracked:
  ```sh
  CAPYCOOK_HOST_PORT=8085 docker compose up
  ```
- **Data** — a named volume `capycook-data` is mounted at `/data`, holding the
  SQLite database (`/data/capycook.db` + its WAL) and the LLM budget-ledger
  sidecar (`/data/capycook.db.budget.json`).
- **Vendored data assets** — the USDA / FoodOn / FlavorGraph / cost / safety
  CSVs are baked into the image read-only at `/srv/data` (`DATA_DIR`), *outside*
  the `/data` volume so a mount never shadows them.

Nothing else runs. The Langfuse services in `docker-compose.yml` sit behind
`profiles: [langfuse]` and never start unless you ask for them.

## Configuration (`.env`)

`cp .env.example .env` and leave it untouched for stub mode. Every documented
key is optional; missing secrets warn at startup but are non-fatal.

| Variable | Purpose | Default |
|---|---|---|
| `DEEPSEEK_API_KEY` | Unset ⇒ deterministic stub LLM. Set ⇒ live DeepSeek. | *(unset → stub)* |
| `LLM_BUDGET_USD` | Hard spend cap; generation stops and reports at the cap. | `10` |
| `CAPYCOOK_STUB_LLM` | Set to `1` to force the stub even with a key set. | *(unset)* |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | OTel trace export. No-op unless **all three** are set. | *(unset → tracing off)* |
| `CAPYCOOK_HOST_PORT` | Host port the app is published on (compose-only). | `8080` |

> **Container-path note.** `.env.example` ships `DB_PATH=./data/capycook.db` and
> `DATA_DIR=./data` for the local `make run` path. `docker-compose.yml`
> deliberately overrides both (to `/data/capycook.db` and `/srv/data`) and pins
> the internal `PORT` to `8080` — so you can copy `.env` verbatim and the
> container still uses the right paths. Do not "fix" those relative paths for
> Docker; compose already handles it.

## Platform notes

- **Architecture (arm64 vs amd64).** The image builds for your host
  architecture by default — Apple Silicon / ARM servers get `linux/arm64`,
  Intel/AMD get `linux/amd64`. No configuration needed. To build for a
  *different* target (e.g. an amd64 server from an M-series laptop), build with
  buildx and push a specific platform:
  ```sh
  docker buildx build --platform linux/amd64 -t capycook:dev --load .
  ```
  The base images (`node:22-alpine`, `golang:1.26-alpine`,
  `gcr.io/distroless/static-debian12:nonroot`) are all multi-arch.
- **Port already in use.** If `8080` is taken, set `CAPYCOOK_HOST_PORT` (above).
- **First build is slow, rebuilds are cached.** The Go module download and
  `npm ci` layers cache between builds; only changed sources rebuild. Force a
  clean rebuild with `docker compose build --no-cache`.
- **Rootless / SELinux hosts.** The container runs as uid `65532` (nonroot) and
  only writes to the named volume, so it needs no extra privileges.

## Persisting your data

Dishes, versions, and the event log live in the `capycook-data` volume, not in
the container. They survive `docker compose down` and container rebuilds.

```sh
docker compose down            # stop + remove the container; volume is KEPT
docker compose down -v         # ALSO delete the volume (wipes all dishes)
docker volume inspect capycook_capycook-data   # find the volume on disk
```

Back it up by copying the volume contents:

```sh
docker run --rm -v capycook_capycook-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/capycook-data.tgz -C /data .
```

## Enabling the live DeepSeek model

The stub is fully functional; switch to the real model only when you want live
generation. **This spends money** — the budget cap is the guardrail.

1. Get a key from <https://platform.deepseek.com>.
2. In `.env`:
   ```sh
   DEEPSEEK_API_KEY=sk-...your-key...
   LLM_BUDGET_USD=10          # hard cap in USD; adjust to taste
   ```
3. `docker compose up`. The header banner disappears; `GET /api/status` reports
   `llm_mode: live` and the running spend against the cap.

Generation hard-stops and reports once cumulative spend reaches `LLM_BUDGET_USD`
(the running total persists in the budget-ledger sidecar on the volume, so the
cap survives restarts). Set `CAPYCOOK_STUB_LLM=1` to force the stub back on
without removing the key.

## Optional: tracing with Langfuse

Tracing is **off by default** — with the `LANGFUSE_*` keys unset, the OTel
exporter is a no-op and nothing leaves the box. Two ways to turn it on:

### Option A — Langfuse Cloud (keys only)

Create a project at <https://cloud.langfuse.com>, then in `.env`:

```sh
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com     # or https://us.cloud.langfuse.com
```

`docker compose up` as usual. Spans wrapping the `llm` calls export to Langfuse
(the deterministic domain events stay in the local event log — no double
tracing).

### Option B — self-hosted Langfuse (the `langfuse` profile)

`docker-compose.yml` bundles Langfuse's own documented self-host stack
(`langfuse-web` + `langfuse-worker` + Postgres + ClickHouse + Redis + MinIO),
tracking their upstream compose
(<https://github.com/langfuse/langfuse/blob/main/docker-compose.yml>, the v3
line). It is behind `profiles: [langfuse]`, so it starts **only** when you ask:

```sh
docker compose --profile langfuse up
```

Then:

1. Open the Langfuse UI at <http://localhost:3000>, create an account +
   project, and copy its public/secret keys. (Or seed them non-interactively
   with the `LANGFUSE_INIT_*` variables — see the comments in
   `docker-compose.yml`.)
2. Point CapyCook at the self-hosted instance by name on the compose network —
   in `.env`:
   ```sh
   LANGFUSE_HOST=http://langfuse-web:3000
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   ```
3. `docker compose --profile langfuse up` (both stacks together).

> **⚠ Security — regenerate every secret before any non-local use.** The
> `${VAR:-default}` fallbacks in the `langfuse` profile (`SALT`,
> `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `CLICKHOUSE_PASSWORD`, `REDIS_AUTH`,
> `MINIO_ROOT_PASSWORD`, Postgres password, …) are Langfuse's **insecure
> local-dev defaults**, marked `# CHANGEME` in the compose file. Generate real
> ones (e.g. `ENCRYPTION_KEY` via `openssl rand -hex 32`) and set them in `.env`
> before exposing this to anything but your own machine. For a production
> Langfuse deployment, regenerate the profile from their upstream compose rather
> than relying on this pinned copy.

The self-host stack is heavy (ClickHouse + Postgres + Redis + MinIO); it exists
for a fully-offline trace pipeline, not as a requirement. If you only want the
workbench, ignore the profile entirely.

## Troubleshooting

- **`env file .env not found`** — run `cp .env.example .env` first. The app's
  `env_file` is marked optional, but copying it is the documented step.
- **Blank page / SPA not loading** — the image must build the web bundle. Force
  a rebuild: `docker compose build --no-cache app`.
- **`GET /healthz` for a readiness check** — returns `{"status":"ok"}` with 200
  once the server is up (the container has no shell, so use an external probe,
  not `docker exec`).
- **Port conflict on 3000/9090 with the langfuse profile** — those are the
  Langfuse UI and MinIO S3 ports; stop whatever else uses them or adjust the
  mappings in `docker-compose.yml`.

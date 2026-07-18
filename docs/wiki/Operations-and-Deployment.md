# Operations and Deployment

> Canonical deployment entry point: [`README.md`](https://github.com/sjohnston1972/darwin/blob/main/README.md). This page owns operational detail and is reviewed with the [documentation freshness checklist](https://github.com/sjohnston1972/darwin/blob/main/docs/DOCUMENTATION.md).

## Production components

| Component         | Platform          | Identifier            |
| ----------------- | ----------------- | --------------------- |
| control room      | Cloudflare Pages  | `darwin-control-room` |
| API               | Cloudflare Worker | `darwin-api`          |
| persistence       | Cloudflare D1     | `darwin-telemetry`    |
| target            | Cloudflare Pages  | `darwin-projectflow`  |
| target automation | GitHub Actions    | ProjectFlow workflows |

## Worker configuration

Non-secret production variables live in `workers/api/wrangler.toml`:

- AI mode, model, and timeout;
- deterministic simulation seed/count;
- configured target repository/branch;
- production and study URLs;
- allowed browser origins;
- D1 and rate-limiter bindings.

Do not commit credentials to Wrangler configuration.

## Required secrets

```powershell
npx wrangler secret put OPENAI_API_KEY --config workers/api/wrangler.toml
npx wrangler secret put GITHUB_TOKEN --config workers/api/wrangler.toml
npx wrangler secret put DARWIN_CALLBACK_TOKEN --config workers/api/wrangler.toml
npx wrangler secret put DARWIN_OPERATOR_TOKEN --config workers/api/wrangler.toml
npx wrangler secret put PROJECTFLOW_INGESTION_SECRET --config workers/api/wrangler.toml
npx wrangler pages secret put PROJECTFLOW_INGESTION_SECRET --project-name darwin-projectflow
```

ProjectFlow Actions requires the matching callback secret and its own provider/deployment credentials. Darwin combines that secret with a per-execution nonce to sign the repository, immutable manifest or reset policy, timestamp, and callback payload; the shared secret itself is never a workflow input. The ProjectFlow Pages Function and Darwin Worker must share the same ingestion secret. `DARWIN_OPERATOR_TOKEN` must be distinct from both.

## D1 migrations

Apply migrations before deploying Worker code that depends on them:

```powershell
npm run deploy:migrate
```

Migrations are append-only SQL files under `workers/api/migrations`. Test new migrations against a disposable/local D1 database first. Never edit an already-applied production migration.

The Worker runs the indexed retention sweep daily at `03:17 UTC`. System status reports aggregate quota usage, pending expiry count and the last successful sweep. An authenticated operator can run the same idempotent maintenance path with `POST /api/retention/sweep`; policy and targeted deletion details are in [Data retention and deletion](../RETENTION.md).

## Build and deploy

Create a semantic tag such as `v0.1.0` on a commit with successful CI, then manually dispatch `.github/workflows/deploy.yml` using that tag. The workflow rejects branch dispatches and generates one build identity from the tag plus its 40-character commit SHA.

`npm run deploy` combines build, migration, API deploy, and Pages deploy. For an operator-run deployment, provide `DARWIN_RELEASE` and `DARWIN_COMMIT_SHA` in the environment so the same metadata is injected into Wrangler and Vite.

## ProjectFlow deployment

ProjectFlow production deploys from `main`. Darwin candidate branches produce isolated preview URLs after mutation validation passes. The preview URL is stored on the repository execution.

Release merges the reviewed pull request. Rollback creates and validates a separate inverse pull request.

## Production smoke test

`npm run smoke:production` verifies:

- Worker semantic release and exact workflow commit;
- target connection and repository identity;
- Darwin and ProjectFlow HTML availability;
- authenticated D1 telemetry insertion and aggregate readback;
- deterministic 10,000-event simulation response.

Set `DARWIN_OPERATOR_TOKEN`, `PROJECTFLOW_INGESTION_SECRET`, `DARWIN_RELEASE`, and `DARWIN_COMMIT_SHA` in the smoke-test environment. The smoke test rejects a deployment whose health metadata differs from that expected workflow commit, verifies one deterministic automated event, deletes its participant-scoped data immediately, and does not merge code, invoke GPT, or run a live Codex mutation.

## Operational checks

Before a demo or release, inspect:

1. Worker health and live model availability.
2. The System status diagnostics panel for recent privileged transitions and provider failures.
3. Connected target base SHA/source fingerprint.
4. D1 migration status.
5. GitHub Actions queue and permissions.
6. Cloudflare Pages production and preview deployments.
7. Current event/evidence counts and any stale execution.

Every Worker response carries `X-Request-ID`; a valid inbound request ID is
propagated, otherwise the Worker creates one. Structured logs and the System
status JSON export use that identifier to correlate authorization decisions,
provider calls, and the final response.

Operational audit/metric records are retained in `operational_events` for 30
days and pruned when new records are written. They contain only actor, bounded
action/target identifiers, outcome, state labels, provider operation, duration,
and error code. They must never contain request or callback bodies, telemetry
payloads, repository patches, prompts/model output, headers, tokens, credentials,
or arbitrary exception messages. The diagnostics endpoint returns at most 100
redacted transitions and aggregate latency/error counts; the UI export contains
the same bounded response.

Configure Cloudflare Worker log retention to no more than 30 days. Console logs
follow the same redaction allowlist, but their deletion is controlled by the
Cloudflare account rather than D1; do not attach Logpush destinations with a
longer retention window for this demo environment.

## Recovery

### Worker deploy failed

Keep the previous Worker active, inspect Wrangler output, and correct configuration/migration errors before retrying.

### Pages deploy failed

The prior Pages deployment remains available. Rebuild locally and inspect Vite output before redeploying.

### D1 migration failed

Do not delete the database. Inspect remote migration state, make a new forward migration, and rerun migration apply.

### Repository execution failed

Keep its failed record. Correct provider/workflow configuration and use the explicit retry path so the failure remains auditable.

### Released mutation is unsuitable

Use the controlled rollback workflow. Do not force-push or reset ProjectFlow `main`.

## Diagnostics failure

Operational trace persistence is best-effort and cannot replace the original
API response. If the System status panel reports diagnostics unavailable, verify
migration `0012_operational_events.sql`, D1 health, and Worker logs using the
response request ID. Do not enable body/header logging while investigating.

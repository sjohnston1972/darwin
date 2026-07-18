# Operations and Deployment

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

ProjectFlow Actions requires the matching callback secret and its own provider/deployment credentials. Darwin combines that secret with a per-execution nonce to sign the repository, immutable manifest, timestamp, and callback payload; the shared secret itself is never a workflow input. The ProjectFlow Pages Function and Darwin Worker must share the same ingestion secret. `DARWIN_OPERATOR_TOKEN` must be distinct from both.

## D1 migrations

Apply migrations before deploying Worker code that depends on them:

```powershell
npm run deploy:migrate
```

Migrations are append-only SQL files under `workers/api/migrations`. Test new migrations against a disposable/local D1 database first. Never edit an already-applied production migration.

The Worker runs the indexed retention sweep daily at `03:17 UTC`. System status reports aggregate quota usage, pending expiry count and the last successful sweep. An authenticated operator can run the same idempotent maintenance path with `POST /api/retention/sweep`; policy and targeted deletion details are in [Data retention and deletion](../RETENTION.md).

## Build and deploy

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run deploy:api
npm run deploy:web
npm run smoke:production
```

`npm run deploy` combines build, migration, API deploy, and Pages deploy.

The checked workflow at `.github/workflows/deploy.yml` is manually dispatched. Automated pull-request CI is tracked in issue [#22](https://github.com/sjohnston1972/darwin/issues/22).

## ProjectFlow deployment

ProjectFlow production deploys from `main`. Darwin candidate branches produce isolated preview URLs after mutation validation passes. The preview URL is stored on the repository execution.

Release merges the reviewed pull request. Rollback creates and validates a separate inverse pull request.

## Production smoke test

`npm run smoke:production` verifies:

- Worker health/version;
- target connection and repository identity;
- Darwin and ProjectFlow HTML availability;
- authenticated D1 telemetry insertion and aggregate readback;
- deterministic 10,000-event simulation response.

Set `DARWIN_OPERATOR_TOKEN` and `PROJECTFLOW_INGESTION_SECRET` in the smoke-test environment. The smoke test verifies one deterministic automated event, deletes its participant-scoped data immediately, and does not merge code, invoke GPT, or run a live Codex mutation.

## Operational checks

Before a demo or release, inspect:

1. Worker health and live model availability.
2. Connected target base SHA/source fingerprint.
3. D1 migration status.
4. GitHub Actions queue and permissions.
5. Cloudflare Pages production and preview deployments.
6. Current event/evidence counts and any stale execution.

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

## Monitoring backlog

Request tracing, durable audit events, latency metrics, and provider diagnostics are tracked in issue [#31](https://github.com/sjohnston1972/darwin/issues/31).

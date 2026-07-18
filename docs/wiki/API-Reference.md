# API Reference

> Canonical route list: [`docs/generated/API_ROUTES.md`](https://github.com/sjohnston1972/darwin/blob/main/docs/generated/API_ROUTES.md). It is generated from the checked Worker contract and includes every method, path, access boundary, capability, and purpose. This wiki page supplies usage notes only and does not duplicate that list.

Base URLs:

- local: `http://localhost:8787`
- production: `https://darwin-api.stevie-johnston.workers.dev`

All JSON request/response contracts are defined in [`packages/shared/src/contracts.ts`](https://github.com/sjohnston1972/darwin/blob/main/packages/shared/src/contracts.ts) and parsed with Zod.

## Access boundaries

`GET /api/health` is deliberately public. `GET /api/auth/session` validates the current operator credential. Control-plane routes require `Authorization: Bearer <DARWIN_OPERATOR_TOKEN>` and enforce a capability such as observe, inspect evidence, reason, execute, release, reset, connect, or simulate.

ProjectFlow telemetry and participant-workspace routes require a signed target request derived from `PROJECTFLOW_INGESTION_SECRET`. Repository workflow routes require execution-scoped signatures derived from `DARWIN_CALLBACK_TOKEN`. Protected responses use `Cache-Control: no-store`.

## Target connection input

```json
{
  "fullName": "sjohnston1972/projectflow",
  "branch": "main",
  "productionUrl": "https://darwin-projectflow.pages.dev/",
  "studyUrl": "https://darwin-projectflow.pages.dev/?study=true"
}
```

The Worker accepts only its configured ProjectFlow target values, resolves the branch to an immutable SHA, validates `darwin.target.json`, and verifies the measured deployment.

## Telemetry ingestion

The ingestion body contains 1-50 strict semantic records and is capped at 256 KB. A successful response reports accepted, rejected, and duplicate counts:

```json
{
  "accepted": 20,
  "rejected": 0,
  "duplicates": 0
}
```

Production ProjectFlow calls a same-origin Pages Function, which signs the timestamp, target, deployment origin, edge-derived client key, and exact body. The Worker rejects unsigned requests, stale or invalid signatures, unsupported studies/provenance/versions, and target-origin mismatches.

## Evidence and reasoning

The evidence endpoint builds deterministic measured evidence before GPT is available. The analysis endpoint invokes live reasoning only over the current evidence hash and immutable source snapshot. Add `?optional=true` to the two `latest` GET routes to receive 204 when no current artifact exists.

Manifest selection accepts one or more supported mutation IDs:

```json
{
  "mutationIds": ["mutation-one", "mutation-two"]
}
```

Repository execution responses contain only actual GitHub state. Candidate creation, release, rollback, and rollback release are distinct controlled actions.

## Repository callback signing

The signed canonical callback request covers method, path, timestamp, execution nonce, execution ID, repository, immutable manifest hash, and payload digest. Credentials expire after 24 hours, request timestamps have a five-minute window, and each mutating signature is consumed once. Replays, cross-execution requests, oversized payloads, and same-state or terminal rewrites are rejected.

## Synthetic scale replay

```json
{
  "seed": 1859,
  "variant": "baseline"
}
```

The replay accepts only the configured demo seed, applies separate rate/concurrency limits, and retains bounded metadata/summary records. It always produces 10,000 deterministic synthetic events and never populates measured cohorts or measured fitness.

## Error shape

Expected errors use:

```json
{
  "error": "machine_readable_code",
  "message": "Operator-readable explanation."
}
```

Unhandled failures return `internal_error` without exposing credentials or provider response bodies.

## Keeping the reference current

After changing a Worker route, update `workers/api/src/api-route-contract.ts`, run `npm run docs:generate`, and commit the generated reference. `npm run docs:check` is part of `npm run typecheck` and rejects stale output. See [Documentation Ownership and Freshness](https://github.com/sjohnston1972/darwin/blob/main/docs/DOCUMENTATION.md).

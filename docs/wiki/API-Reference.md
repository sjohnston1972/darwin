# API Reference

Base URLs:

- local: `http://localhost:8787`
- production: `https://darwin-api.stevie-johnston.workers.dev`

All JSON request/response contracts are defined in `packages/shared/src/contracts.ts` and parsed with Zod.

`GET /api/health` is deliberately public. All other control-plane routes require `Authorization: Bearer <DARWIN_OPERATOR_TOKEN>` and enforce a route capability such as observe, inspect evidence, reason, execute, release, reset, connect, or simulate. Protected responses use `Cache-Control: no-store`.

`GET /api/auth/session` validates the current operator credential and returns its capabilities. Localhost permits an explicit credential-free development identity only when no operator token is configured.

## Health and history

| Method | Route                        | Purpose                                             |
| ------ | ---------------------------- | --------------------------------------------------- |
| GET    | `/api/health`                | service version, model, and live-model availability |
| GET    | `/api/genome`                | evolution cycle and repository execution history    |
| GET    | `/api/observations/archives` | evidence/analysis retained by completed executions  |

## Target connection

| Method | Route                               | Purpose                                   |
| ------ | ----------------------------------- | ----------------------------------------- |
| GET    | `/api/target-connection`            | return current verified connection or 204 |
| POST   | `/api/target-connection`            | verify and save configured target         |
| POST   | `/api/target-connection/disconnect` | remove active connection                  |

Connection input:

```json
{
  "fullName": "sjohnston1972/projectflow",
  "branch": "main",
  "productionUrl": "https://darwin-projectflow.pages.dev/",
  "studyUrl": "https://darwin-projectflow.pages.dev/?study=true"
}
```

The Worker accepts only its configured target values.

## Demo reset

| Method | Route             | Purpose                                           |
| ------ | ----------------- | ------------------------------------------------- |
| POST   | `/api/demo/reset` | dispatch target reset and clear Darwin demo state |

Reset completion verification is tracked in issue #10.

## Telemetry and workspaces

| Method | Route                                                         | Purpose                             |
| ------ | ------------------------------------------------------------- | ----------------------------------- |
| POST   | `/api/telemetry/events`                                       | ingest 1-50 strict semantic events  |
| GET    | `/api/studies/:studyId/events?limit=200`                      | recent events plus aggregate counts |
| GET    | `/api/studies/:studyId/sessions/:sessionId`                   | ordered session trace               |
| GET    | `/api/studies/:studyId/participants/:participantId/workspace` | get anonymous ProjectFlow workspace |
| PUT    | `/api/studies/:studyId/participants/:participantId/workspace` | replace validated workspace         |

Ingestion returns:

```json
{
  "accepted": 20,
  "rejected": 0,
  "duplicates": 0
}
```

The batch body is capped at 256 KB and the event list at 50 records. Production ProjectFlow calls a same-origin Pages Function, which signs the timestamp, target, deployment origin, edge-derived client key, and exact body with `PROJECTFLOW_INGESTION_SECRET`. The Worker rejects unsigned requests, stale or invalid signatures, unsupported studies/provenance/versions, and target-origin mismatches.

## Evidence and reasoning

| Method | Route                                            | Purpose                                  |
| ------ | ------------------------------------------------ | ---------------------------------------- |
| POST   | `/api/studies/:studyId/evidence`                 | build and persist deterministic evidence |
| GET    | `/api/studies/:studyId/evidence/latest`          | latest current-cycle pack                |
| POST   | `/api/studies/:studyId/analyse-evidence`         | invoke/cache live GPT reasoning          |
| GET    | `/api/studies/:studyId/evidence-analysis/latest` | latest current-cycle analysis            |

Add `?optional=true` to latest GET routes to receive 204 when no current artifact exists.

## Manifest and execution

| Method | Route                                                         | Purpose                        |
| ------ | ------------------------------------------------------------- | ------------------------------ |
| GET    | `/api/evidence-analyses/:analysisId/codex-manifest`           | get manifest                   |
| POST   | `/api/evidence-analyses/:analysisId/codex-manifest`           | build selected mutation bundle |
| GET    | `/api/evidence-analyses/:analysisId/codex-manifest/execution` | get execution or 204           |
| POST   | `/api/evidence-analyses/:analysisId/codex-manifest/execution` | dispatch controlled evolution  |
| GET    | `/api/repository-executions/:executionId`                     | poll execution                 |
| POST   | `/api/repository-executions/:executionId/release`             | merge PR and verify production |
| GET    | `/api/repository-executions/:executionId/fitness`             | get persisted fitness or 204   |
| POST   | `/api/repository-executions/:executionId/fitness`             | calculate/persist fitness      |
| POST   | `/api/repository-executions/:executionId/rollback`            | dispatch rollback workflow     |
| POST   | `/api/repository-executions/:executionId/rollback/release`    | merge reviewed rollback PR     |

Manifest selection body:

```json
{
  "mutationIds": ["mutation-one", "mutation-two"]
}
```

A release returns `202` with status `deployment_verifying` when the pull request has merged but the production HTML metadata does not yet report the merged commit and app version. Repeating the same release request rechecks production without merging again. A `200` `released` response includes the verified identity and timestamp that begin the next evidence cycle.

Fitness calculation requires a released execution, its archived baseline evidence, and a distinct current measured evidence pack. Formula `1.0.0` applies deterministic 30/25/15/15/15 weights to task completion, navigation efficiency, error rate, feature discovery, and median duration. Incompatible or undersized cohorts persist an `insufficient` outcome with limitations and null scores. A released rollback invalidates the outcome and clears the comparison.

## Repository workflow callbacks

These routes require an execution-scoped HMAC signature derived from `DARWIN_CALLBACK_TOKEN` and a random nonce issued only for that dispatch:

| Method | Route                                                       | Purpose                               |
| ------ | ----------------------------------------------------------- | ------------------------------------- |
| GET    | `/api/repository-executions/:executionId/manifest`          | workflow retrieves execution/manifest |
| POST   | `/api/repository-executions/:executionId/callback`          | update mutation execution state       |
| POST   | `/api/repository-executions/:executionId/rollback/callback` | update rollback state                 |

The signed canonical request covers method, path, timestamp, execution nonce, execution ID, repository, immutable manifest hash, and payload digest. Credentials expire after 24 hours, request timestamps have a five-minute window, and each mutating signature is consumed once. Replays, cross-execution requests, oversized payloads, and same-state or terminal rewrites are rejected.

## Synthetic simulation

| Method | Route                             | Purpose                               |
| ------ | --------------------------------- | ------------------------------------- |
| POST   | `/api/simulations`                | run deterministic 10,000-event replay |
| GET    | `/api/simulations/:runId`         | simulation run metadata               |
| GET    | `/api/simulations/:runId/summary` | deterministic aggregates              |

Input:

```json
{
  "seed": 1859,
  "variant": "baseline"
}
```

The simulation API is separate from measured evidence. It accepts only the configured demo seed, applies separate rate/concurrency limits, and retains at most four metadata/summary records for 15 minutes. Full 10,000-event arrays are not cached.

## Error shape

Expected errors use:

```json
{
  "error": "machine_readable_code",
  "message": "Operator-readable explanation."
}
```

Unhandled failures return `internal_error` without exposing secrets or provider response bodies.

## Current authentication warning

Operator, target-ingestion, and repository-callback boundaries are authenticated; CORS remains defense in depth rather than authorization. Do not connect private production targets until retention, transactionality, and the remaining hardening backlog are complete.

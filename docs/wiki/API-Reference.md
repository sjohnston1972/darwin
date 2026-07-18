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
| GET    | `/api/operations/metrics`     | telemetry acceptance and rejection counters         |

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
| GET    | `/api/studies/:studyId/events`                                | aggregate-only study counts          |
| GET    | `/api/studies/:studyId/events/raw?limit=200`                  | recent pseudonymous event records    |
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

The batch body is capped at 256 KB and the event list at 50 records. Production ProjectFlow calls a same-origin Pages Function, which signs the timestamp, target, deployment origin, edge-derived client key, and exact body with `PROJECTFLOW_INGESTION_SECRET`. The Worker rejects unsigned requests, stale or invalid signatures, exact request replays, unsupported studies/provenance/versions, and target-origin mismatches. `PROJECTFLOW_ALLOWED_APP_VERSIONS` is a comma-separated allow-list for named baseline versions; commit and candidate versions must also match the connected repository or a recorded execution.

`GET /api/operations/metrics` returns persistent counts for telemetry requests, accepted/rejected/duplicate events, authentication failures, request replays, context failures, and rate limits. It is an authenticated control-plane route and never exposes credentials or event payloads.

The default events response contains only total event, session, participant, and behavioral-signal counts. It omits event records and participant/session identifiers and requires the `observe` capability. The `/events/raw` and `/sessions/:sessionId` routes require `inspect_evidence` and return pseudonymous traces only to evidence inspectors.

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
| POST   | `/api/repository-executions/:executionId/release`             | merge reviewed mutation PR     |
| POST   | `/api/repository-executions/:executionId/rollback`            | dispatch rollback workflow     |
| POST   | `/api/repository-executions/:executionId/rollback/release`    | merge reviewed rollback PR     |

Manifest selection body:

```json
{
  "mutationIds": ["mutation-one", "mutation-two"]
}
```

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

The simulation API is separate from measured evidence. It accepts only a strict 4 KB request containing the configured demo seed with the `baseline` variant, applies separate rate/concurrency limits, and retains at most four metadata/summary records for 15 minutes. Full 10,000-event arrays are neither returned nor cached. Comparative baseline/evolved replay remains available only through the offline `npm run simulate` command.

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

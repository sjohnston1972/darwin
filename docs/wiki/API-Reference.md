# API Reference

Base URLs:

- local: `http://localhost:8787`
- production: `https://darwin-api.stevie-johnston.workers.dev`

Measured-flow JSON contracts are defined in `packages/shared/src/contracts.ts`.
Darwin Lab contracts are kept separately in
`packages/shared/src/lab-contracts.ts`. Both are parsed with Zod.

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

Full reset requires the dedicated `reset` capability and the exact body `{"confirmation":"RESET DARWIN DEMO","exportAcknowledged":true}`. Export Genome, Observation archive, and diagnostics data before calling it: Darwin data is irrecoverable after deletion, while ProjectFlow recovery is the separately audited baseline workflow.

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
| GET    | `/api/repository-executions/:executionId/manifest?audience=operator` | inspect the immutable manifest |
| POST   | `/api/repository-executions/:executionId/release`             | merge reviewed mutation PR     |
| POST   | `/api/repository-executions/:executionId/rollback`            | dispatch rollback workflow     |
| POST   | `/api/repository-executions/:executionId/rollback/release`    | merge reviewed rollback PR     |
| POST   | `/api/repository-executions/:executionId/recovery/force-fail` | force-fail a workflow stranded for 15 minutes   |

Manifest selection body:

```json
{
  "mutationIds": ["mutation-one", "mutation-two"]
}
```

Stranded execution recovery requires the dedicated execute capability and the
exact bounded confirmation body `{"confirmation":"FAIL STRANDED EXECUTION"}`.
The original immutable execution remains auditable and can then be retried.

## Darwin Lab

Darwin Lab accepts only configured ProjectFlow local, test, preview, or
production origins and requires the exact verified application version. Its
automated agents interact with the real target in isolated Playwright contexts;
this is observation, not simulation. All records carry immutable `darwin_lab`
provenance and are excluded from measured human cohorts and human fitness.

| Method | Route                                                    | Purpose                                         |
| ------ | -------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/lab/experiments`                                   | list Lab experiments and current runs           |
| POST   | `/api/lab/experiments`                                   | create one bounded ProjectFlow experiment       |
| GET    | `/api/lab/experiments/:experimentId`                     | inspect population, replay, evidence, and state |
| PUT    | `/api/lab/experiments/:experimentId`                     | edit a versioned task while it remains a draft  |
| POST   | `/api/lab/experiments/:experimentId/duplicate`           | duplicate an immutable task into a new draft    |
| POST   | `/api/lab/experiments/:experimentId/cancel`              | cancel queued or active bounded work             |
| POST   | `/api/lab/experiments/:experimentId/retry`               | create an auditable retry experiment             |
| POST   | `/api/lab/experiments/:experimentId/archive`             | archive terminal Lab work                        |
| POST   | `/api/lab/experiments/:experimentId/start`               | queue a draft experiment for a browser runner   |
| POST   | `/api/lab/experiments/:experimentId/claim`               | claim queued work for one runner                |
| POST   | `/api/lab/experiments/:experimentId/runs`                | start one isolated real-target agent run        |
| POST   | `/api/lab/experiments/:experimentId/runs/:runId/actions` | append one bounded semantic action              |
| POST   | `/api/lab/experiments/:experimentId/runs/:runId/finish`  | close a run and finalize population evidence    |
| POST   | `/api/lab/agent-decision`                                | ask the cheap model for one UI action           |
| POST   | `/api/lab/experiments/:experimentId/analyse`             | run one GPT-5.6 population analysis call        |
| POST   | `/api/lab/experiments/:experimentId/mutations/select`    | record the human-approved implementation brief  |

The agent-decision endpoint receives an accessibility snapshot, current URL,
persona, compact action history, and remaining budget. It never receives the
hidden answer oracle and returns no chain-of-thought. Typed values are used by
the runner but only their length is persisted. A selected Lab mutation can
produce the normal immutable Codex manifest. Diff, repository checks, PR review,
preview, and release remain separate controlled stages, and every downstream
artifact retains the **Darwin Lab** chip.

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

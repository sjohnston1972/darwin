# API Reference

Base URLs:

- local: `http://localhost:8787`
- production: `https://darwin-api.stevie-johnston.workers.dev`

All JSON request/response contracts are defined in `packages/shared/src/contracts.ts` and parsed with Zod.

## Health and history

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | service version, model, and live-model availability |
| GET | `/api/genome` | evolution cycle and repository execution history |
| GET | `/api/observations/archives` | evidence/analysis retained by completed executions |

## Target connection

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/target-connection` | return current verified connection or 204 |
| POST | `/api/target-connection` | verify and save configured target |
| POST | `/api/target-connection/disconnect` | remove active connection |

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

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/demo/reset` | dispatch target reset and clear Darwin demo state |

Reset completion verification is tracked in issue #10.

## Telemetry and workspaces

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/telemetry/events` | ingest 1-50 strict semantic events |
| GET | `/api/studies/:studyId/events?limit=200` | recent events plus aggregate counts |
| GET | `/api/studies/:studyId/sessions/:sessionId` | ordered session trace |
| GET | `/api/studies/:studyId/participants/:participantId/workspace` | get anonymous ProjectFlow workspace |
| PUT | `/api/studies/:studyId/participants/:participantId/workspace` | replace validated workspace |

Ingestion returns:

```json
{
  "accepted": 20,
  "rejected": 0,
  "duplicates": 0
}
```

The batch body is capped at 256 KB and the event list at 50 records.

## Evidence and reasoning

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/studies/:studyId/evidence` | build and persist deterministic evidence |
| GET | `/api/studies/:studyId/evidence/latest` | latest current-cycle pack |
| POST | `/api/studies/:studyId/analyse-evidence` | invoke/cache live GPT reasoning |
| GET | `/api/studies/:studyId/evidence-analysis/latest` | latest current-cycle analysis |

Add `?optional=true` to latest GET routes to receive 204 when no current artifact exists.

## Manifest and execution

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/evidence-analyses/:analysisId/codex-manifest` | get manifest |
| POST | `/api/evidence-analyses/:analysisId/codex-manifest` | build selected mutation bundle |
| GET | `/api/evidence-analyses/:analysisId/codex-manifest/execution` | get execution or 204 |
| POST | `/api/evidence-analyses/:analysisId/codex-manifest/execution` | dispatch controlled evolution |
| GET | `/api/repository-executions/:executionId` | poll execution |
| POST | `/api/repository-executions/:executionId/release` | merge reviewed mutation PR |
| POST | `/api/repository-executions/:executionId/rollback` | dispatch rollback workflow |
| POST | `/api/repository-executions/:executionId/rollback/release` | merge reviewed rollback PR |

Manifest selection body:

```json
{
  "mutationIds": ["mutation-one", "mutation-two"]
}
```

## Repository workflow callbacks

These routes currently require `Authorization: Bearer <DARWIN_CALLBACK_TOKEN>`:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/repository-executions/:executionId/manifest` | workflow retrieves execution/manifest |
| POST | `/api/repository-executions/:executionId/callback` | update mutation execution state |
| POST | `/api/repository-executions/:executionId/rollback/callback` | update rollback state |

Per-execution signed callbacks and replay protection are tracked in issue #27.

## Synthetic simulation

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/simulations` | run deterministic 10,000-event replay |
| GET | `/api/simulations/:runId` | simulation run metadata |
| GET | `/api/simulations/:runId/summary` | deterministic aggregates |

Input:

```json
{
  "seed": 1859,
  "variant": "baseline"
}
```

The simulation API is separate from measured evidence.

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

Only repository workflow callbacks are authenticated today. CORS restricts browser origins but is not authorization. Do not expose this API to production targets until issues #1, #2, #3, and #27 are complete.

# API Reference

> Canonical route list: [`docs/generated/API_ROUTES.md`](https://github.com/sjohnston1972/darwin/blob/main/docs/generated/API_ROUTES.md). It is generated from the checked Worker contract and includes every method, path, access boundary, capability, and purpose. This wiki page supplies usage notes only and does not duplicate that list.

Base URLs:

- local: `http://localhost:8787`
- production: `https://darwin-api.stevie-johnston.workers.dev`

All JSON request/response contracts are defined in [`packages/shared/src/contracts.ts`](https://github.com/sjohnston1972/darwin/blob/main/packages/shared/src/contracts.ts) and parsed with Zod.

## Access boundaries

`GET /api/health` is deliberately public. `GET /api/auth/session` validates the current operator credential. Control-plane routes require `Authorization: Bearer <DARWIN_OPERATOR_TOKEN>` and enforce a capability such as observe, inspect evidence, reason, execute, release, reset, connect, or simulate.

ProjectFlow telemetry and participant-workspace routes require a signed target request derived from `PROJECTFLOW_INGESTION_SECRET`. Repository workflow routes require execution-scoped signatures derived from `DARWIN_CALLBACK_TOKEN`. Protected responses use `Cache-Control: no-store`.

## Paged history and archives

The two collection routes accept an opaque `cursor` and a `limit` from 1 to 25 (default 10). Collection responses expose the next opaque cursor under `page.nextCursor`; full artifact data is returned only by the identifier routes.

## Demo reset

| Method | Route                               | Purpose                                   |
| ------ | ----------------------------------- | ----------------------------------------- |
| GET    | `/api/demo/reset`                   | latest reset lifecycle or 204             |
| POST   | `/api/demo/reset`                   | dispatch or retry baseline restoration    |
| POST   | `/api/demo/reset/:resetId/callback` | authenticated workflow lifecycle callback |

Reset status progresses through `queued`, `running`, `validating`, `deploying`, then `complete` or `failed`. A dispatch never clears Darwin state. Completion requires production HTML metadata matching the restored commit and app version. The callback route uses the same execution-scoped HMAC and replay protection as repository mutation callbacks.

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

The batch body is capped at 256 KB and the event list at 50 records. Production ProjectFlow calls a same-origin Pages Function, which signs the timestamp, target, deployment origin, edge-derived client key, and exact body with `PROJECTFLOW_INGESTION_SECRET`. The Worker rejects unsigned requests, stale or invalid signatures, exact request replays, unsupported studies/provenance/versions, and target-origin mismatches. `PROJECTFLOW_ALLOWED_APP_VERSIONS` is a comma-separated allow-list for named baseline versions; commit and candidate versions must also match the connected repository or a recorded execution.

`GET /api/operations/metrics` returns persistent counts for telemetry requests, accepted/rejected/duplicate events, authentication failures, request replays, context failures, and rate limits. It is an authenticated control-plane route and never exposes credentials or event payloads.

The default events response contains only total event, session, participant, and behavioral-signal counts. It omits event records and participant/session identifiers and requires the `observe` capability. The `/events/raw` and `/sessions/:sessionId` routes require `inspect_evidence` and return pseudonymous traces only to evidence inspectors.

## Retention and targeted deletion

| Method | Route                                               | Purpose                                              |
| ------ | --------------------------------------------------- | ---------------------------------------------------- |
| POST   | `/api/retention/sweep`                              | run the idempotent expiry/compaction sweep           |
| DELETE | `/api/studies/:studyId/participants/:participantId` | delete a participant and invalidate derived evidence |
| DELETE | `/api/studies/:studyId`                             | delete one study and its derived artifacts           |
| DELETE | `/api/repository-executions/:executionId/artifacts` | delete one execution and callback material           |

These routes require the `reset` capability. They return aggregate deletion counts and never return deleted content. See [Data retention and deletion](../RETENTION.md) for lifetimes and quota defaults.

The initial `/events/raw` response returns the most recent bounded window and an opaque `cursor`. Reuse that cursor to receive only later events. `hasMore: true` means another immediate delta is available; an empty delta retains the same cursor. Cursors combine receive time and event ID so events received in the same millisecond are not dropped.

## Evidence and reasoning

The evidence endpoint builds deterministic measured evidence before GPT is available. The analysis endpoint invokes live reasoning only over the current evidence hash and immutable source snapshot. Add `?optional=true` to the two `latest` GET routes to receive 204 when no current artifact exists.

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

Manifest selection accepts one or more supported mutation IDs:

```json
{
  "mutationIds": ["mutation-one", "mutation-two"]
}
```

Repository execution responses contain only actual GitHub state. Candidate creation, release, rollback, and rollback release are distinct controlled actions.

A release returns `202` with status `deployment_verifying` when the pull request has merged but the production HTML metadata does not yet report the merged commit and app version. Repeating the same release request rechecks production without merging again. A `200` `released` response includes the verified identity and timestamp that begin the next evidence cycle.

Fitness calculation requires a released execution, its archived baseline evidence, and a distinct current measured evidence pack. Formula `1.0.0` applies deterministic 30/25/15/15/15 weights to task completion, navigation efficiency, error rate, feature discovery, and median duration. Incompatible or undersized cohorts persist an `insufficient` outcome with limitations and null scores. A released rollback invalidates the outcome and clears the comparison.

## Repository workflow callbacks

## Repository callback signing

The signed canonical callback request covers method, path, timestamp, execution nonce, execution ID, repository, immutable manifest hash, and payload digest. Credentials expire after 24 hours, request timestamps have a five-minute window, and each mutating signature is consumed once. Replays, cross-execution requests, oversized payloads, and same-state or terminal rewrites are rejected.

## Synthetic scale replay

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

Unhandled failures return `internal_error` without exposing credentials or provider response bodies.

## Keeping the reference current

After changing a Worker route, update `workers/api/src/api-route-contract.ts`, run `npm run docs:generate`, and commit the generated reference. `npm run docs:check` is part of `npm run typecheck` and rejects stale output. See [Documentation Ownership and Freshness](https://github.com/sjohnston1972/darwin/blob/main/docs/DOCUMENTATION.md).

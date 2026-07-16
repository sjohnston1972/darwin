# Sample Evidence Data

Darwin includes two intentionally separate demonstration datasets.

## Measured study event

The browser creates this shape through `packages/telemetry-client`. IDs and
timestamps are generated at runtime; text and form values are never included.

```json
{
  "schemaVersion": 1,
  "eventId": "49d13df2-8dce-4ad3-b20e-d8b4edc01b63",
  "sessionId": "session-example",
  "participantId": "participant-example",
  "studyId": "projectflow-baseline-study",
  "appVersion": "1.0.0",
  "source": "real_user",
  "occurredAt": "2026-07-16T12:00:00.000Z",
  "sequence": 0,
  "route": "/study/dashboard",
  "viewport": "desktop",
  "eventType": "page_view"
}
```

## Recorded automated outcome

`workers/api/src/fixtures/phase12-outcome.json` was generated from the critical
Playwright run. It compares the same `find-assigned-task` workflow in standalone
ProjectFlow `v1.0.0` and `v1.1.0`: eight versus four median interactions, with
both automated cohorts completing the task. The fixture is always labelled
`recorded_automated_run`, never measured human evidence.

## Synthetic scale replay

`npm run simulate -- --seed 1859 --variant baseline` creates exactly 10,000
deterministic synthetic events and an aggregate summary. The seed is locked for
the three-minute demo. Synthetic records demonstrate scale; they are not merged
with measured or automated cohorts.

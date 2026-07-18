# Telemetry and Evidence

> Canonical collection and parsing plan: [`docs/REAL_TELEMETRY_PLAN.md`](https://github.com/sjohnston1972/darwin/blob/main/docs/REAL_TELEMETRY_PLAN.md). This page explains how to operate the current implementation.

## Design goal

Darwin needs enough behavioral context to reason about product friction without turning the telemetry client into a session-replay recorder.

The client records semantic targets and bounded measurements. It deliberately excludes content that could capture user-entered or page-specific data.

## Event envelope

Every measured event contains:

- schema version;
- UUID event ID;
- study, anonymous participant, session, and optional task-attempt identity;
- application version;
- source provenance: `real_user`, `automated`, or `synthetic`;
- client occurrence timestamp and monotonically increasing session sequence;
- normalized route and viewport class;
- event-specific bounded fields.

Zod discriminated unions reject unknown fields and invalid ranges.

## Captured event types

| Category | Events and measurements |
| --- | --- |
| lifecycle | session start/end, page view |
| navigation | route change, browser Back/Forward |
| click | target ID, pointer type, click count, normalized position |
| hover | start/end, duration, click outcome, immediate exit, hover-to-click |
| pointer | target transitions, direction-change count, indecision window |
| gesture | drag attempt, draggable state, bounded distance, touch cancel |
| readability | relative viewport/browser zoom change |
| workflow | task start, completion, failure, abandonment |
| form/search | error codes, query length, result count |

## Explicit exclusions

Darwin does not collect:

- typed field values or search terms;
- feedback text;
- keystrokes;
- arbitrary visible text;
- CSS selectors, DOM paths, or HTML;
- absolute screen coordinates;
- raw cursor trails or every pointer move;
- user names, email addresses, or authentication identity.

## Browser delivery

The telemetry client keeps a local outbox, batches at most 50 events, posts to `/api/telemetry/events`, and uses event IDs for idempotency. D1 stores the original validated event JSON plus indexed study/session fields and a server receipt timestamp.

Delivery reliability and ingestion authentication are active hardening items. See issues [#2](https://github.com/sjohnston1972/darwin/issues/2) and [#11](https://github.com/sjohnston1972/darwin/issues/11).

## Deterministic parsing

GPT does not parse raw browser records. The evidence engine:

1. selects events for the current study cycle;
2. orders records and reconstructs task attempts;
3. derives terminal outcomes, duration, route path, and interaction count;
4. builds privacy-safe ordered journeys;
5. runs versioned friction detectors;
6. summarizes task completion and path metrics;
7. calculates evidence quality and limitations;
8. canonicalizes the payload and stores a SHA-256 evidence hash.

## Detector catalogue

Current rules include:

- excess path length;
- navigation loops;
- task abandonment;
- repeated target/rage click;
- validation friction;
- search dependency;
- false affordance and unexpected double click;
- hover hesitation;
- cursor indecision/thrashing;
- drag expectation;
- touch conflict;
- browser Back dependency;
- zoom/readability pressure.

Each `EV-nnn` signal retains rule/version, severity, affected attempts, supporting event IDs, a bounded trace, and support across events, attempts, sessions, and participants.

Signal aggregation is being improved in issue [#8](https://github.com/sjohnston1972/darwin/issues/8); the current implementation can emit repeated event-level signals.

## Evidence quality

Evidence quality currently reports:

- event count;
- independent session count;
- anonymous participant count;
- completed attempt count;
- a 0-100 coverage score;
- `insufficient`, `directional`, or `substantial` strength;
- explicit limitations.

It is a coverage indicator, not statistical significance. Minimum diversity gates are tracked in issue [#9](https://github.com/sjohnston1972/darwin/issues/9).

## Measured versus synthetic

The live ingestion path accepts measured or automated browser events and rejects `synthetic` provenance. The simulator is a separate scale tool:

```powershell
npm run simulate -- --seed=1859 --variant=baseline
```

Its deterministic 10,000 events must never be described as users or mixed into a measured evidence pack.

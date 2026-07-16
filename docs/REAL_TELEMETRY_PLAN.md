# Darwin Real Telemetry Plan

## Proof standard

Darwin's primary evidence chain is:

```text
real user action
  -> semantic browser event
  -> validated raw record
  -> deterministic task-attempt reconstruction
  -> rule-backed friction signal
  -> canonical evidence pack and hash
  -> evidence-citing GPT-5.6 proposal
  -> approved Codex mutation
  -> measured or explicitly labelled automated outcome
```

The seeded 10,000-event generator remains useful as scale replay. Its events,
metrics and fitness must always be labelled `synthetic` and displayed separately
from human study data.

## Observed application

ProjectFlow is a standalone, functional project-management application. It has
three study workflows:

1. Create a project.
2. Create and assign a task.
3. Find an existing task assigned to the participant.

The overdue-project report remains a functional secondary workflow so low-usage
navigation can be observed outside the fixed study script.

The baseline is usable but makes assigned tasks indirect to find. ProjectFlow
persists participant workspace state, exposes stable semantic control IDs and
can run independently of the Darwin control room.

The `/study` experience issues an anonymous participant ID, presents the fixed
tasks, creates a unique attempt for every start, records explicit success,
failure or abandonment, and never asks for personal information.

## Collection boundary

`packages/telemetry-client` provides buffered first-party instrumentation. It
captures only:

- session start and end;
- page views and route changes;
- clicks on elements carrying `data-darwin-id`;
- validation error codes without form values;
- search result count and query length without query text;
- task attempt start, success, failure and abandonment;
- feedback length, never feedback text;
- application version and viewport class.

Every event carries:

- globally unique event ID;
- session, participant, study and task-attempt identity;
- application and schema version;
- source provenance: `real_user`, `automated` or `synthetic`;
- client timestamp and monotonically increasing sequence;
- route and stable semantic target where applicable.

Event-specific Zod schemas reject unknown properties. The client keeps a bounded
local outbox, batches up to 50 events, retries failed delivery and uses Beacon on
page exit when supported. Phase 9 adds the D1 ingestion endpoint.

## Deterministic parsing

Language models do not parse raw events. TypeScript and SQL reconstruct attempts
and calculate participant counts, completion, abandonment, duration, interaction
count, route transitions, navigation loops, validation errors, search dependency
and element usage.

Each detector has a stable rule ID and version. A friction signal contains the
rule, affected attempt IDs, supporting event IDs and a small anonymised trace.
The UI can navigate from a signal back to the exact source records.

The initial detectors are:

- `navigation_loop`: `A -> B -> A` within 30 seconds;
- `repeated_target`: three clicks on one target within two seconds;
- `task_abandonment`: no terminal event before session end or timeout;
- `excess_path_length`: interactions exceed the declared optimum by 50%;
- `validation_friction`: at least two errors in one attempt;
- `search_dependency`: search occurs in most successful attempts.

## Evidence pack and reasoning

An evidence pack is canonical JSON containing study boundaries, parser version,
source event count, application version, repository commit, task aggregates,
friction signals, supporting record references, mutable areas and protected
areas. Darwin stores its SHA-256 hash.

GPT-5.6 receives one compact evidence pack per cycle, not raw sessions. It may
return up to three candidates, must cite known evidence IDs for behavioural
claims, must mark impact as predicted, and must select one bounded mutation.
Darwin rejects unknown citations, protected scopes and malformed output. Results
are cached by evidence hash, prompt version and model.

Codex receives only the approved proposal, cited evidence, relevant repository
files, allowed paths and acceptance commands. A local controlled runner records
the input hashes, commit, diff, checks and machine-readable result. Cloudflare
never exposes arbitrary command execution.

The target per evolution cycle is one GPT-5.6 analysis call and one approved
Codex implementation run.

## Outcome language

Darwin presents evidence classes separately:

- `measured`: observed from a real human cohort;
- `automated`: observed from Playwright or deterministic replay;
- `predicted`: a model hypothesis awaiting measurement;
- `synthetic`: generated scale-replay data.

If an evolved human cohort is unavailable, Darwin shows the real baseline plus
automated workflow validation and explicitly states that improvement has not yet
been measured in users.

## Study target

The Build Week target is 8-15 anonymous participants completing three fixed tasks,
producing at least 20 task attempts and roughly 300-1,000 real events. The sample
is descriptive evidence for the product pipeline, not a claim of statistical
significance.

## Definition of done

- a real browser action creates an inspectable raw record;
- ordered records reconstruct an unambiguous task attempt;
- at least one deterministic signal links to supporting events;
- an evidence pack is generated and hashed;
- GPT-5.6 returns a schema-valid proposal citing real evidence IDs;
- Codex implements the approved mutation with a reproducible diff;
- validation results carry an honest evidence class;
- the fossil record preserves the complete provenance chain.

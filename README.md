# Darwin

> **Helping your software evolve.**

Darwin observes real application telemetry, reconstructs ordered user journeys,
identifies selection pressure, asks GPT-5.6 for a scored mutation portfolio, and
creates a constrained Codex implementation brief. Recommendations are always
grounded in measured evidence and remain human-approved.

## Local setup

```bash
git clone https://github.com/sjohnston1972/darwin.git
cd darwin
npm install
npm run dev
```

Local services:

- Darwin control room: `http://localhost:5173`
- ProjectFlow: `http://localhost:5174`
- ProjectFlow measured study: `http://localhost:5174/study`
- Worker API: `http://localhost:8787`

Configure live reasoning in `.env`:

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6
OPENAI_TIMEOUT_MS=60000
DARWIN_AI_MODE=live
DARWIN_REPOSITORY_COMMIT=local-development
```

Darwin fails closed when GPT is unavailable. It does not invent or substitute a
recommendation.

## Real telemetry

`packages/telemetry-client` captures privacy-safe semantic behavior from the
standalone ProjectFlow application:

- routes, stable `data-darwin-id` targets, searches, validation and task outcomes;
- hover start/end, duration, hover-to-click latency and hover without click;
- normalized click position, pointer type, rapid clicks and false affordances;
- target transitions, direction-change aggregates, drag intent and touch cancellation;
- browser Back/Forward use and relative browser zoom changes.

It does not store raw cursor trails, absolute page coordinates, typed values,
search text, arbitrary page text, or feedback content. Events are persisted in
Cloudflare D1 with an in-memory development repository.

The v1.2 evidence parser preserves up to 50 complete ordered journeys, derives
versioned friction signals, records recurrence across events/sessions/participants,
calculates an evidence coverage score, and produces a canonical SHA-256 evidence
hash. GPT does not participate in parsing.

## Live reasoning

GPT-5.6 receives:

- the evidence coverage assessment and its limitations;
- complete privacy-safe ordered journeys;
- traceable friction signals and recurrence counts;
- ProjectFlow goals, routes, capabilities, mutable areas, and protected areas;
- the actual ProjectFlow source and the 50-example evolution catalogue.

The model must reconstruct journeys, cluster related pressures, consider competing
explanations, and return one selected mutation plus two to five scored alternatives.
Darwin validates evidence IDs, observed targets, mutable scope, and normalizes
confidence against the server-derived evidence score. Each recommendation includes
tradeoffs and a measured validation plan.

The source/examples prefix is generated with `npm run context:generate`. A
context-hash-derived `prompt_cache_key` and 24-hour retention allow OpenAI prompt
caching. `npm run typecheck` rejects stale generated context.

## Dashboard telemetry

ProjectFlow's Activity, Capacity, and Upcoming dashboard tiles are functional
controls, not decoration. They use stable semantic target IDs and navigate to the
related project, report, task directory, or work view. Hover, focus, click, pointer,
rapid-click, false-affordance, and drag-intent behavior on those controls enters the
same ordered evidence stream as every other instrumented control.

## Scale simulator

`npm run simulate` creates exactly 10,000 seed-locked synthetic events for load and
determinism testing. Synthetic data is never used by the judge-facing reasoning
workflow and is never presented as measured product evidence.

## Verification

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run test:e2e:projectflow
```

`npm run validate:record` runs repository checks and regenerates the checked-in
source diff/validation artifact. Any recorded artifact is labelled as a repository
run, never live shell output from the Worker.

## Judge flow

1. Open ProjectFlow `/study` and interact with the imperfect baseline, including Activity, Capacity, or Upcoming controls.
2. Open Darwin and inspect the measured event stream.
3. Generate the hashed evidence pack and review ordered journeys, recurrence, and coverage limitations.
4. Select `Ask GPT-5.6` and inspect pressure clusters, competing explanations, the selected mutation, alternatives, and scorecards.
5. Prepare the constrained Codex manifest and review its evidence citations, path policy, acceptance criteria, and validation commands.
6. Implement only after human approval, run validation, and record the retained or rejected mutation in the fossil record.

## Deployment

- Control room: https://darwin-control-room.pages.dev
- ProjectFlow study: https://darwin-projectflow.pages.dev/study
- Worker API: https://darwin-api.stevie-johnston.workers.dev
- D1 database: `darwin-telemetry` (WEUR)

```bash
npm ci
npx wrangler secret put OPENAI_API_KEY --config workers/api/wrangler.toml
npm run deploy
npm run smoke:production
```

The Worker configuration binds D1, the ingestion rate limiter, allowed Pages
origins, GPT-5.6 live mode, and the repository revision used by Codex manifests.

## Repository map

- `apps/projectflow`: real target application and study telemetry view
- `apps/web`: Darwin control room
- `workers/api`: ingestion, evidence parsing, live reasoning, and persistence
- `packages/shared`: Zod contracts
- `packages/telemetry-client`: privacy-safe browser instrumentation
- `evolution examples`: concrete telemetry-to-mutation catalogue
- `prompts/evidence-analysis-v2.md`: live portfolio reasoning contract
- `docs/REAL_TELEMETRY_PLAN.md`: evidence boundary and provenance

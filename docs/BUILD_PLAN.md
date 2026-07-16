# Darwin Build Plan

Codex must update `docs/PROGRESS.md` after each phase with commands run, results and remaining issues.

## Phase 1 — Foundation
- initialise npm workspaces
- scaffold Vite React TypeScript app
- scaffold Cloudflare Worker
- configure shared package
- add lint, format, TypeScript and Vitest
- add health endpoint
- create premium shell UI

Verification:
```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Phase 2 — ProjectFlow organism
- baseline ProjectFlow UI
- evolved ProjectFlow UI
- shared realistic seed data
- variant toggle behind organism state
- intentionally visible baseline friction

Verification:
- both variants render
- routes work
- baseline and evolved screenshots differ clearly

## Phase 3 — Telemetry and simulation
- telemetry schemas
- seeded PRNG
- four persona definitions
- goal/path generator
- exactly 10,000 events
- aggregate friction metrics
- CLI command `npm run simulate`

Verification:
- same seed produces identical summary
- different seed changes paths
- event count is exactly 10,000

## Phase 4 — Fitness and analysis
- fitness calculator
- friction ranking
- mock evolution analyzer
- schema validation
- mutation proposal endpoint

Verification:
- baseline fitness lower than evolved fitness
- intended mutation ranks first
- malformed AI output fails safely

## Phase 5 — Darwin control room
- landing metrics
- observation animation
- selection pressure cards
- mutation proposal screen
- approve/reject workflow
- organism state transition

Verification:
- full mock demo works without API key
- reset restores initial state

## Phase 6 — GPT-5.6 integration
- OpenAI server adapter
- structured output prompt
- timeout and fallback
- response logging without secrets
- display whether mock or live mode is active

Verification:
- mock mode remains default
- live response matches schema
- failure falls back gracefully

## Phase 7 — Validation and fossil record
- actual tests/build command runner for local development
- hosted recorded validation fixture
- actual repository diff fixture
- before/after metrics
- evolution timeline

Verification:
- no fabricated command result labels
- timeline persists/reloads

## Phase 8 — Real telemetry foundation
- standalone functional ProjectFlow application
- three fixed study workflows and anonymous participant mode
- strict real-event contracts with attempt identity and provenance
- reusable browser telemetry client
- semantic `data-darwin-id` instrumentation
- durable browser outbox ready for Worker ingestion

Verification:
- ProjectFlow workflows create and retain real local state
- study attempts emit ordered, schema-valid events
- no raw form values or arbitrary page text enter telemetry
- existing Darwin simulation and control-room tests remain green

## Phase 9 — D1 ingestion and live traces
- telemetry batch endpoint with Zod validation and size limits
- D1 migrations, repository interfaces and in-memory fallback
- event deduplication and ordered session queries
- participant-specific seeded workspaces
- live raw-event and session-trace viewer

Verification:
- a browser interaction creates an inspectable D1 row
- duplicate event IDs are idempotent
- real, automated and synthetic sources remain separate

## Phase 10 — Deterministic evidence engine
- reconstruct task attempts from ordered events
- explicit friction detectors with rule versions
- supporting event IDs and anonymised traces
- canonical evidence-pack serialization and SHA-256 hashing
- detector and provenance tests

Verification:
- every signal links to supporting raw records
- identical inputs produce the same evidence hash
- no model call is required to parse events

## Phase 11 — Evidence-backed reasoning and Codex audit
- up to three candidate mutations with evidence citations
- one structured GPT-5.6 analysis call per evidence hash
- cross-reference and protected-scope validation
- cached analysis runs
- controlled local Codex implementation manifest

Verification:
- unknown evidence IDs and protected areas are rejected
- Codex receives the selected brief, not raw telemetry
- model and implementation inputs are reproducible

## Phase 12 — Outcome validation and demo choreography
- versioned baseline and evolved cohorts
- honest measured, predicted, automated and simulated labels
- before/after task metrics
- complete real-telemetry three-minute flow
- accessibility and error-recovery pass

Verification:
- baseline study evidence is real and inspectable
- automated results are never labelled as human outcomes
- demo completes without editing source

## Phase 13 — Cloudflare deployment and submission polish
- Pages projects for Darwin and ProjectFlow
- Worker deployment, D1 bindings and migrations
- CORS, secrets and environment configuration
- custom-domain documentation
- README setup and testing instructions
- architecture diagram
- sample data
- licence
- three-minute demo mode
- seed lock
- error recovery
- accessibility pass
- `/feedback` reminder in README

Verification:
- both public applications load
- reset, study ingestion and scale simulation work
- D1 restores state after Worker restarts
- secrets are absent from client bundles

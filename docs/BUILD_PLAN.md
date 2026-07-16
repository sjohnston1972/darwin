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

## Phase 8 — Cloudflare deployment
- Pages build configuration
- Worker deployment
- D1 migrations
- CORS and environment binding
- custom-domain documentation

Verification:
- public demo loads
- reset and simulation work
- secrets absent from client bundle

## Phase 9 — Submission polish
- README setup and testing instructions
- architecture diagram
- sample data
- licence
- three-minute demo mode
- seed lock
- error recovery
- accessibility pass
- `/feedback` reminder in README

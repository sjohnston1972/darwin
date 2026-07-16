# Darwin

> **Software that evolves.**

Darwin is an autonomous product engineer that observes how an application is used, identifies evolutionary pressure, proposes a controlled mutation, validates the change, and records the result in the application's fossil record.

**Demo thesis:**

> Darwin observed 10,000 user interactions and evolved the application.

## Start with Codex

```bash
unzip darwin-starter.zip
cd darwin-starter
cp .env.example .env
codex
```

Then give Codex this instruction:

```text
Read AGENTS.md, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md and docs/BUILD_PLAN.md. Build Phase 1 only. Run all verification commands before stopping, update docs/PROGRESS.md, and do not proceed to Phase 2 until Phase 1 passes.
```

## Intended commands

Codex should implement these workspace commands:

```bash
npm install
npm run dev
npm run simulate
npm run test
npm run build
npm run validate:record
npm run deploy
```

`npm run validate:record` runs the repository typecheck, tests, and production build, replays deterministic fitness, and regenerates the checked-in validation and ProjectFlow genome-diff artifact used by the hosted demo. The UI labels this evidence as a recorded repository run; the Worker never claims to execute shell commands in production.

`npm run dev` starts three local services:

- Darwin control room: `http://localhost:5173`
- standalone ProjectFlow: `http://localhost:5174`
- ProjectFlow study mode: `http://localhost:5174/study`
- Worker API: `http://localhost:8787`

## Real telemetry foundation

Real ProjectFlow study activity is Darwin's primary evidence source. The
standalone application has functional project and task state, three fixed study
tasks, anonymous participant IDs and stable `data-darwin-id` control identities.

`packages/telemetry-client` records only routes, semantic control IDs, validation
codes, search counts and explicit study outcomes. It does not record form values,
search text, arbitrary page text or feedback content. Events carry participant,
session, task-attempt, application-version and source provenance. The browser
delivers bounded batches to the Worker, which deduplicates and stores them through
a D1-compatible repository with an in-memory local fallback.

The existing 10,000-event generator is a separately labelled synthetic scale
replay. See `docs/REAL_TELEMETRY_PLAN.md` for the evidence and reasoning boundary.

Darwin can now generate a deterministic evidence pack from stored real events.
The pack reconstructs task attempts, applies versioned friction rules, links each
signal to supporting event IDs, and stores a canonical SHA-256 hash. No language
model participates in this parsing stage.

Evidence-backed reasoning is a separate, cached stage. Darwin sends the compact
evidence pack to GPT-5.6 at most once for each evidence-hash, model and prompt
version tuple, then validates every citation and requested mutation scope. The
default deterministic analyzer follows the identical contract. A selected
mutation can be exported as a hashed Codex implementation manifest containing
only the brief, evidence IDs, path policy and validation commands; raw telemetry
is never part of the Codex handoff.

## Evolution analyzer

Deterministic mock analysis is the default and requires no API key. To run the optional live GPT-5.6 analyzer locally, create `workers/api/.dev.vars`:

```dotenv
DARWIN_AI_MODE=live
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6
OPENAI_TIMEOUT_MS=12000
DARWIN_REPOSITORY_COMMIT=local-development
DARWIN_DEMO_SEED=1859
DARWIN_EVENT_COUNT=10000
```

Restart `npm run dev` after changing analyzer configuration. The control room labels every result as live, deterministic mock, or mock fallback. Live failures fall back automatically so the demo remains operable.

## Target deployment

- Web: Cloudflare Pages
- API: Cloudflare Workers
- Database: Cloudflare D1
- Domain: `darwin.clydeford.net` or `clydeford.net/darwin`
- repo: https://github.com/sjohnston1972/darwin

A subdomain is recommended because Cloudflare Pages/Workers routing is simpler:

```text
darwin.clydeford.net
```

## Repository contents

- `AGENTS.md` — authoritative Codex instructions
- `docs/PRODUCT_SPEC.md` — product requirements
- `docs/ARCHITECTURE.md` — technical design
- `docs/REAL_TELEMETRY_PLAN.md` — evidence, parsing and reasoning boundary
- `docs/BUILD_PLAN.md` — phased checklist
- `docs/DEMO_SCRIPT.md` — three-minute demo choreography
- `prompts/evolution-analysis.md` — GPT-5.6 system prompt
- `prompts/evidence-analysis-v1.md` — evidence-citing GPT-5.6 prompt v1.0.0
- `prompts/mutation-implementation.md` — Codex mutation brief template
- `.env.example` — local configuration
- `wrangler.toml.example` — Cloudflare configuration starter
- `scripts/bootstrap.sh` and `scripts/bootstrap.ps1` — local setup helpers

## Evidence language

Darwin distinguishes measured human evidence, automated validation, predicted
impact and synthetic scale replay. These categories must not be combined into a
single interaction count or presented as equivalent outcomes.

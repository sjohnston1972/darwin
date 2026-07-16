# Darwin

> **Software that evolves.**

Darwin is an autonomous product engineer that observes how an application is used, identifies evolutionary pressure, proposes a controlled mutation, validates the change, and records the result in the application's fossil record.

**Demo thesis:**

> Darwin observed 10,000 user interactions and evolved the application.

## Local setup

```bash
git clone https://github.com/sjohnston1972/darwin.git
cd darwin
npm install
npm run dev
```

The default mock analyzer needs no secret. Local services start at ports 5173,
5174 and 8787. Run the complete verification set with:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run test:e2e:projectflow
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
- evolved ProjectFlow study: `http://localhost:5174/study?variant=evolved`
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

The critical Playwright flow also runs the same assigned-task task against
versioned baseline and evolved cohorts using `source=automated`. It creates two
separate evidence packs and compares completion, duration and interaction count
through the Worker. The control room labels fresh results as a live automated run
and falls back to a checked-in, clearly labelled recorded automated run for a
reliable hosted demo. Neither is presented as a human outcome.

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

## Live deployment

- Darwin control room: https://darwin-control-room.pages.dev
- ProjectFlow study: https://darwin-projectflow.pages.dev/study
- Worker API: https://darwin-api.stevie-johnston.workers.dev
- Database: Cloudflare D1 `darwin-telemetry` in WEUR
- repo: https://github.com/sjohnston1972/darwin

### Deploy from this workspace

The committed Worker configuration binds D1, the native ingestion rate limiter,
the two allowed Pages origins and the repository revision used by Codex manifests.

```bash
npm ci
npm run deploy
npm run smoke:production
```

`npm run deploy` builds all workspaces, applies pending remote D1 migrations,
deploys the Worker, and direct-uploads both Vite builds to their Pages projects.
Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for non-interactive CI.
Use `npx wrangler secret put OPENAI_API_KEY --config workers/api/wrangler.toml`
only when enabling live GPT-5.6 mode; the default deployed mode is mock.

For custom domains, attach `darwin.clydeford.net` to the control-room Pages
project, `projectflow.clydeford.net` to ProjectFlow, and a Worker custom domain
such as `darwin-api.clydeford.net`. Update `ALLOWED_ORIGINS` in
`workers/api/wrangler.toml` and both production Vite environment files before
redeploying.

### Exact judge flow

1. Open ProjectFlow `/study` and complete **Find your assigned task** through Projects.
2. Open Darwin, inspect the ordered events, and generate the hashed evidence pack.
3. Generate the evidence-citing mutation and prepare the constrained Codex manifest.
4. Run the seed-locked 10,000-event synthetic scale replay.
5. Approve, validate and release the mutation through the control room.
6. Open ProjectFlow `/study?variant=evolved` and repeat the task through My Work.
7. Show the automated 8-to-4 interaction result and the survived fossil record.

If any step is interrupted, use the reset button in the control-room header. The
recorded validation and automated-outcome artifacts keep the demo operable
without shell access or an OpenAI key.

## Repository contents

- `AGENTS.md` — authoritative Codex instructions
- `docs/PRODUCT_SPEC.md` — product requirements
- `docs/ARCHITECTURE.md` — technical design
- `docs/REAL_TELEMETRY_PLAN.md` — evidence, parsing and reasoning boundary
- `docs/SAMPLE_DATA.md` — provenance-labelled example and recorded outcome
- `docs/BUILD_PLAN.md` — phased checklist
- `docs/DEMO_SCRIPT.md` — three-minute demo choreography
- `prompts/evolution-analysis.md` — GPT-5.6 system prompt
- `prompts/evidence-analysis-v1.md` — evidence-citing GPT-5.6 prompt v1.0.0
- `prompts/mutation-implementation.md` — Codex mutation brief template
- `.env.example` — local configuration
- `wrangler.toml.example` — Cloudflare configuration starter
- `LICENSE` — MIT licence
- `scripts/bootstrap.sh` and `scripts/bootstrap.ps1` — local setup helpers

## Evidence language

Darwin distinguishes measured human evidence, automated validation, predicted
impact and synthetic scale replay. These categories must not be combined into a
single interaction count or presented as equivalent outcomes.

## Submission reminder

After the Build Week submission is uploaded, post the public links and repository
in the event's `/feedback` channel and request one complete judge-flow replay.

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

## Evolution analyzer

Deterministic mock analysis is the default and requires no API key. To run the optional live GPT-5.6 analyzer locally, create `workers/api/.dev.vars`:

```dotenv
DARWIN_AI_MODE=live
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6
OPENAI_TIMEOUT_MS=12000
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
- `docs/BUILD_PLAN.md` — phased checklist
- `docs/DEMO_SCRIPT.md` — three-minute demo choreography
- `prompts/evolution-analysis.md` — GPT-5.6 system prompt
- `prompts/mutation-implementation.md` — Codex mutation brief template
- `.env.example` — local configuration
- `wrangler.toml.example` — Cloudflare configuration starter
- `scripts/bootstrap.sh` and `scripts/bootstrap.ps1` — local setup helpers

## Important constraint

The starter deliberately contains specifications rather than a prebuilt product. The goal is to preserve the majority of core implementation work inside your Codex session for the required `/feedback` session ID.

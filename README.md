# Darwin

> **Helping your software evolve.**

Darwin turns privacy-safe application telemetry into a controlled, reviewable
repository change. It reconstructs real user journeys, asks GPT-5.6 to reason
over measured evidence and the exact target source commit, then dispatches a
constrained Codex run that validates its work and opens a pull request.

Darwin does not contain an evolved ProjectFlow variant or a recorded mutation.
Until a live manifest is executed, there is no candidate version to display.

## Repositories

| Repository | Responsibility | Production |
| --- | --- | --- |
| [`sjohnston1972/darwin`](https://github.com/sjohnston1972/darwin) | Control room, telemetry API, evidence parsing, GPT reasoning and GitHub orchestration | [Control room](https://darwin-control-room.pages.dev) |
| [`sjohnston1972/projectflow`](https://github.com/sjohnston1972/projectflow) | Instrumented target application and the Codex mutation workflow | [ProjectFlow](https://sjohnston1972.github.io/projectflow/) |

The immutable ProjectFlow commit SHA and a hash of its reasoning context are
stored with every analysis. A manifest cannot execute against a different
commit.

## Proof Loop

```text
ProjectFlow interaction
  -> validated semantic event in D1
  -> deterministic evidence pack with EV citations
  -> GPT-5.6 pressure clusters and mutation candidates
  -> human-selected manifest
  -> GitHub Actions + Codex source edit
  -> protected-path and change-budget checks
  -> real npm validation
  -> pull request and GitHub Pages preview
  -> human release
  -> merged commit in the fossil record
```

Reset dispatches the target repository's reset workflow, restores the tagged
`demo-baseline` source, redeploys it, and clears Darwin telemetry, evidence,
analyses, manifests and execution history.

## Local Development

```powershell
git clone https://github.com/sjohnston1972/darwin.git
git clone https://github.com/sjohnston1972/projectflow.git
cd darwin
npm install
npm run dev
```

Local services:

- Darwin control room: `http://localhost:5173`
- Worker API: `http://localhost:8787`
- ProjectFlow runs separately from `..\projectflow` with `npm run dev`

Create `.env` in Darwin:

```dotenv
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.6
OPENAI_TIMEOUT_MS=60000
DARWIN_AI_MODE=live
GITHUB_TOKEN=github_fine_grained_token
DARWIN_CALLBACK_TOKEN=a_shared_random_secret
PROJECTFLOW_REPOSITORY=sjohnston1972/projectflow
PROJECTFLOW_BRANCH=main
PROJECTFLOW_PRODUCTION_URL=https://sjohnston1972.github.io/projectflow/
PROJECTFLOW_STUDY_URL=https://sjohnston1972.github.io/projectflow/?study=true
```

The GitHub token needs Actions read/write and pull-request/content permissions
for ProjectFlow. Install `OPENAI_API_KEY` and the same
`DARWIN_CALLBACK_TOKEN` as ProjectFlow Actions secrets. Secrets are never put in
the manifest or sent to the browser.

## Telemetry

`packages/telemetry-client` captures semantic behavior, including routes,
stable target IDs, workflow outcomes, hover duration, hover without click,
hover-to-click latency, false affordances, repeated clicks, pointer type,
normalized click position, pointer transitions, direction changes, drag intent,
touch cancellation, browser Back/Forward use and relative zoom changes.

It never captures typed values, search text, keystrokes, arbitrary page text,
absolute screen coordinates or raw cursor trails. The evidence parser is
deterministic and GPT is not involved until after a hashed evidence pack exists.

The scale replay remains available as a separate engineering check:

```powershell
npm run simulate -- --seed=1859 --variant=baseline
```

It creates exactly 10,000 seeded events. Synthetic events are rejected by the
real telemetry ingestion endpoint and cannot become live evidence.

## Validation

```powershell
npm run typecheck
npm test
npm run build
```

ProjectFlow's workflow independently runs `npm run verify` after Codex writes a
patch. It also rejects protected paths, workflow changes, excessive file or line
counts and a base SHA that no longer matches the manifest.

## Deployment

Authenticate Wrangler, configure Worker secrets, apply D1 migrations, then
deploy the API and control room:

```powershell
npx wrangler secret put OPENAI_API_KEY --config workers/api/wrangler.toml
npx wrangler secret put GITHUB_TOKEN --config workers/api/wrangler.toml
npx wrangler secret put DARWIN_CALLBACK_TOKEN --config workers/api/wrangler.toml
npm run deploy:migrate
npm run deploy:api
npm run deploy:web
```

ProjectFlow deploys from its own `main` branch through GitHub Pages. Candidate
branches receive a separate Pages preview only after repository validation
passes.

## Three-Minute Demo

1. Click **Open measured study**, use ProjectFlow, and return to Darwin.
2. Inspect the full event trace and generate the evidence pack.
3. Click **Ask GPT-5.6** and expand the ranked pressure clusters.
4. Select one or more mutation candidates and create the manifest.
5. Start controlled evolution and open the live GitHub Actions run.
6. Review the actual diff, checks, Codex summary, pull request and preview.
7. Release the reviewed mutation; Darwin records the merged commit.

No source edit or variant switch is performed manually during this flow.

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
| [`sjohnston1972/projectflow`](https://github.com/sjohnston1972/projectflow) | Instrumented target application and the Codex mutation workflow | [ProjectFlow](https://darwin-projectflow.pages.dev/) |

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
  -> pull request and isolated Cloudflare Pages preview
  -> human release
  -> merged commit in the fossil record
```

Reset dispatches the target repository's reset workflow, restores the tagged
`demo-baseline-v2` source, redeploys it, and clears Darwin telemetry, evidence,
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
PROJECTFLOW_PRODUCTION_URL=https://darwin-projectflow.pages.dev/
PROJECTFLOW_STUDY_URL=https://darwin-projectflow.pages.dev/?study=true
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

ProjectFlow deploys from its own `main` branch to Cloudflare Pages. Candidate
branches receive immutable Cloudflare preview deployments only after repository
validation passes. The preview URL returned by Cloudflare is stored with the
Darwin execution and never replaces production before release.

## Three-Minute Demo

1. Open **Target application**, connect `sjohnston1972/projectflow`, and show
   the verified GitHub commit, target contract, Cloudflare runtime and study.
2. Click **Open measured study**, use ProjectFlow, and return to Darwin.
3. Inspect the full event trace and generate the evidence pack.
4. Click **Ask GPT-5.6** and expand the ranked pressure clusters.
5. Select one or more mutation candidates and create the manifest.
6. Start controlled evolution and open the live GitHub Actions run.
7. Review the diff, checks, Codex summary and Cloudflare preview, then release
   the mutation so Darwin records the merged commit.

No source edit or variant switch is performed manually during this flow.

# Getting Started

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Git
- Wrangler authentication for Cloudflare work
- OpenAI and GitHub credentials only when testing live reasoning/execution

## Clone both repositories

Darwin and ProjectFlow are independent repositories. Place them beside each other:

```powershell
mkdir C:\codex
cd C:\codex
git clone https://github.com/sjohnston1972/darwin.git
git clone https://github.com/sjohnston1972/projectflow.git
```

## Install Darwin

```powershell
cd C:\codex\darwin
npm install
Copy-Item .env.example .env
```

The minimum local `.env` is:

```dotenv
DARWIN_AI_MODE=live
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
OPENAI_LAB_AGENT_MODEL=gpt-5.6-luna
OPENAI_TIMEOUT_MS=60000
VITE_API_BASE_URL=http://localhost:8787
VITE_PROJECTFLOW_BASE_URL=http://localhost:5174
```

Collection and evidence generation work without an OpenAI key. Live mutation reasoning fails closed until the key is present.

## Start Darwin

```powershell
npm run dev
```

This starts:

- control room at `http://localhost:5173`;
- Worker API at `http://localhost:8787`.

## Start ProjectFlow

In a second shell:

```powershell
cd C:\codex\projectflow
npm install
npm run dev
```

Use the URL printed by ProjectFlow, normally `http://localhost:5174`.

## Verify the workspace

```powershell
cd C:\codex\darwin
npm run lint
npm run typecheck
npm run test
npm run build
```

## First measured cycle

1. Open Darwin and select **Target application**.
2. Verify the configured ProjectFlow repository and local/remote study URL.
3. Open the measured study.
4. Interact with semantic targets and complete or abandon a task attempt.
5. Return to **Observations** and wait for the event count to update.
6. Generate evidence.
7. Open **Mutations** and invoke GPT when configured.

Local in-memory persistence is used when no D1 binding is supplied. Restarting the Worker clears that state.

## First Darwin Lab population

1. Start Darwin and ProjectFlow locally.
2. Open **Darwin Lab**, define a task against the verified ProjectFlow version (for example, reach **My work** from the dashboard), and save the draft.
3. Queue the population.
4. From the Darwin repository, run `npm run lab:runner`.
5. Watch the automated population touch the real target, then inspect its action replay, raw telemetry IDs, and deterministic `L-EV-*`
   evidence populate in the Lab section.
6. When live reasoning is configured, run the single population analysis and
   approve an implementation brief. Prepare the normal Codex manifest to continue through diff, validation, PR, preview, and human release.

The runner uses `gpt-5.6-luna` by default for inexpensive per-action decisions.
The population-level analysis continues to use `gpt-5.6`. Both integrations
fail closed without `OPENAI_API_KEY`. Only targets in
`DARWIN_LAB_ALLOWED_ORIGINS` are accepted; the default is local ProjectFlow.

## Deterministic scale replay

```powershell
npm run simulate -- --seed=1859 --variant=baseline
```

The simulator always produces 10,000 events for the configured variant. It does not populate the real measured study.

# Darwin — Codex Build Instructions

## Mission
Build **Darwin**, an autonomous software evolution engine for the OpenAI Build Week hackathon.

Darwin observes application telemetry, identifies product friction, proposes a mutation, applies a controlled code change, validates it, and records the result in an evolutionary timeline.

Primary vision line:

> Darwin observed 10,000 user interactions and evolved the application.

## Core principle
Do not attempt to build a general-purpose autonomous platform. Build a polished, credible proof of life that demonstrates one complete evolution cycle.

## Required demo loop
1. Show a functional, instrumented ProjectFlow application.
2. Perform a real study task and show the resulting raw telemetry record.
3. Parse real study events into deterministic friction signals and an evidence pack.
4. Ask GPT-5.6 for one structured proposal that cites evidence IDs.
5. Show a controlled Codex implementation with a real repository diff.
6. Run validation checks and clearly identify automated versus human evidence.
7. Review and merge the generated ProjectFlow pull request.
8. Record the evidence hash, real commits and deployment in the fossil record.

The 10,000-event simulation remains an explicitly labelled scale replay. It is
not the primary evidence that Darwin works and must never be presented as real
user telemetry.

## Product language
Use the biological metaphor consistently but professionally:
- source code: genome
- code change: mutation
- measured UX/business outcome: fitness
- telemetry patterns: selection pressure
- retained change: survived selection
- rejected change: failed selection
- version history: fossil record

Avoid claiming unsupervised production deployment. The MVP is controlled and human-approved.

## Technology constraints
- Monorepo using npm workspaces.
- TypeScript throughout.
- React + Vite for the web application.
- Cloudflare Workers for the API.
- Cloudflare D1-compatible persistence where practical; provide an in-memory/local fallback.
- Tailwind CSS for styling.
- Vitest for unit tests.
- Playwright for the critical demo flow if time permits.
- Zod for validation and shared contracts.
- OpenAI API integration that fails closed when live reasoning is unavailable.

## Architecture
- `apps/web`: Darwin control room and external target launcher.
- `../projectflow`: separately versioned target repository and deployment.
- `workers/api`: telemetry, simulation, analysis, mutation and timeline API.
- `packages/shared`: schemas and shared types.
- `packages/telemetry-client`: privacy-conscious browser instrumentation SDK.
- `prompts`: versioned GPT-5.6 prompts.
- `docs`: PRD, architecture and demo script.

## MVP boundaries
Implement only:
- one organism: ProjectFlow
- one tagged ProjectFlow baseline and live repository mutations
- four deterministic personas
- evidence-led mutations selected from live GPT reasoning
- one mutation approval workflow
- one fitness model
- one fossil-record timeline
- one real ProjectFlow usability study with three fixed tasks
- real and synthetic telemetry stored and displayed as separate evidence classes

Do not build:
- arbitrary repositories beyond the configured ProjectFlow target
- autonomous production deployment
- multi-tenant billing
- real-user identity or enterprise authentication
- generic visual editor
- thousands of LLM-powered agents

## Demo application: ProjectFlow
Baseline problems must be visible:
- dashboard overloaded with low-value widgets
- tasks hidden behind Projects
- search buried inside the Tasks page
- Reports as a separate low-usage top-level route
- task creation takes too many clicks

No evolved version is checked into Darwin. Codex creates a candidate branch in
the ProjectFlow repository from the selected live manifest. A candidate exists
only after that workflow produces a real commit.

## Telemetry
Real instrumentation is the primary proof path:

```text
browser action -> validated raw record -> deterministic detector
-> hashed evidence pack -> evidence-citing proposal -> controlled mutation
```

Capture only semantic identifiers and task outcomes. Never capture keystrokes,
raw form values, arbitrary page text, names, email addresses or passwords. Every
real event must include an anonymous participant, session, task-attempt identity,
application version, schema version and source provenance.

Generate exactly 10,000 deterministic events from a seeded simulation only for
the separately labelled scale-replay mode.
Personas:
- project manager
- developer
- executive
- administrator

Event types:
- page_view
- click
- search
- workflow_started
- workflow_completed
- workflow_abandoned
- validation_error
- backtrack

The simulation must produce evidence supporting the intended mutation without
hard-coding the final prose. Synthetic events must never be mixed into real-user
counts, cohorts or measured fitness.

## Selection model
Keep deterministic evidence quality separate from GPT preference. Candidate
scores must cite observed EV records, state confidence, tradeoffs and a measured
validation plan. Do not predict or display invented post-mutation fitness.

## AI integration
Call GPT-5.6 only after a deterministic evidence pack exists. Include the exact
ProjectFlow repository policy and approved source context from an immutable SHA.
Require structured JSON matching `EvidenceAnalysisSchema`; reject unavailable,
invalid or unsupported recommendations instead of substituting mock prose.

## Codex integration story
The repository itself is built with Codex. Also include a controlled mutation workflow:
- proposal produces an implementation brief
- the Worker dispatches ProjectFlow's authenticated GitHub Actions workflow
- `openai/codex-action` produces a patch in a read-only-content job
- repository policy gates the patch before a write job creates a commit
- UI displays only the actual GitHub diff, checks, pull request and preview

Do not fake shell output, diffs, versions, validation or fitness. Displayed
repository results must come from the current GitHub execution.

## Design direction
- dark, technical, premium visual language
- restrained biological motifs
- no cartoon DNA imagery
- high contrast and excellent typography
- timeline, metric cards and code diffs should feel cinematic in a 3-minute video
- primary landing statement: “Software that evolves.”

## Definition of done
- `npm install` succeeds.
- `npm run dev` starts web and API locally.
- `npm run simulate` creates 10,000 events.
- a browser action in standalone ProjectFlow creates an inspectable real event.
- deterministic parsing links every friction signal to supporting event IDs.
- GPT-5.6 proposals cite only evidence IDs present in the hashed evidence pack.
- `npm run test` passes.
- `npm run build` passes.
- the complete demo can be performed without editing source during the presentation.
- README includes Cloudflare deployment instructions and exact demo steps.

## Implementation sequence
1. Scaffold workspace and shared schemas.
2. Establish ProjectFlow as a separate tagged baseline repository.
3. Build seeded telemetry simulation.
4. Build fitness calculation and analysis summary.
5. Add live, evidence-citing GPT-5.6 reasoning.
6. Add repository snapshot and prompt-caching context.
7. Build Darwin control room and timeline.
8. Build ProjectFlow's Codex, validation, pull-request and preview workflow.
9. Add D1 ingestion and live session traces.
10. Add deterministic evidence generation and provenance.
11. Add evidence-citing GPT-5.6 analysis and Codex audit manifests.
12. Run before/after validation and polish the real-telemetry demo.
13. Deploy to Cloudflare and complete submission documentation.

When uncertain, optimise for a strong, reliable three-minute demo rather than platform breadth.

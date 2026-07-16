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
7. Switch ProjectFlow from the original variant to the evolved variant.
8. Record the mutation, evidence hash and outcome in the fossil record.

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
- OpenAI API integration behind an interface with a deterministic mock mode.

## Architecture
- `apps/web`: Darwin control room and embedded organism preview.
- `apps/projectflow`: standalone functional ProjectFlow study application.
- `workers/api`: telemetry, simulation, analysis, mutation and timeline API.
- `packages/shared`: schemas and shared types.
- `packages/telemetry-client`: privacy-conscious browser instrumentation SDK.
- `prompts`: versioned GPT-5.6 prompts.
- `docs`: PRD, architecture and demo script.

## MVP boundaries
Implement only:
- one organism: ProjectFlow
- two UI variants: baseline and evolved
- four deterministic personas
- one main mutation: promote global task search and simplify navigation
- one mutation approval workflow
- one fitness model
- one fossil-record timeline
- one real ProjectFlow usability study with three fixed tasks
- real and synthetic telemetry stored and displayed as separate evidence classes

Do not build:
- arbitrary GitHub repository ingestion
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

Evolved version:
- global search promoted to the top bar
- `My Work` becomes a primary navigation item
- Reports moves into `Insights`
- quick-create task action is globally available
- dashboard becomes a concise work summary

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

## Fitness model
Expose a score from 0–100 derived from:
- task completion rate: 35%
- navigation efficiency: 25%
- error rate: 15%
- feature discovery: 15%
- median task duration: 10%

Show baseline and evolved values. Keep the calculations deterministic and documented.

## AI integration
Create an `EvolutionAnalyzer` interface with:
- `MockEvolutionAnalyzer`: deterministic and available by default.
- `OpenAIEvolutionAnalyzer`: calls GPT-5.6 when `OPENAI_API_KEY` is configured.

Require structured JSON output matching the shared `MutationProposal` Zod schema.

The live application must remain fully demoable without an API key.

## Codex integration story
The repository itself is built with Codex. Also include a controlled mutation workflow:
- proposal produces an implementation brief
- implementation changes a feature flag/configurable variant or applies a small source patch
- UI displays the generated diff or a checked-in demo diff
- validation scripts run against both variants

Do not fake shell output. Any displayed validation result must be generated by actual scripts or clearly labelled as a recorded Build Week run.

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
2. Build baseline/evolved ProjectFlow variants.
3. Build seeded telemetry simulation.
4. Build fitness calculation and analysis summary.
5. Add mock mutation proposal.
6. Add optional GPT-5.6 analyzer.
7. Build Darwin control room and timeline.
8. Build standalone ProjectFlow, study mode and the telemetry client.
9. Add D1 ingestion and live session traces.
10. Add deterministic evidence generation and provenance.
11. Add evidence-citing GPT-5.6 analysis and Codex audit manifests.
12. Run before/after validation and polish the real-telemetry demo.
13. Deploy to Cloudflare and complete submission documentation.

When uncertain, optimise for a strong, reliable three-minute demo rather than platform breadth.

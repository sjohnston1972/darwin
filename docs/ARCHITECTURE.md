# Darwin Technical Architecture

## System overview

```text
React Web App
├── Darwin Control Room
├── ProjectFlow Baseline/Evolved Organism
├── Observation Visualisation
├── Mutation Viewer
├── Diff + Validation Viewer
└── Fossil Record
        │
        ▼
Cloudflare Worker API
├── Simulation service
├── Telemetry aggregation
├── Fitness calculator
├── Evolution analyzer interface
│   ├── deterministic mock
│   └── OpenAI GPT-5.6 adapter
├── Mutation workflow
└── Timeline persistence
        │
        ▼
Cloudflare D1 or local in-memory adapter
```

## Workspace layout

```text
apps/web
workers/api
packages/shared
prompts
docs
scripts
```

## Shared contracts
Create Zod schemas for:
- `TelemetryEvent`
- `Persona`
- `SimulationRun`
- `FrictionFinding`
- `MutationProposal`
- `ValidationResult`
- `FitnessBreakdown`
- `EvolutionRecord`

## API routes

```text
GET  /api/health
POST /api/demo/reset
POST /api/simulations
GET  /api/simulations/:id
GET  /api/simulations/:id/summary
POST /api/evolution/analyse
POST /api/mutations/:id/approve
POST /api/mutations/:id/reject
POST /api/mutations/:id/validate
POST /api/mutations/:id/release
GET  /api/evolution/timeline
GET  /api/organism/state
POST /api/organism/state
```

## Deterministic simulation
Use a seeded PRNG. Simulate sessions from four personas and predefined goals. Generate event sequences probabilistically but deterministically.

The baseline route graph should induce:
- developer users entering Projects before Tasks
- repeated backtracking
- high search use once Tasks is reached
- low Reports usage
- dashboard widget neglect
- avoidable task creation clicks

The evolved route graph should produce more direct paths and lower duration/error values.

## Fitness calculation
Normalise each metric to 0–100, then calculate:

```text
fitness =
  completion_rate * 0.35 +
  navigation_efficiency * 0.25 +
  inverse_error_rate * 0.15 +
  feature_discovery * 0.15 +
  inverse_task_duration * 0.10
```

Document baseline constants and thresholds. Avoid arbitrary unexplained numbers.

Implemented normalisation:

- `completion_rate`: observed completed workflows divided by completed plus abandoned workflows.
- `navigation_efficiency`: starts at the ideal one-page direct path and applies a diminishing reciprocal penalty of `0.35` for each additional page view plus `1.2` for each backtrack. A reversal is intentionally weighted more heavily than a forward navigation step.
- `inverse_error_rate`: percentage of workflow sessions without a validation error.
- `feature_discovery`: completion rate for discovery-sensitive goals: finding assigned tasks, creating a task and reviewing reports.
- `inverse_task_duration`: reciprocal duration score using 90 seconds as the reference point; a 90-second median scores 50, faster workflows approach 100 and slower workflows decline smoothly.

All component scores are clamped to 0–100 and rounded to one decimal place before being exposed. The weighted total uses the product-specified 35/25/15/15/10 proportions.

## AI boundary
The browser never calls OpenAI directly.

`EvolutionAnalyzer`:

```ts
interface EvolutionAnalyzer {
  analyse(input: EvolutionAnalysisInput): Promise<MutationProposal>;
}
```

The API chooses mock or OpenAI implementation based on environment variables.

## Mutation implementation
For MVP reliability, implement two complementary paths:

1. **Recorded real mutation**
   - During development, Codex creates the evolved variant.
   - Store the actual Git diff in a fixture generated from the repository.
   - Display it during the demo.

2. **Live implementation brief**
   - GPT-5.6 proposal is converted into a Codex-ready task.
   - Expose copy/download functionality.

Optional stretch: invoke Codex CLI in a local-only orchestration script, never from Cloudflare production.

## Persistence
Use repository interfaces so D1 and in-memory implementations share behaviour.

Tables:
- simulation_runs
- telemetry_events or aggregated_metrics
- mutation_proposals
- validation_results
- evolution_records
- organism_state

For the hosted demo, storing aggregates rather than all 10,000 events is acceptable, while the UI still truthfully reports the generated count.

## Security
- OpenAI key only in Worker secrets.
- Validate every AI response with Zod.
- Reject proposals outside an allow-listed mutation scope.
- Do not expose arbitrary code execution in production.
- Escape code diff content before rendering.

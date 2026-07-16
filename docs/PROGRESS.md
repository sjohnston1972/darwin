# Progress Log

Codex: append one entry per completed phase.

## Current state
- Phase 1 foundation complete.
- Phase 2 ProjectFlow organism complete.
- Phase 3 telemetry and simulation complete.
- Phase 4 fitness and analysis complete.
- Phase 5 not started.

### Phase 1 — Foundation
Date: 2026-07-16

Completed:
- Initialised npm workspaces for `apps`, `workers`, and `packages`.
- Scaffolded the Vite React TypeScript web application and responsive Darwin control-room shell.
- Scaffolded the Cloudflare Worker with a typed `GET /api/health` endpoint and structured 404 responses.
- Created the shared Zod contracts package for telemetry, simulation, mutation, validation, fitness, and evolution records.
- Added TypeScript, ESLint, Prettier, Tailwind CSS, Vitest, and root workspace commands.
- Added shared-contract, API-route, and React-shell tests.
- Verified the live Vite and Wrangler development servers at `http://localhost:5173` and `http://localhost:8787`.

Verification commands:
```bash
npm install
npm run typecheck
npm run test
npm run build
npm run lint
npm run format:check
```

Results:
- `npm install`: passed; 383 packages audited with 0 vulnerabilities.
- `npm run typecheck`: passed across shared, API, and web workspaces.
- `npm run test`: passed; 3 test files and 5 tests.
- `npm run build`: passed; shared TypeScript output, Wrangler dry-run bundle, and Vite production bundle generated.
- `npm run lint`: passed with 0 warnings.
- `npm run format:check`: passed for maintained source and configuration files.
- Live smoke test: web returned HTTP 200 and the API returned a schema-valid `darwin-api` health response.

Known issues:
- None within Phase 1 scope. Simulation, organism variants, and active observation controls are intentionally deferred to later phases.

Next phase:
- Phase 2 — ProjectFlow organism.

### Phase 2 — ProjectFlow organism
Date: 2026-07-16

Completed:
- Added one shared, realistic ProjectFlow dataset with four projects, seven seeded tasks, team members, deadlines, status, priority, and activity records.
- Built a route-capable baseline organism with Dashboard, Projects, Tasks, Reports, and Settings.
- Made baseline friction visible through a seven-widget dashboard, task search buried in the Tasks route, a top-level Reports route, and task creation behind project drill-down.
- Built the evolved organism with My Work, Projects, Insights, persistent global search, and globally available quick task creation.
- Added working project drill-down, task search, task composition, route changes, and settings views.
- Added a Darwin organism-state toggle for baseline `v1.0` and evolved candidate `v1.1`.
- Added reproducible full-screen organism views using `?view=organism&variant=baseline` and `?view=organism&variant=evolved`.
- Updated the control-room genome metadata, comparison summary, and fossil record.
- Corrected the web typecheck command so it traverses both referenced TypeScript projects.

Verification commands:
```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Results:
- `npm run typecheck`: passed across shared, API, and both web TypeScript projects.
- `npm run test`: passed; 4 test files and 7 tests.
- `npm run lint`: passed with 0 warnings.
- `npm run format:check`: passed for maintained source and configuration files.
- `npm run build`: passed; shared output, Wrangler dry-run bundle, and Vite production bundle generated.
- Route verification: baseline Tasks, Projects, project drill-down, and evolved My Work workflows passed interaction tests.
- Workflow verification: evolved global quick-create produced a new assigned task in My Work.
- Visual verification: baseline and evolved captures at 1440x900 differ clearly; the evolved organism also passed a compact 500x900 capture without overlap.

Known issues:
- Fitness values and telemetry remain intentionally unavailable until Phases 3 and 4.

Next phase:
- Phase 3 — Telemetry and simulation.

### Phase 3 — Telemetry and simulation
Date: 2026-07-16

Completed:
- Extended shared Zod contracts with organism variants, workflow goals, telemetry event types, simulation requests, raw metrics, friction signals, summaries, and results.
- Added a deterministic seeded PRNG and four weighted persona definitions: project manager, developer, executive, and administrator.
- Added probabilistic but deterministic goal selection and baseline/evolved route graphs.
- Generated complete workflow sequences containing page views, clicks, searches, starts, completions, abandonments, validation errors, and backtracks.
- Guaranteed exactly 10,000 timestamped events across a deterministic six-month observation window.
- Aggregated persona, event type, goal, route, completion, abandonment, navigation, backtrack, search, validation, and duration metrics from raw events.
- Added deterministic event-stream fingerprints for replay verification.
- Implemented `npm run simulate` with `--seed`, `--variant`, and `--json` options.
- Added `POST /api/simulations`, `GET /api/simulations/:id`, and `GET /api/simulations/:id/summary` with local in-memory run storage.
- Added schema-safe malformed request handling and updated Worker CORS methods.

Verification commands:
```bash
npm install
npm run simulate
npm run simulate -- --seed=1859 --variant=evolved
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Results:
- `npm install`: passed; 384 packages audited with 0 vulnerabilities.
- Baseline seed `1859`: exactly 10,000 events, 845 workflow sessions, fingerprint `448efd59`.
- Repeated baseline seed `1859`: identical summary and full event stream.
- Different seed `2026`: different route sample and event fingerprint.
- Evolved seed `1859`: exactly 10,000 events, 1,912 workflow sessions, fingerprint `959d7a64`.
- Derived completion increased from 79.3% baseline to 94.5% evolved.
- Derived page views fell from 5.18 to 2.04 per workflow; backtracks fell from 0.59 to 0.03; median duration fell from 76.3s to 29.9s.
- Live Worker API created and retrieved `sim-baseline-1859` with the same event count, fingerprint, session count, and completion rate as the CLI.
- `npm run typecheck`: passed across shared, API, and both web TypeScript projects.
- `npm run test`: passed; 5 test files and 13 tests.
- `npm run lint` and `npm run format:check`: passed.
- `npm run build`: passed; Wrangler dry-run Worker bundle and Vite production bundle generated.

Known issues:
- Simulation runs are intentionally held in memory and reset when the local Worker restarts; D1 persistence remains scheduled for Phase 8.
- Observation animation and control-room simulation controls remain scheduled for Phase 5.

Next phase:
- Phase 4 — Fitness and analysis.

### Phase 4 — Fitness and analysis
Date: 2026-07-16

Completed:
- Added shared schemas for fitness comparisons, evolution analysis requests, and complete analysis responses.
- Implemented the product-specified weighted fitness model: completion 35%, navigation efficiency 25%, inverse error rate 15%, feature discovery 15%, and inverse task duration 10%.
- Documented navigation and duration normalisation constants in `docs/ARCHITECTURE.md`.
- Derived fitness components from raw workflow events and simulation aggregates rather than fixture scores.
- Added evidence-based friction ranking for assigned-task discovery, task creation, dashboard overhead, and report discovery.
- Added the `EvolutionAnalyzer` interface and deterministic `MockEvolutionAnalyzer`.
- Added strict mutation proposal validation with a typed `EvolutionAnalysisError` for malformed output.
- Aligned the versioned evolution-analysis prompt with the shared `MutationProposal` schema.
- Added `POST /api/evolution/analyse`, which replays baseline and evolved variants for the same seed and returns fitness, ranked findings, and exactly one proposal.
- Updated API health version to `0.4.0`.

Verification commands:
```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Results:
- Baseline seed `1859` fitness: 66.6.
- Evolved seed `1859` fitness: 87.4, a derived gain of 20.8 points.
- `Assigned tasks are difficult to locate` ranked first with impact 100 and confidence 0.86.
- Mock analysis returned one schema-valid `Promote global task discovery` proposal with the calculated fitness gain.
- Malformed mutation output raised a safe typed validation error.
- Live Worker simulation-to-analysis flow returned the same fitness, ranking, proposal, and mock-mode metadata as unit tests.
- `npm run typecheck`, `npm run lint`, and `npm run format:check`: passed.
- `npm run test`: passed; 6 test files and 18 tests across all workspaces.
- `npm run build`: passed for shared TypeScript, Wrangler dry-run, and Vite production output.

Known issues:
- The deterministic mock analyzer remains the only active analyzer; the optional OpenAI adapter is scheduled for Phase 6.
- Analysis results are exposed through the API but not yet orchestrated by the control-room UI; that workflow is scheduled for Phase 5.

Next phase:
- Phase 5 — Darwin control room.

### Phase 5 — Darwin control room
Date: 2026-07-16

Completed:
- Added shared schemas for simulation creation, organism state, mutation decisions, and deterministic demo reset responses.
- Added in-memory mutation and organism state alongside the existing local simulation store.
- Added `GET /api/organism/state`, `POST /api/mutations/:id/approve`, `POST /api/mutations/:id/reject`, and `POST /api/demo/reset`.
- Enforced exactly one explicit human decision per proposal; repeated decisions return `409` and unknown proposals return `404`.
- Activated the `Observe 10,000 interactions` workflow with a deterministic seed and an animated event counter driven by the real simulation response.
- Added truthful aggregate telemetry, persona distribution, workflow completion, navigation, and backtrack displays.
- Added ranked selection-pressure findings and a structured mutation proposal with implementation scope and predicted fitness comparison.
- Added approve/reject controls, authoritative organism transition to ProjectFlow `v1.1`, and baseline retention after rejection.
- Added a deterministic reset control that clears the complete local evolution cycle and restores ProjectFlow `v1.0`.
- Updated control-room metrics, system status, organism preview, and fossil-record summary to reflect the active state.
- Updated API health and dashboard version labels to `0.5.0`.

Verification commands:
```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Results:
- Live Worker flow generated exactly 10,000 events, ranked assigned-task discovery first, proposed one mutation, approved it, and returned ProjectFlow `v1.1` with one evolution cycle.
- Baseline and evolved fitness remained deterministic at 66.6 and 87.4, a gain of 20.8 points.
- Approval activated the evolved organism; rejection retained the baseline; reset removed the proposal and restored `v1.0`.
- Unit and component coverage passed across 6 test files and 21 tests.
- Two Chrome Playwright smoke flows passed for the complete approval path at 1440×900 and 390×844.
- Wide and mobile screenshots confirmed readable telemetry, proposal, approval, and organism states without layout collisions.

Known issues:
- The optional GPT-5.6 analyzer remains scheduled for Phase 6; mock mode is intentionally the default.
- Validation output, the repository diff viewer, and the persistent fossil-record timeline remain scheduled for Phase 7.
- Demo state is held in Worker memory and is intentionally reset when the local Worker restarts; D1 persistence remains scheduled for Phase 8.

Next phase:
- Phase 6 — GPT-5.6 integration.

### Phase 6 — GPT-5.6 integration
Date: 2026-07-16

Completed:
- Added `OpenAIEvolutionAnalyzer` behind the existing `EvolutionAnalyzer` interface with a Worker-native Responses API client.
- Added strict JSON-schema structured output for the shared `MutationProposal` contract and a second Zod validation boundary.
- Restricted live proposals to low risk, proposed status, and the two allow-listed ProjectFlow mutation files.
- Sent only aggregate telemetry, ranked findings, fitness and mutation policy to the model; raw telemetry events remain local.
- Added configurable model and timeout handling through `OPENAI_MODEL` and `OPENAI_TIMEOUT_MS`.
- Kept deterministic mock mode as the default and added automatic fallback for missing keys, timeouts, API errors and invalid responses.
- Added metadata-only analysis logging for model, response/request IDs, duration, outcome and fallback reason without prompts, responses or secrets.
- Extended shared analysis responses with `mock`, `live`, and `fallback` modes, model identity, and typed fallback reasons.
- Updated the control room to display deterministic mock, live GPT-5.6, or mock fallback state.
- Documented local live-mode setup in `README.md` and aligned the versioned evolution prompt with the runtime safety boundary.
- Updated API health and dashboard version labels to `0.6.0`.

Verification commands:
```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Results:
- Mock mode remained the zero-configuration default and completed the full control-room flow without an API key.
- A simulated GPT-5.6 Responses API result passed strict JSON-schema parsing, allow-list enforcement, Zod validation and the complete API response schema.
- Timeout, HTTP failure and missing-key cases returned deterministic mock proposals with typed fallback reasons.
- Logging tests confirmed API keys and proposal content are absent from analysis metadata.
- `npm run test`: passed; 6 test files and 25 tests across all workspaces.
- `npm run typecheck`, `npm run lint`, and `npm run format:check`: passed.
- `npm run build`: passed; the Worker bundle was 171.58 KiB (30.91 KiB gzip) and the web production bundle completed successfully.
- The live local Worker returned API version `0.6.0`, mock mode, deterministic model identity, exactly 10,000 events and baseline fitness 66.6.

Known issues:
- A real billable GPT-5.6 request requires an operator-provided `OPENAI_API_KEY`; automated verification uses a schema-accurate Responses API fixture.
- Validation output, the repository diff viewer, and the persistent fossil-record timeline remain scheduled for Phase 7.
- Demo state remains in Worker memory until the D1 persistence phase.

Next phase:
- Phase 7 — Validation and fossil record.

### Phase 7 — Validation and fossil record
Date: 2026-07-16

Completed:
- Split ProjectFlow baseline and evolved behavior into typed genome sources while preserving the existing organism interactions and tests.
- Added `npm run validate:record`, which executes the actual workspace typecheck, unit/UX tests, and production build and records exit status, duration, and command output.
- Derived the recorded evolved fitness from the seeded simulator rather than copying a UI fixture score.
- Generated a real 31-line repository source comparison between the baseline and evolved ProjectFlow genome files.
- Added shared contracts for recorded validation, mutation diffs, mutation validation/release responses, and the evolution timeline.
- Added `GET /api/mutations/:id/diff`, `POST /api/mutations/:id/validate`, `POST /api/mutations/:id/release`, and `GET /api/evolution/timeline`.
- Enforced the controlled lifecycle `proposed → approved → validated → released`; approval alone now retains ProjectFlow `v1.0`.
- Added the mutation execution surface with the implementation steps, escaped source diff, recorded command evidence, expandable actual output, and before/after fitness components.
- Added explicit release after successful validation; only release activates ProjectFlow `v1.1`.
- Added baseline, survived, and failed-selection records to the fossil timeline and restored organism/timeline state on browser reload.
- Kept hosted mode free of arbitrary command execution by serving the clearly labelled checked-in repository artifact.
- Updated API health and dashboard version labels to `0.7.0`.

Verification commands:
```bash
npm run validate:record
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Results:
- The recorded repository run passed all three command groups and produced evolved fitness 87.4.
- Live Worker approval retained the baseline, validation passed three recorded checks, release activated the evolved organism, and the timeline ended with `survived`.
- Release before validation returned `409`; reset removed validation, proposal, organism, and timeline state.
- The actual ProjectFlow source comparison contained 31 lines and visibly promoted My Work, global search, global quick-create, and Insights.
- Two Chrome flows passed at 1440×900 and 390×844; a page reload preserved ProjectFlow `v1.1` and the survived fossil record.

Known issues:
- Phase 7 timeline persistence uses the Worker in-memory fallback and survives browser reloads but not Worker restarts; D1 persistence is scheduled for Phase 9 after the real-event contracts are established.
- Hosted validation is a checked-in recorded repository run. Only the local recorder executes commands, and the UI labels the provenance explicitly.

Next phase:
- Phase 8 — Real telemetry foundation.

### Phase 8 — Real telemetry foundation
Date: 2026-07-16

Completed:
- Re-baselined the authoritative product, architecture, build plan and demo script around real human telemetry as Darwin's primary evidence source.
- Added `docs/REAL_TELEMETRY_PLAN.md` with the collection boundary, deterministic parsing rules, evidence hashing, model boundary and honest outcome labels.
- Kept existing simulation contracts intact and added a separate strict real-study event union with source, schema, participant, session, attempt, route and sequence provenance.
- Added event-specific property allowlists, semantic target validation, a 50-event batch limit and contracts for ingestion receipts.
- Added `packages/telemetry-client` with semantic click capture, explicit route/search/validation tracking, unique task attempts, terminal outcomes, bounded local outbox, batching, retry-safe delivery and Beacon support.
- Ensured the browser client records search length/result count and feedback length, never raw search text, form values, arbitrary page text or feedback content.
- Added standalone `apps/projectflow`, distinct from the Darwin control room, with persistent local project/task state and functional project creation, task creation, project task search and reporting.
- Added `/study` with anonymous participant IDs, three fixed tasks, unique attempts and outcome verification before a task can be marked complete.
- Instrumented important controls with stable `data-darwin-id` values and exposed the local ordered evidence count during the study.
- Extended root development and production-build commands to include the telemetry client and standalone ProjectFlow workspaces.

Verification commands:
```bash
npm install
npm run typecheck -w @darwin/shared
npm run typecheck -w @darwin/telemetry-client
npm run typecheck -w @darwin/projectflow-app
npm run test -w @darwin/shared
npm run test -w @darwin/telemetry-client
npm run test -w @darwin/projectflow-app
npm run validate:record
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
npm run test:e2e:projectflow
```

Results:
- All 31 unit and component tests passed across the five workspaces, including four shared-contract tests, two telemetry-client tests and two standalone ProjectFlow tests.
- A real browser study flow navigated Dashboard → Projects → Apollo Release → Tasks, opened the assigned task and produced a verified successful attempt.
- Desktop Chrome at 1280×720 and mobile Chrome at 390×844 passed; the standalone app remained usable and the study panel adapted below the mobile workspace.
- No ProjectFlow form value or visible control text appeared in captured telemetry tests.

Known issues:
- Phase 8 retains real events in a bounded browser outbox; Phase 9 adds the validated Worker endpoint, D1 storage, deduplication and live Darwin trace viewer.
- ProjectFlow participant workspaces are local in Phase 8; Phase 9 moves study workspaces and assignments behind D1 repositories.
- The current Darwin control-room metrics are still driven by explicitly synthetic simulation until the evidence engine is connected in Phase 10.

Next phase:
- Phase 9 — D1 ingestion and live traces.

### Phase 9 — D1 ingestion and live traces
Date: 2026-07-16

Completed:
- Added a telemetry repository interface with D1 and process-memory adapters for raw events and participant workspaces.
- Added the first D1 migration with event identity, study, participant, session, attempt, provenance, receipt time and query indexes.
- Added `POST /api/telemetry/events` with a 256 KB body limit, 1-50 event batches, per-event strict validation, server receipt timestamps and synthetic-source rejection.
- Added idempotent event ingestion by `eventId` with accepted, rejected and duplicate counts.
- Added ordered recent-study and full-session trace routes plus total event counts.
- Added participant workspace GET/PUT routes backed by the same repository and connected ProjectFlow's local workspace to them.
- Connected the telemetry client to Worker ingestion by default outside tests while retaining its bounded offline outbox and retry behavior.
- Added Darwin's live real-evidence panel with source status, raw event, session and participant counts, session filtering and ordered event traces.
- Updated API and control-room version labels to `0.9.0`.

Verification commands:
```bash
npm run typecheck
npm run test
npm run test:e2e:projectflow
npm run lint
npm run format:check
npm run build
```

Results:
- API tests accepted one valid event from a mixed batch, rejected the event containing an unknown raw-text field, and treated a repeated event ID as a duplicate.
- Participant workspace state round-tripped through the repository API.
- The real Chrome study flow delivered 19 browser-generated events to the Worker across two ordered sessions for one anonymous participant.
- Darwin displayed the live records and allowed the trace to be filtered by session.

Known issues:
- Local development uses the process-memory repository until a D1 binding is configured; the checked-in migration and D1 adapter are ready for Phase 13 deployment.
- Public ingestion rate limiting and production origin restrictions are applied with the Cloudflare environment in Phase 13.

Next phase:
- Phase 10 — Deterministic evidence engine.

### Phase 10 — Deterministic evidence engine
Date: 2026-07-16

Completed:
- Added shared contracts for evidence classes, reconstructed attempts, detector rules, supporting traces, task summaries and hashed evidence packs.
- Reconstructed task attempts using explicit attempt identity and ordered session sequences rather than route heuristics.
- Added versioned navigation-loop, repeated-target, abandonment, excess-path, validation-friction and search-dependency detectors.
- Added task completion, duration, interaction, optimal-path and top-route summaries.
- Added canonical JSON serialization and SHA-256 hashing that remains stable across generation timestamps for identical source evidence.
- Added `POST /api/studies/:id/evidence` and `GET /api/studies/:id/evidence/latest`.
- Added process-memory and D1 evidence-pack persistence plus the `analysis_runs` migration.
- Added Darwin evidence generation with measured-source labeling, parser version, full hash, detector summaries and expandable supporting traces.
- Updated API and control-room version labels to `0.10.0`.

Verification commands:
```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
npm run test:e2e:projectflow
```

Results:
- A fixed event fixture reconstructed one unambiguous successful attempt with seven interactions and a three-route path.
- Identical source events generated the same SHA-256 hash across different generation timestamps.
- The live browser study converted 19 real events into one attempt and one `EV-001` excess-path signal with exact supporting event IDs.
- The evidence pack was persisted and returned through the latest-evidence API.

Known issues:
- The deterministic evidence pack is ready for reasoning, but Phase 11 still needs the evidence-citing proposal schema and cross-reference validator.
- Small Build Week cohorts are descriptive; the UI does not claim statistical significance.

Next phase:
- Phase 11 — Evidence-backed reasoning and Codex audit.

### Phase 11 — Evidence-backed reasoning and Codex audit
Date: 2026-07-16

Completed:
- Added shared schemas for evidence-citing mutation candidates, cached analysis runs and controlled Codex implementation manifests.
- Added a versioned evidence-analysis prompt and a structured GPT-5.6 Responses adapter that receives aggregate evidence rather than participant or session records.
- Limited each analysis to one selected mutation and no more than two alternatives, with explicit evidence IDs, scope, confidence, predicted direction and acceptance criteria.
- Added cross-reference validation that rejects unknown evidence IDs, protected areas and scopes outside the evidence pack's mutable application map.
- Added a deterministic default analyzer and live-call fallback using the same validated output contract.
- Cached model results by evidence hash, model and prompt version in both process memory and D1-compatible persistence.
- Added a hashed Codex manifest containing only the selected brief, citations, allowed paths, protected paths and actual validation commands.
- Added Worker routes and a control-room reasoning workspace showing model mode, cache identity, citations, alternatives and manifest audit metadata.
- Updated API and control-room version labels to `0.11.0`.

Verification commands:
```bash
npm run format
npm run typecheck
npm run test -w @darwin/api
npm run test:e2e:projectflow
```

Results:
- All 28 Worker tests passed, including protected-scope rejection, unknown-citation rejection, single-call structured output, analysis caching and raw-telemetry-free manifest checks.
- The Chrome study flow passed on desktop and mobile and delivered 19 measured events across two sessions.
- The live local Worker generated one `EV-001` friction signal, selected `promote-task-discovery`, and created a manifest with three allowed paths, three protected path patterns and three validation commands.
- Desktop and 390x844 screenshots showed the analysis and manifest workspace without clipping or overlap.

Known issues:
- Live GPT-5.6 mode requires `OPENAI_API_KEY`; offline and judging environments remain fully demoable with the explicitly labelled deterministic analyzer.
- `DARWIN_REPOSITORY_COMMIT` defaults to `working-tree` locally and is set to the deployed revision during Phase 13 deployment.

Next phase:
- Phase 12 — Outcome validation and demo choreography.

## Entry template

### Phase N — Name
Date:

Completed:
-

Verification commands:
```bash

```

Results:
-

Known issues:
-

Next phase:
-

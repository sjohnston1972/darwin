# Progress Log

Codex: append one entry per completed phase.

## Current state
- Phase 1 foundation complete.
- Phase 2 ProjectFlow organism complete.
- Phase 3 telemetry and simulation complete.
- Phase 4 not started.

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

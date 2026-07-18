# Darwin Lab

Darwin Lab is Darwin's synthetic usability-testing workspace. It gives a
bounded population of independent, inexpensive AI agents one fixed goal and
lets each agent operate ProjectFlow through the visible interface in a fresh
Playwright browser context.

> Synthetic usability testing complements human research. It does not replace
> it.

## Evidence boundary

Lab interactions are real semantic telemetry emitted by ProjectFlow, but the
actor provenance is always `synthetic`. Lab studies use experiment-scoped study
IDs and are never included in human cohorts, measured fitness, or the
10,000-event scale replay.

Agents do not receive the hidden answer oracle, source code, private APIs,
database access, selectors, or a correct navigation path. Each run has an
action budget, duration limit, repeated-state limit, and isolated browser
storage.

## Run an experiment

1. Start Darwin and ProjectFlow locally.
2. Open **Darwin Lab** in the Darwin navigation.
3. Confirm the target is an allowed local, test, preview, or staging origin.
4. Create the fixed Project Apollo discovery experiment.
5. Queue the population.
6. Run `npm run lab:runner` from the Darwin repository.
7. Inspect the live population, run replay, task outcomes, and linked
   `L-EV-*` evidence.
8. With live reasoning configured, request the single population-level GPT-5.6
   analysis and approve a bounded implementation brief.
9. Promote a recurring failure to a retained `BE-###` behavioural eval. The
   eval becomes an outcome-based acceptance contract for future Codex changes.

The default population uses eight agents. Each per-action decision uses the
model configured by `OPENAI_LAB_AGENT_MODEL`; population analysis uses
`OPENAI_MODEL`. Both integrations fail closed when live reasoning is
unavailable.

## Safety boundary

`DARWIN_LAB_ALLOWED_ORIGINS` is an explicit allowlist. Production targets are
not enabled by default. Darwin Lab must only run against local development,
dedicated test environments, disposable previews, or explicitly approved
staging systems.

The runner supports only validated, user-facing browser actions. A separate
oracle scores submitted answers as success, partial success, incorrect,
abandoned, timed out, blocked, or system error.

## Evidence and mutation flow

```text
bounded synthetic population
  -> isolated browser actions
  -> synthetic-provenance semantic telemetry
  -> deterministic friction detectors
  -> hashed Lab evidence pack
  -> one evidence-citing GPT-5.6 analysis
  -> human-selected implementation brief
  -> retained behavioural eval (optional)
```

## Behavioural CI

A behavioural eval is not a prescribed click path. It records the user goal,
the hidden oracle boundary, pass criteria, forbidden outcomes, action budget,
seed, target snapshot, and supporting `L-EV-*` IDs. Its Codex brief says to
make the eval pass without changing the oracle, thresholds, seed, telemetry
provenance, or protected paths. This turns an observed synthetic failure into
an executable acceptance test that can be rerun after a candidate mutation.

The retained eval is available through `GET /api/behavioural-evals` and is
created with `POST /api/lab/experiments/:experimentId/promote-eval`.

Predicted impact remains a hypothesis. Before-and-after fitness is measured
only after an equivalent population reruns the same task, fixture, budgets, and
persona distribution against an evolved preview.

See [API Reference](API-Reference) for the Lab endpoints and
[Getting Started](Getting-Started) for environment configuration.

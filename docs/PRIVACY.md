# Observation privacy

Darwin captures semantic interaction outcomes, never user content. Human study and Darwin Lab records may include anonymous participant/agent, session, task-attempt, route, stable semantic target, workflow outcome, timing, viewport class, application version, schema version, and source provenance.

Darwin does not collect names, email addresses, passwords, keystrokes, typed values, search terms, arbitrary page text, DOM paths, absolute pointer trails, or screenshots. The Lab reasoning model may receive a bounded accessibility snapshot to choose the next action, but Darwin persists only semantic action metadata, input length, target identity, outcome, and linked telemetry event IDs.

Evidence classes never mix: human study data contributes only to measured human cohorts and fitness; Darwin Lab browser agents contribute only to automated evidence and automated fitness; Scale replay remains simulated and cannot be presented as a target observation. Retention and targeted deletion are defined in [RETENTION.md](RETENTION.md).

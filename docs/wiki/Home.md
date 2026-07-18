# Darwin Wiki

> The repository is authoritative. Start with the [canonical README](https://github.com/sjohnston1972/darwin/blob/main/README.md); hosted wiki pages mirror the files under [`docs/wiki`](https://github.com/sjohnston1972/darwin/tree/main/docs/wiki).

Darwin is a controlled software evolution engine. It observes semantic product telemetry, creates deterministic evidence, asks GPT-5.6 for a structured mutation portfolio, and hands a human-selected manifest to a bounded Codex workflow in the target repository.

The current proof target is ProjectFlow, a separately deployed task-management application.

## Live system

| Component | Location |
| --- | --- |
| Darwin control room | https://darwin-control-room.pages.dev |
| Darwin API | https://darwin-api.stevie-johnston.workers.dev |
| ProjectFlow study | https://darwin-projectflow.pages.dev/?study=true |
| Darwin repository | https://github.com/sjohnston1972/darwin |
| ProjectFlow repository | https://github.com/sjohnston1972/projectflow |

## Proof loop

```text
measured interaction
  -> schema-valid semantic event
  -> ordered D1 record
  -> deterministic journey and evidence pack
  -> evidence-citing GPT mutation portfolio
  -> human-selected immutable manifest
  -> bounded Codex repository workflow
  -> real patch, checks, pull request, and preview
  -> explicit release or rejection
  -> retained Genome record and reviewable rollback
```

## Start here

- [Getting Started](Getting-Started.md): local installation and first run.
- [Architecture](Architecture.md): components, data flow, persistence, and trust boundaries.
- [Telemetry and Evidence](Telemetry-and-Evidence.md): captured signals, privacy boundary, parsing, and evidence quality.
- [AI and Mutation Workflow](AI-and-Mutation-Workflow.md): GPT context, structured validation, Codex manifest, release, and rollback.
- [Demo Runbook](Demo-Runbook.md): reliable three-minute presentation flow.
- [Operations and Deployment](Operations-and-Deployment.md): Cloudflare, D1, secrets, deployment, and smoke tests.
- [Security and Privacy](Security-and-Privacy.md): current controls, limitations, and hardening backlog.
- [API Reference](API-Reference.md): current Worker routes and contracts.
- [Development and Testing](Development-and-Testing.md): workspace commands, tests, and contribution workflow.
- [Troubleshooting](Troubleshooting.md): common failures and recovery steps.

## Canonical source documents

- [Current product specification](https://github.com/sjohnston1972/darwin/blob/main/docs/PRODUCT_SPEC.md)
- [Technical architecture](https://github.com/sjohnston1972/darwin/blob/main/docs/ARCHITECTURE.md)
- [Real telemetry and evidence plan](https://github.com/sjohnston1972/darwin/blob/main/docs/REAL_TELEMETRY_PLAN.md)
- [Three-minute demo source](https://github.com/sjohnston1972/darwin/blob/main/docs/DEMO_SCRIPT.md)
- [Generated Worker route contract](https://github.com/sjohnston1972/darwin/blob/main/docs/generated/API_ROUTES.md)
- [Documentation ownership and freshness](https://github.com/sjohnston1972/darwin/blob/main/docs/DOCUMENTATION.md)

## Evidence language

Darwin uses these terms consistently:

| Product concept | Darwin term |
| --- | --- |
| target source and configuration | genome |
| measured friction | selection pressure |
| bounded code change | mutation |
| measured product outcome | fitness |
| accepted change | survived selection |
| rejected change | failed selection |
| retained version and evidence history | Genome |

Predicted impact is always a hypothesis. A passing repository build proves implementation validity, not user fitness. User fitness requires a compatible post-release evidence cohort.

## Current scope

Darwin intentionally supports one controlled target rather than arbitrary repository ingestion. ProjectFlow defines the mutable paths, protected paths, source context, validation commands, and change budgets that a Codex workflow must honor.

The 10,000-event simulator demonstrates deterministic scale. It is synthetic and is not mixed with measured ProjectFlow evidence.

# Security and Privacy

## Security posture

Darwin is a public hackathon proof of life connected to one configured public demo target. It demonstrates a controlled workflow, but the current public deployment is not approved for private repositories, customer telemetry, personal data, or unsupervised production changes.

## Existing controls

- ProjectFlow is fixed by Worker configuration.
- Target onboarding verifies repository identity, exact commit, contract, and runtime.
- Source context is read from the exact base SHA and hashed.
- OpenAI and GitHub secrets stay in Worker/provider secret stores.
- Browser payloads are validated with strict Zod schemas.
- Synthetic provenance is rejected from measured evidence ingestion.
- Manifest retrieval and workflow callbacks require an execution-scoped HMAC signature.
- Repository state transitions are validated.
- Target-owned policy constrains paths, file/line budgets, and validation commands.
- Candidate code is reviewed in a pull request and isolated preview.
- Production release and rollback each require an explicit operator action.
- Production control-plane reads and writes require a capability-scoped operator bearer token.
- Raw behavioral evidence and repository artifacts require the evidence-inspector capability.
- Protected JSON responses use `Cache-Control: no-store`.
- ProjectFlow sends telemetry and workspace requests through a narrow same-origin Pages Function that HMAC-signs target, deployment origin, timestamp, edge-derived client key, and body.
- Telemetry accepts only the configured ProjectFlow study, provenance, and application-version formats.
- The 10,000-event simulation is operator-only, rate/concurrency limited, fixed to the configured seed, and retained as metadata in a four-entry TTL/LRU cache.
- Repository workflow requests sign the execution, repository, manifest hash, timestamp, nonce, and payload digest; D1 rejects replayed signatures and terminal state rewrites.
- Callback bodies, patches, output, checks, and changed-file arrays have explicit size limits.
- D1 records have indexed expiries, nightly deletion/compaction, per-study and per-target event quotas, and operator-only targeted deletion. See [Data retention and deletion](../RETENTION.md).

## Privacy boundary

The telemetry contract excludes typed values, search text, feedback text, keystrokes, arbitrary page text, DOM paths, raw cursor trails, and absolute screen coordinates.

Participant and session IDs are pseudonymous. They still require access control and retention because behavioral traces can be linkable.

## Open security work

The July 2026 repository audit identified these priority items:

| Issue                                                    | Priority | Risk                                     |
| -------------------------------------------------------- | -------- | ---------------------------------------- |
| [#4](https://github.com/sjohnston1972/darwin/issues/4)   | medium   | missing CSP and complete browser headers |
| [#30](https://github.com/sjohnston1972/darwin/issues/30) | medium   | mutable GitHub Action references         |

## Deployment guidance

Until the remaining hardening backlog is resolved:

- keep the target restricted to the public demo repository;
- grant the GitHub token only the minimum ProjectFlow permissions;
- do not ingest personal, customer, or confidential usage;
- rotate OpenAI, GitHub, Cloudflare, and callback credentials after demos or suspected exposure;
- monitor GitHub Actions and ProjectFlow `main` for unexpected activity;
- treat Darwin's public URLs as discoverable;
- do not assume CORS is authentication.

## Secret handling

Never place secret values in:

- `.env.example`;
- Vite `VITE_*` variables;
- manifests, callback bodies, logs, screenshots, or issue text;
- `wrangler.toml` vars;
- repository workflow inputs.

Use Wrangler secrets and GitHub Actions secrets. Avoid printing response headers or command environments that include credentials.

## Threat model summary

Important assets:

- OpenAI spend and prompt context;
- GitHub workflow dispatch/merge authority;
- ProjectFlow source and deployment;
- telemetry/evidence integrity;
- pseudonymous behavior traces;
- Genome provenance and rollback state.

Primary threat actors:

- unauthenticated internet callers;
- a compromised target workflow or callback secret;
- dependency/action supply-chain compromise;
- accidental operator double submission;
- prompt injection embedded in repository content;
- stale/mixed-version telemetry creating a false outcome.

Security work should preserve the demo's human approval while turning it into a real authorization and audit boundary.

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
- Manifest retrieval and workflow callbacks require a bearer secret.
- Repository state transitions are validated.
- Target-owned policy constrains paths, file/line budgets, and validation commands.
- Candidate code is reviewed in a pull request and isolated preview.
- Production release and rollback each require an explicit operator action.

## Privacy boundary

The telemetry contract excludes typed values, search text, feedback text, keystrokes, arbitrary page text, DOM paths, raw cursor trails, and absolute screen coordinates.

Participant and session IDs are pseudonymous. They still require access control and retention because behavioral traces can be linkable.

## Open security work

The July 2026 repository audit identified these priority items:

| Issue | Priority | Risk |
| --- | --- | --- |
| [#1](https://github.com/sjohnston1972/darwin/issues/1) | critical | operator/release/reset APIs lack authentication |
| [#2](https://github.com/sjohnston1972/darwin/issues/2) | high | telemetry injection and caller-controlled rate-limit bypass |
| [#3](https://github.com/sjohnston1972/darwin/issues/3) | high | raw telemetry and repository artifacts are publicly readable |
| [#4](https://github.com/sjohnston1972/darwin/issues/4) | medium | missing CSP and complete browser headers |
| [#18](https://github.com/sjohnston1972/darwin/issues/18) | medium | no retention/deletion policy |
| [#26](https://github.com/sjohnston1972/darwin/issues/26) | high | unbounded public simulation resource use |
| [#27](https://github.com/sjohnston1972/darwin/issues/27) | high | global callback secret and replay/terminal rewrite risk |
| [#30](https://github.com/sjohnston1972/darwin/issues/30) | medium | mutable GitHub Action references |

## Deployment guidance

Until issues #1, #2, #3, and #27 are resolved:

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

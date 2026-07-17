# Development and Testing

## Workspaces

| Workspace | Purpose |
| --- | --- |
| `@darwin/web` | React control room |
| `@darwin/api` | Worker API, evidence, reasoning, execution |
| `@darwin/shared` | Zod schemas and types |
| `@darwin/telemetry-client` | browser instrumentation |

## Common commands

```powershell
npm install
npm run dev
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run simulate -- --seed=1859 --variant=baseline
npm run smoke:production
```

Run one workspace:

```powershell
npm run test -w @darwin/api
npm run test -w @darwin/web
npm run build -w @darwin/web
```

## Test layers

### Shared contracts

Tests validate telemetry, evidence, analysis, manifest, and execution schemas.

### Telemetry client

Tests exercise semantic capture, privacy-safe fields, batching, and delivery behavior under jsdom.

### Worker API

Vitest covers ingestion, evidence generation, reasoning contracts, repository source capture, GitHub request construction, execution transitions, and route responses with in-memory persistence.

### Web

Testing Library renders control-room states with mocked API responses and verifies key workflow controls and archives.

### Browser flow

Playwright is installed but the complete browser suite is still tracked in issue [#23](https://github.com/sjohnston1972/darwin/issues/23).

## Reasoning context changes

When changing prompts, mutation examples, or generated context inputs:

```powershell
npm run context:generate
npm run context:check
```

Review the generated diff. Increment prompt/context versions when cache semantics change.

## Schema changes

1. Change the shared Zod contract first.
2. Add boundary and failure tests.
3. Update API producers and web consumers.
4. Add a forward-only D1 migration when persistence changes.
5. Verify old stored JSON compatibility or provide migration logic.

## Review checklist

- Does the change preserve measured/synthetic provenance?
- Does any new field capture user content?
- Is the target repository SHA/source hash still enforced?
- Are operator approval and release boundaries preserved?
- Are errors visible without leaking credentials/provider payloads?
- Do both themes and mobile/desktop layouts remain usable?
- Are tests proportional to the state/data boundary changed?
- Are README, wiki, and route documentation still accurate?

## Current quality baseline

At the July 2026 audit commit:

- lint passed;
- TypeScript/context check passed;
- 52 unit/component tests passed;
- production build passed;
- `npm audit` reported zero known vulnerabilities;
- format check failed in three API files, tracked in issue [#24](https://github.com/sjohnston1972/darwin/issues/24).

## Contribution flow

1. Create a focused branch.
2. Keep contracts and tests beside behavioral changes.
3. Run all local quality checks.
4. Open a pull request with evidence/reproduction and screenshots for UI changes.
5. Do not deploy from a feature branch.
6. Use the manual deployment workflow only after review.

Automated pull-request CI/security checks are tracked in issue [#22](https://github.com/sjohnston1972/darwin/issues/22).

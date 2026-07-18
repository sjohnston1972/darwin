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
npm run docs:check
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

## API route and documentation changes

The Worker reads route authorization metadata from `workers/api/src/api-route-contract.ts`. After changing a route:

```powershell
npm run docs:generate
npm run docs:check
```

Commit `docs/generated/API_ROUTES.md` with the contract change. Follow the [documentation ownership and freshness checklist](https://github.com/sjohnston1972/darwin/blob/main/docs/DOCUMENTATION.md) for release changes.

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

Treat command output from the current commit as the quality record; do not preserve stale test counts or resolved issue claims in this page. Pull-request CI runs formatting, lint, generated-context and route-reference checks, TypeScript, tests, build, dependency review, and CodeQL.

## Contribution flow

1. Create a focused branch.
2. Keep contracts and tests beside behavioral changes.
3. Run all local quality checks.
4. Open a pull request with evidence/reproduction and screenshots for UI changes.
5. Do not deploy from a feature branch.
6. Use the manual deployment workflow only after review.

The repository workflow is the canonical source for current CI/security checks.

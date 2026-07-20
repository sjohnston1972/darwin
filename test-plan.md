# Rosalind — Master Test Plan

**Date:** 2026-07-20 · **Rev 2 — rebased on the fresh audit of the current tree**
**Baseline reviewed:** `main` at `f812d1d` (`v0.25.17`). **Plan revision:** the commit containing this document.
**Scope:** every route, every button, every workflow, every GitHub interaction, plus the security, resilience, and non-functional envelope.
**Companion:** `audit-report.md` (fresh audit, same date). §13 cross-indexes every current audit finding to a test case.

> **What changed in this revision.** The codebase hardened substantially since the first plan: the prior audit's Lab races, workspace IDOR, unbounded-body, target-signing, retention, and observability findings are **fixed and now have code + tests**. This revision records direct regression coverage added for telemetry receipt reconciliation, fallback identity generation, stable sequencing, persistence recovery, Lab runner state transitions, route-contract fail-closed behaviour, branding, layout, and default-collapsed mutation summaries. Cases that guard fixed behaviour remain **regression guards**, not gaps.

---

## 1. How to read this plan

**Case ID scheme:** `AREA-nnn`. Areas: `UNIT`, `API`, `GH`, `SEC`, `LC` (lifecycle/E2E), `UI`, `LAB`, `TEL` (telemetry client), `GW` (gateway), `E2E` (browser), `NF` (non-functional), `MIG` (migrations), `REG` (regression vs. current audit), `CI`.

**Status per case:**

- **[covered]** — an existing test asserts this; the case is a regression guard. Re-confirm against the named file.
- **[partial]** — exercised only indirectly (e.g. through a full-stack test); needs a direct case.
- **[gap]** — no current coverage; this plan proposes it.

**Release gate:** all P0 lifecycle, security, telemetry-integrity, and production-smoke cases pass. P1/P2 gaps remain tracked work and do not silently become release claims. Long-term completion means every route in §5, control in §8–§9, GitHub call in §6, and client/gateway method in §10–§11 has a happy path and at least one failure path; every row in §13 is covered or explicitly verify-closed.

---

## 2. Tooling & commands

| Concern                                              | Tool                             | Command                                                     |
| ---------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Unit / integration (all workspaces)                  | Vitest 3                         | `npm test`                                                  |
| Coverage gates                                       | Vitest + `@vitest/coverage-v8`   | `npm run test:coverage` (per-workspace thresholds, §3)      |
| Web component tests                                  | Vitest + Testing-Library + jsdom | `npm test -w @darwin/web`                                   |
| Browser E2E                                          | Playwright 1.61 (chromium)       | `npm run test:e2e` / `-- --grep "@smoke"`                   |
| Visual regression                                    | Playwright                       | `npx playwright test --grep visual`                         |
| UI type-scale                                        | Playwright                       | `npm run test:ui-type`                                      |
| Production smoke                                     | tsx                              | `npm run smoke:production`                                  |
| Lint / format / types (+ contract/env/context drift) | eslint, prettier, tsc            | `npm run lint`, `npm run format:check`, `npm run typecheck` |

**Determinism levers (built in — use them):**

- `DARWIN_E2E_FIXTURES` / localhost — short-circuits GitHub + deployment, auto-advances repository executions.
- `DARWIN_AI_MODE=mock|live` — gates all OpenAI reasoning; mock is the CI default.
- `DARWIN_DEMO_SEED` — simulations require `seed === DARWIN_DEMO_SEED`; seeded PRNG makes replays reproducible.
- Absent operator tokens + ingestion secret on **localhost only** → `local-development` full-capability identity (see SEC-066). Production must set them.

**Non-secure-context harness (new, required for H1):** a jsdom/browser context where `crypto.randomUUID` is undefined, to exercise the `createId` fallback.

---

## 3. Current coverage baseline

**37 test files, 171 unit/component cases + 17 Playwright cases** at this revision. CI-enforced gates:

| Workspace                   | lines | funcs | stmts | branches |
| --------------------------- | ----- | ----- | ----- | -------- |
| `apps/web`                  | 70    | 44    | 70    | 65       |
| `workers/api`               | 65    | 77    | 65    | 72       |
| `packages/shared`           | 71    | 0     | 71    | 19       |
| `packages/telemetry-client` | 82    | 84    | 82    | 60       |
| `packages/lab-runner`       | 21    | 29    | 21    | 65       |

**Existing test files:** `api-route-contract.test.ts`, `archive-pagination.test.ts`, `index.test.ts`, `evidence/evidence.test.ts`, `fitness/fitness.test.ts`, `lab/{evidence,handler,lab-repository,reasoning}.test.ts`, `persistence/{pagination,retention,telemetry-d1}.test.ts`, `reasoning/reasoning.test.ts`, `repository/{deployment-verification,execution,github-actions,github-source,recovery}.test.ts`, `security/{auth,bounded-body,callback,study-session}.test.ts`, `simulation/simulate.test.ts`, `testing/e2e-fixtures.test.ts`; web: `App.test.tsx`, `LabView.test.tsx`, `components/ErrorBoundary.test.tsx`, `telemetry/useLiveTelemetry.test.tsx`, `views/dashboard-views.test.tsx`; packages: `telemetry-client.test.ts`, `contracts.test.ts`, `lab-runner/runner.test.ts`; e2e: `e2e/demo.spec.ts`, `tests/e2e/{demo,workspaces}.spec.ts`, `apps/web/e2e/observations.spec.ts`, `apps/web/visual/type-scale.spec.ts`.

**Priority gaps still open:** `telemetry-repository.ts` (2,953 lines, no direct test), full managed-runner browser smoke, reset execution ordering/CAS, gateway trust-boundary tests in the separate ProjectFlow repository, `packages/shared` function/branch gates, `api.ts`, and `SystemStatusView.tsx`.

---

## 4. Environments & harness

| Env                | Purpose                                                                   | Backing                                                                                   |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unit               | Pure logic                                                                | in-memory repository doubles                                                              |
| Worker integration | Full `handleWorkerRequest`                                                | in-memory or `wrangler dev --local` D1; mocked GitHub/OpenAI fetch; stub limiter bindings |
| Web component      | React under jsdom                                                         | `vi.stubGlobal('fetch', fetchMock)` URL router (`App.test.tsx`)                           |
| Browser E2E        | Real Chromium + local worker + checked-out ProjectFlow `demo-baseline-v3` | Playwright; `PROJECTFLOW_E2E_DIR`                                                         |
| Production smoke   | Post-deploy sanity                                                        | live Cloudflare                                                                           |

**Fixtures to build/verify:** `makeSignedTargetRequest`, `makeSignedCallback`, `issueStudySession` (+ expired/wrong-subject/future variants), `fakeGitHub` (records dispatch payloads; programmable `commits`/`raw`/`pulls/{n}/merge` outcomes incl. 405/5xx/ambiguous), `fakeOpenAI` (canned reasoning + error injection), repository doubles exposing the CAS/version surface, and the **non-secure-context** client harness.

---

## 5. API route test matrix

Every route: (a) happy path + status/body-schema, (b) each documented error status, (c) capability enforcement, (d) body-size cap where one exists, (e) CORS/`X-Request-ID` echo. Operator routes must have an explicit capability; unmatched routes fail closed with 404 before authorization.

### 5.1 Cross-cutting

| ID      | Case                                                                                                                              | Expected                             | Status                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| API-001 | OPTIONS preflight, allowed origin                                                                                                 | 204 + CORS, no body                  | [gap]                                                     |
| API-002 | Any non-OPTIONS, disallowed origin                                                                                                | 403 `origin_forbidden`               | [partial]                                                 |
| API-003 | Empty `ALLOWED_ORIGINS` → wildcard fallback; production allowlist echoes only matched origin + `Vary: Origin`                     | correct CORS in both modes           | [gap]                                                     |
| API-004 | Malformed percent-encoding in path                                                                                                | 400 `invalid_path_encoding`, not 500 | [gap]                                                     |
| API-005 | `X-Darwin-Request-ID` valid→echoed / invalid→server UUID / absent→UUID                                                            | header format enforced               | [partial]                                                 |
| API-006 | Unmatched route                                                                                                                   | 404 `not_found`                      | [covered]                                                 |
| API-007 | Handler throws                                                                                                                    | 500 `internal_error`, generic body   | [partial]                                                 |
| API-008 | **Every contract entry resolves and every operator route has an explicit capability; unmatched routes fail closed** — REG-A(sec1) | table-driven contract + runtime test | [covered] (`api-route-contract.test.ts`, `index.test.ts`) |
| API-009 | Worker JSON responses carry `nosniff` (REG-A6)                                                                                    | header present                       | [covered] (`index.test.ts`)                               |
| API-010 | Cron `scheduled` handler runs retention sweep                                                                                     | sweep invoked                        | [covered] (`retention.test.ts`)                           |

### 5.2 Capability matrix

| ID      | Case                                                                                                              | Expected                                      | Status                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| API-020 | No tokens/secret, localhost                                                                                       | `local-development`, all capabilities         | [covered]                                                                |
| API-021 | No tokens, non-localhost                                                                                          | 503 `authentication_unavailable`              | [covered]                                                                |
| API-022 | Missing bearer on operator route                                                                                  | 401                                           | [covered]                                                                |
| API-023 | Wrong operator token (constant-time compare)                                                                      | 401, no timing oracle                         | [covered]                                                                |
| API-024 | Viewer token on `observe` route                                                                                   | 200                                           | [covered]                                                                |
| API-025 | Viewer token on any non-`observe` route (`reason`/`execute`/`release`/`reset`/`connect`/`simulate`/`delete_data`) | 403 `forbidden`                               | [covered]                                                                |
| API-026 | Operator token on every privileged route (table-driven over all contract entries)                                 | route reaches its handler rather than 401/403 | [partial] (capability matrix covered; exhaustive handler success is not) |

### 5.3 Health, ops, diagnostics, retention, deletion

| ID      | Route                                                             | Cases                                                                                          | Status                      |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| API-030 | `GET /api/health`                                                 | 200; probes D1 (`getRetentionHealth`) and degrades when DB unreachable; build/version accurate | [partial]                   |
| API-031 | `GET /api/operations/metrics`                                     | 200 counters                                                                                   | [covered] (`index.test.ts`) |
| API-032 | `GET /api/diagnostics?limit≤100`                                  | 200 audit events + provider metrics                                                            | [covered] (`index.test.ts`) |
| API-033 | `POST /api/retention/sweep` (`delete_data`)                       | 200; prunes past-window rows                                                                   | [covered]                   |
| API-034 | `DELETE /api/studies/:id/participants/:pid` (`delete_data`)       | 200 deleted + evidence invalidated; 400 invalid                                                | [partial]                   |
| API-035 | `DELETE /api/studies/:id` (`delete_data`)                         | 200                                                                                            | [gap]                       |
| API-036 | `DELETE /api/repository-executions/:id/artifacts` (`delete_data`) | 200                                                                                            | [gap]                       |

### 5.4 Target connection

| ID      | Case                                      | Expected                                                     | Status                             |
| ------- | ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| API-040 | `GET`, none set → 204; set → 200 verified | correct                                                      | [covered]                          |
| API-041 | `POST` valid → 201, snapshot captured     | checks list populated                                        | [covered]                          |
| API-042 | `POST` fullName not on allowlist          | 403 `target_not_allowed`                                     | [partial]                          |
| API-043 | `POST` invalid body / target              | 400                                                          | [partial]                          |
| API-044 | `POST` > 16 KB                            | 413                                                          | [covered] (`bounded-body.test.ts`) |
| API-045 | `POST` GitHub verify fails                | 502 `target_verification_failed`, upstream detail not leaked | [partial]                          |
| API-046 | `POST /disconnect` → 204                  | subsequent GET 204                                           | [partial]                          |

### 5.5 Study sessions & telemetry ingestion (target-auth)

| ID      | Case                                                                                                                            | Expected                                                               | Status                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| API-050 | `POST /api/study-sessions` valid signed                                                                                         | 201 `{token,claims,expiresAt}`, 10-min TTL                             | [covered] (`study-session.test.ts`)               |
| API-051 | Study-session context forbidden combo                                                                                           | 403 `study_session_context_forbidden`                                  | [partial]                                         |
| API-052 | `POST /api/telemetry/events` valid batch (1–50)                                                                                 | 202 `TelemetryReceipt` with **four** buckets incl. `sequenceConflicts` | [covered]                                         |
| API-053 | **Receipt returns nonzero `sequenceConflicts`** when `(session,sequence)` collides with a different eventId (server side of C1) | bucket populated, distinct from rejected/duplicate                     | [covered] (`index.test.ts`)                       |
| API-054 | 0 / 51 events                                                                                                                   | 400 `invalid_request`                                                  | [partial]                                         |
| API-055 | Body > 256 KB, incl. chunked / missing Content-Length                                                                           | 413 before full buffer                                                 | [covered] (`bounded-body.test.ts`)                |
| API-056 | Missing/invalid target signature                                                                                                | 401                                                                    | [covered] (`auth.test.ts`)                        |
| API-057 | Replayed target signature                                                                                                       | 409 `target_request_replayed`                                          | [covered]                                         |
| API-058 | Study-session token subject ≠ event claims (study/participant/session/appVersion/source/origin)                                 | rejected                                                               | [covered]                                         |
| API-059 | Rate limit exceeded (`INGESTION_RATE_LIMITER`, key `targetId:clientKey`)                                                        | 429 + `Retry-After: 60`                                                | [partial] (429 covered; header assertion remains) |
| API-060 | Timestamp outside ±5 min                                                                                                        | 401                                                                    | [covered]                                         |

### 5.6 Studies, events, sessions, workspace

| ID      | Case                                                        | Expected                                           | Status                           |
| ------- | ----------------------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| API-070 | `GET /api/studies/:id/events` summary (`observe`)           | 200 counts                                         | [covered]                        |
| API-071 | `GET .../events/raw?limit≤200&cursor` (`inspect_evidence`)  | 200 page; 400 `invalid_cursor`                     | [covered] (`pagination.test.ts`) |
| API-072 | `GET .../sessions/:sid`                                     | 200 ordered trace                                  | [partial]                        |
| API-073 | `GET .../participants/:pid/workspace` valid session subject | 200                                                | [covered]                        |
| API-074 | Workspace GET with session subject ≠ path participant       | 403 subject mismatch (REG: IDOR now fixed — guard) | [covered]                        |
| API-075 | `PUT .../workspace` valid / 400 / 413                       | correct                                            | [partial]                        |

### 5.7 Evidence & reasoning

| ID      | Case                                                                                                         | Expected                                   | Status                          |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------- |
| API-080 | `POST .../evidence?source=real_user`                                                                         | 201 deterministic `EvidencePack`           | [covered] (`evidence.test.ts`)  |
| API-081 | `?source=` filter applied in query, not after LIMIT                                                          | correct count under other-source dominance | [partial]                       |
| API-082 | Insufficient events                                                                                          | 409 `insufficient_evidence`                | [covered]                       |
| API-083 | Mixed app/telemetry versions                                                                                 | 409                                        | [partial]                       |
| API-084 | Lab-provenance events to measured evidence                                                                   | 409 `lab_evidence_boundary`                | [covered]                       |
| API-085 | Large corpus (~10k events) completes in CPU budget                                                           | no 500                                     | [partial]                       |
| API-086 | `POST .../analyse-evidence` mock mode                                                                        | 201; cached repeat → 200                   | [covered] (`reasoning.test.ts`) |
| API-087 | Analyse: repo snapshot unavailable / unattested source                                                       | 502 `repository_unavailable` / 409         | [partial]                       |
| API-088 | Model output validation: unknown evidence id / scope outside `mutableAreas` / into `protectedAreas` rejected | strict-schema + post-validate              | [covered]                       |
| API-089 | **Verify B5 (prior audit): scorecard is not silently ×20-rescaled** — model's selected mutation preserved    | verify-and-close                           | [gap]                           |

### 5.8 Codex manifest & repository execution

| ID      | Case                                                                                                              | Expected                                           | Status                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| API-100 | `POST .../codex-manifest` `{mutationIds}` → 201 immutable, repo-bound; re-POST same → 200 idempotent              | correct                                            | [covered]                                                         |
| API-101 | **Verify B11: re-POST different `mutationIds` after dispatch** does not brick the in-flight callback auth         | 409 or safe new-execution, never stranded `queued` | [gap]                                                             |
| API-102 | `POST .../execution` → 201 queued; issues callback nonce; dispatches `darwin-evolve.yml`                          | correct                                            | [covered]                                                         |
| API-103 | Execution creds missing → 503; dispatch fails → 502, no half-write                                                | correct                                            | [partial]                                                         |
| API-104 | **Concurrent double-dispatch** → one 201, other 409, no duplicate row (CAS guard)                                 | atomic                                             | [partial] (CAS covered; explicit concurrent request race remains) |
| API-105 | `GET /api/repository-executions/:id` poll (fixture auto-advance)                                                  | advancing status                                   | [covered] (`e2e-fixtures.test.ts`)                                |
| API-106 | `POST .../recovery/force-fail`: exact confirmation after window → 200; inside window → 409; no confirmation → 400 | correct                                            | [covered] (`recovery.test.ts`)                                    |

### 5.9 Release, rollback, fitness

| ID      | Case                                                                                                | Expected                                   | Status                                                                 |
| ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| API-120 | `POST .../release` from `preview_ready` → 200 released or 202 `deployment_verifying`; squash-merge  | correct                                    | [covered]                                                              |
| API-121 | Release not from `preview_ready` → 409 `not_releasable`                                             | correct                                    | [partial]                                                              |
| API-122 | **Concurrent double-release** — status-predicated CAS; a merged PR never recorded `failed`          | atomic (REG: prior B10, now fixed — guard) | [partial] (CAS covered; explicit concurrent request race remains)      |
| API-123 | Merge 405 not-mergeable → 502 `repository_release_failed`, state consistent                         | correct                                    | [partial]                                                              |
| API-124 | Merge ambiguous/5xx → 502 `..._merge_state_unknown`, reconcile via `GET /pulls/{n}`                 | correct                                    | [covered] (`github-actions.test.ts`)                                   |
| API-125 | Deploy verify pending→success: 202→200; evolution cycle advances **once**                           | no double-count                            | [covered] (`deployment-verification.test.ts`) → verify count [partial] |
| API-126 | `POST .../rollback` from `released` → 201, dispatch `darwin-rollback.yml`; not-released → 409       | correct                                    | [covered]                                                              |
| API-127 | `POST .../rollback/release` from rollback `preview_ready` → 200, invalidates fitness                | correct                                    | [partial]                                                              |
| API-128 | `GET/POST .../fitness` → 201 measured / 204 none / 409 `fitness_cohort_unavailable`; no div-by-zero | correct                                    | [covered] (`fitness.test.ts`)                                          |

### 5.10 Genome, observations, simulations

| ID      | Case                                                                                                 | Expected     | Status                                   |
| ------- | ---------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------- |
| API-140 | `GET /api/genome?limit≤25&cursor` → 200 page; 400 `invalid_pagination`; bounded+indexed              | correct      | [covered] (`archive-pagination.test.ts`) |
| API-141 | **One corrupt row in the list** → page skips it, still 200 (C-fix M1) — currently 500s               | skip-and-log | [gap]                                    |
| API-142 | `GET /api/genome/:id` / `GET /api/observations/archives[/:id]`                                       | 200 / 404    | [partial]                                |
| API-143 | `POST /api/simulations` seed==`DARWIN_DEMO_SEED` baseline → 201 + `Location`, deterministic          | correct      | [covered] (`simulate.test.ts`)           |
| API-144 | Wrong seed/variant → 403/400; rate-limited → 429 +`Retry-After:60`; in-flight → 503 +`Retry-After:5` | correct      | [partial]                                |
| API-145 | `GET /api/simulations/:id[/summary]` → 200 / 404 (per-isolate store caveat)                          | correct      | [partial]                                |
| API-146 | Body > 4 KB on `POST /api/simulations`                                                               | 413          | [covered]                                |

### 5.11 Demo reset

| ID      | Case                                                                                                                                     | Expected                                                          | Status           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------- |
| API-160 | `GET /api/demo/reset` → 200 latest / 204 none                                                                                            | correct                                                           | [partial]        |
| API-161 | `POST` correct confirmation + export ack → 201/200/202 by mode                                                                           | correct                                                           | [partial]        |
| API-162 | Wrong confirmation string → 400 `invalid_reset_confirmation`                                                                             | correct                                                           | [gap]            |
| API-163 | Creds missing → 503; body > 16 KB → 413                                                                                                  | correct                                                           | [covered] (body) |
| API-164 | **M2: `refreshVerifiedTargetSnapshot` throws during reconcile after the DB is wiped** → reset must not strand `deploying` with data gone | snapshot computed before destructive reset; completion idempotent | [gap]            |
| API-165 | **L1: two concurrent valid reset transitions** (callback + GET-triggered reconcile) → no lost transition / double reset                  | CAS on reset execution                                            | [gap]            |

---

## 6. GitHub interaction tests (`GH`)

Against `fakeGitHub`; assert endpoint, method, headers (`Bearer`, UA `darwin-evolution-engine`, API `2022-11-28`), payload, timeout.

| ID     | Case                                                                                                                                | Expected                                  | Status                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| GH-001 | Commit lookup (no `commitSha`) → `GET /repos/{full}/commits/{branch}`                                                               | `baseSha`                                 | [covered] (`github-source.test.ts`)           |
| GH-002 | Raw fetch for `darwin.target.json` + each `contextPath`                                                                             | correct URLs                              | [covered]                                     |
| GH-003 | Malformed `darwin.target.json` (HTML/truncated)                                                                                     | handled, not reflected as raw parse error | [partial]                                     |
| GH-004 | contextPaths bounds (≤20 paths, ≤64 KiB config, ≤128 KiB file, ≤512 KiB aggregate, ≤4 concurrent)                                   | over-limit rejected, no subrequest storm  | [partial]                                     |
| GH-005 | Path traversal in context path (`..`, `%2e%2e`, `\`, leading `/`) rejected by `assertPath`; `baseSha` regex; `branch` encoded       | rejected                                  | [covered]                                     |
| GH-006 | GitHub fetch > 10 s aborted                                                                                                         | timeout signal                            | [partial]                                     |
| GH-020 | `dispatchEvolutionWorkflow` → `darwin-evolve.yml/dispatches` with all inputs                                                        | correct payload                           | [covered] (`github-actions.test.ts`)          |
| GH-021 | `dispatchRollbackWorkflow` / `dispatchResetWorkflow` / `dispatchManagedRunner` (lab)                                                | correct workflow + inputs                 | [partial]                                     |
| GH-022 | Dispatch non-2xx → throws → caller 502, state consistent                                                                            | correct                                   | [covered]                                     |
| GH-040 | `mergeEvolutionPullRequest`/`mergeRollbackPullRequest` success → `PUT /pulls/{n}/merge` squash, titled                              | correct                                   | [covered]                                     |
| GH-041 | Merge 405 already-merged → reconcile via `GET /pulls/{n}`, treat merged as success                                                  | correct                                   | [covered]                                     |
| GH-042 | Merge 5xx/unreconcilable → `GitHubMergeStateUnknownError` → 502                                                                     | correct                                   | [covered]                                     |
| GH-060 | `verifyProjectFlowDeployment` polls study URL: success→released, pending→202 re-poll; AbortController per attempt; bounded attempts | correct                                   | [covered] (`deployment-verification.test.ts`) |

---

## 7. Security matrix (`SEC`)

Most are `[covered]` in `security/*.test.ts` — retained as regression guards for the now-hardened posture.

| ID      | Case                                                                                                                                                 | Expected                                                                                 | Status                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| SEC-001 | Target canonical binds method+path+timestamp+targetId+sourceOrigin+clientKey+**sha256(body)**                                                        | tamper any field → 401                                                                   | [covered]                                                 |
| SEC-002 | Signature for method A / path X rejected when replayed on method B / path Y                                                                          | 401                                                                                      | [partial]                                                 |
| SEC-003 | Constant-time compare (digest fold)                                                                                                                  | no timing oracle                                                                         | [covered]                                                 |
| SEC-004 | Origin: exact `PROJECTFLOW_PRODUCTION_URL` / https subdomain allowed; else 403                                                                       | correct                                                                                  | [covered]                                                 |
| SEC-020 | Callback canonical binds method+path+ts+nonce+executionId+repository+manifestHash+sha256(body); nonce stored only as `sha256(nonce)`                 | correct                                                                                  | [covered] (`callback.test.ts`)                            |
| SEC-021 | Repository/manifest-hash mismatch → 403; expiry → 401; replay → 409                                                                                  | correct                                                                                  | [covered]                                                 |
| SEC-040 | Study-session valid round-trip; tampered/extra-segment → invalid; expired/future → expired                                                           | correct                                                                                  | [covered] (`study-session.test.ts`)                       |
| SEC-041 | **Workspace IDOR guard: token for participant A vs participant B path → 403** (prior S1, now fixed)                                                  | rejected                                                                                 | [covered]                                                 |
| SEC-042 | `anonymousStudyParticipantId` deterministic + pseudonymous                                                                                           | no PII                                                                                   | [partial]                                                 |
| SEC-060 | Per-route body caps (1 KB recovery → 750 KB callbacks) via bounded stream; chunked bypass closed                                                     | 413 at each                                                                              | [covered] (`bounded-body.test.ts`)                        |
| SEC-061 | SQL: no interpolated user value; `IN (?..)` placeholders and `WHERE ${where}` literals only                                                          | static/review test                                                                       | [gap]                                                     |
| SEC-062 | No secret logged/returned; `observability.ts` logs only provider/op/duration/`error.name`                                                            | assertion                                                                                | [gap]                                                     |
| SEC-063 | Prompt-injection: only kebab-case identifiers + bounded routes reach the prompt; repo content wrapped data-not-instructions; output schema-validated | constrained                                                                              | [partial]                                                 |
| SEC-064 | Rate-limiter key `clientKey` derived from `CF-Connecting-IP` at gateway, signed — not caller-choosable (prior S3, now fixed)                         | IP-pinned                                                                                | [gap]                                                     |
| SEC-065 | Upstream GitHub/OpenAI error text not reflected verbatim to client                                                                                   | generic message                                                                          | [gap]                                                     |
| SEC-066 | `local-development` bypass requires both tokens + secret absent **and** localhost host; deploy invariant asserted                                    | no bypass in prod                                                                        | [gap]                                                     |
| SEC-067 | **Fail-open default: a non-public route missing from `apiRouteContract` should deny, not fall to `observe`** (audit sec-1)                           | unmatched route returns 404 before auth; missing operator capability is a contract error | [covered] (`index.test.ts`, `api-route-contract.test.ts`) |

---

## 8. Web UI — views, controls, workflows (`UI`)

Vitest + Testing-Library, role/label queries, `fetchMock`. In test mode `App` renders `DarwinDashboard` directly with all 9 capabilities — the `OperatorBoundary` token flow is still **untested** (UI-001..004 `[gap]`).

### 8.1 Operator boundary / auth gate (untested)

| ID     | Case                                                                              | Expected                 | Status |
| ------ | --------------------------------------------------------------------------------- | ------------------------ | ------ |
| UI-001 | Empty token submit                                                                | inline error, no request | [gap]  |
| UI-002 | Valid token incl. `observe` → `GET /api/auth/session` unlock with returned subset | render dashboard         | [gap]  |
| UI-003 | Token lacking `observe` → error, stays locked                                     | correct                  | [gap]  |
| UI-004 | `darwin:operator-unauthorized` (from a 401) mid-session → re-lock, token cleared  | correct                  | [gap]  |

### 8.2 Global chrome

| ID     | Case                                                                                                                                | Expected     | Status                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------ |
| UI-010 | 6 nav links set `?view=`, mark `aria-current`; system-status via footer icon                                                        | route switch | [covered]                            |
| UI-011 | Mobile hamburger / scrim open+close                                                                                                 | toggles      | [partial]                            |
| UI-012 | ThemeToggle sets `dataset.theme` + `localStorage` + meta color; aria flips                                                          | correct      | [covered]                            |
| UI-013 | Reset-evolution icon → `POST /api/demo/reset {confirmation:'RESET DARWIN DEMO', exportAcknowledged:true}`; spinner; disabled during | correct      | [covered]                            |
| UI-014 | Reset button aria flips to "Retry evolution reset" on failure; reset-status band per status + Workflow link + Retry                 | correct      | [partial]                            |
| UI-015 | ErrorBoundary catches a render throw → fallback, not white screen                                                                   | correct      | [covered] (`ErrorBoundary.test.tsx`) |

### 8.3 Control Room

| ID     | Case                                                                                                                                                  | Expected    | Status                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------- |
| UI-020 | 8 metric cards render derived values                                                                                                                  | correct     | [covered] (`dashboard-views.test.tsx`) |
| UI-021 | "Open measured study" href precedence (rollback preview → execution preview → studyUrl → `?study=true`); disabled+`aria-disabled` when `studyBlocked` | correct     | [partial]                              |
| UI-022 | Release-confidence derivation (`--`/REVERTED/HOLD/100%/passed-total/PENDING)                                                                          | each branch | [partial]                              |
| UI-023 | Fitness-delta states (measured/insufficient/rolled_back/pending)                                                                                      | each label  | [partial]                              |

### 8.4 Target Application view

| ID     | Case                                                                             | Expected | Status    |
| ------ | -------------------------------------------------------------------------------- | -------- | --------- |
| UI-030 | Initial `GET /api/target-connection` 204 → empty state                           | correct  | [covered] |
| UI-031 | Fill form + Connect → `POST /api/target-connection`; verification panel + checks | correct  | [covered] |
| UI-032 | Connect failure → `connection-error` alert with server message                   | correct  | [partial] |
| UI-033 | Disconnect → `POST /disconnect` → empty state                                    | correct  | [covered] |
| UI-034 | Paired external links track inputs; study link disabled when blocked             | correct  | [partial] |

### 8.5 Observations — telemetry panel

| ID     | Case                                                                                     | Expected            | Status    |
| ------ | ---------------------------------------------------------------------------------------- | ------------------- | --------- |
| UI-040 | Refresh live telemetry → spinner, disabled while refreshing                              | correct             | [covered] |
| UI-041 | Live-update indicator states (paused/stale/incremental + last-updated)                   | aria-live           | [partial] |
| UI-042 | Generate evidence enabled only with `count` + `canInspectEvidence` → `POST .../evidence` | correct             | [covered] |
| UI-043 | Also posts fitness when a retained released execution exists                             | second call         | [partial] |
| UI-044 | Telemetry error band + Dismiss                                                           | correct             | [partial] |
| UI-045 | Session index filters trace (All vs per-session)                                         | `is-active` toggles | [covered] |
| UI-046 | Event trace renders last 12 with per-type detail                                         | correct             | [covered] |
| UI-047 | Aggregate mode when `!canInspectEvidence` → summary endpoint                             | correct             | [covered] |

### 8.6 Observations — evidence pack & signal inspector

| ID     | Case                                                                           | Expected                           | Status                                                          |
| ------ | ------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------- |
| UI-060 | Top-pressure buttons (≤3) set filters + scroll                                 | `focusPressureGroup`               | [covered]                                                       |
| UI-061 | Signal anchor links open exact signal (`revealExactSignal`)                    | row expands                        | [covered]                                                       |
| UI-062 | **M4: `revealExactSignal` from a filtered view still opens+scrolls to target** | target renders on its correct page | [partial] (reset-clobber fixed; direct regression test remains) |
| UI-063 | 5 inspector filters reset page & filter                                        | count updates                      | [covered]                                                       |
| UI-064 | Pagination (prev/next, size 8, disabled at ends)                               | correct                            | [covered]                                                       |
| UI-065 | Deep-link `#signal-<id>` on load opens row + `replaceState`                    | correct                            | [covered]                                                       |

### 8.7 Observation archive & genome

| ID     | Case                                                                                                                                                             | Expected                           | Status              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------- |
| UI-070 | Evidence-class filter                                                                                                                                            | `setProvenanceFilter`              | [covered]           |
| UI-071 | Archive `<details>` lazy-loads detail once; deep-link `#observation-<id>` auto-opens                                                                             | single fetch                       | [covered]           |
| UI-072 | Detail load error → Retry detail re-fetches                                                                                                                      | correct                            | [partial]           |
| UI-073 | "Load older observation records" appends via cursor                                                                                                              | correct                            | [covered]           |
| UI-074 | **L6c: evidence-class filter applied only to fetched page shows empty when matches sit behind "Load more"**                                                      | filter reaches query or loads more | [gap]               |
| UI-075 | Genome filter, baseline rows, "Load older Genome records", fossil `<details>` lazy-load once, deep-link `#fossil-<id>`, embedded workspace scoped to executionId | correct                            | [covered]/[partial] |

### 8.8 Mutations — reasoning & portfolio

| ID     | Case                                                                                                                       | Expected                | Status    |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------- |
| UI-080 | Ask model / Open cached reasoning; disabled without signals or `!liveModelAvailable` → `POST .../analyse-evidence`         | correct                 | [covered] |
| UI-081 | Cached analysis → "Open cached reasoning", no duplicate paid call                                                          | correct                 | [partial] |
| UI-082 | Portfolio rows ranked by scorecard total; expand shows cluster/scorecard/validation                                        | correct                 | [covered] |
| UI-083 | "Implement" checkbox toggles selection                                                                                     | correct                 | [covered] |
| UI-084 | Start controlled evolution disabled unless ≥1 selected → `POST .../codex-manifest {mutationIds}` then `/execution`; scroll | correct                 | [covered] |
| UI-085 | Matching non-failed execution → "View implementation" (scroll only, no new dispatch)                                       | branch                  | [partial] |
| UI-086 | Empty state without evidence                                                                                               | "Evidence is required…" | [covered] |

### 8.9 Repository Execution Workspace (status-gated)

| ID     | Case                                                                                                                                 | Expected by status         | Status    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------- |
| UI-100 | `failed` → Retry repository run                                                                                                      | `startControlledEvolution` | [covered] |
| UI-101 | `preview_ready` → Release reviewed mutation → `POST .../release`                                                                     | correct                    | [covered] |
| UI-102 | `releasing` → disabled "Merging"; `deployment_verifying`+releasing → disabled "Verifying"; +!releasing → Check production deployment | correct                    | [partial] |
| UI-103 | `released` → confirmation + RollbackWorkspace mounts                                                                                 | correct                    | [covered] |
| UI-104 | Progress steps 01–05; validation checks auto-open when failed; external links conditional                                            | correct                    | [partial] |
| UI-105 | On release→released: `resetCurrentCycleMeasurements` + refresh genome + archives                                                     | side effects               | [covered] |

### 8.10 Rollback Workspace (only when `released`)

| ID     | Case                                                                                                                | Expected | Status    |
| ------ | ------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| UI-120 | No rollback → Prepare controlled rollback → `POST .../rollback`                                                     | correct  | [covered] |
| UI-121 | `failed` → Retry; `preview_ready` → Release reviewed rollback → `POST .../rollback/release`; in-progress → disabled | correct  | [partial] |
| UI-122 | `released` → rollback confirmation; Control Room shows REVERTED                                                     | correct  | [partial] |

### 8.11 System status

| ID     | Case                                                                                                                         | Expected | Status                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| UI-160 | 6 status rows + genome table from `health`/build                                                                             | content  | [partial] (not in `dashboard-views.test.tsx`) |
| UI-161 | DiagnosticsPanel loads `GET /api/diagnostics?limit=50`; Refresh (disabled loading); Export JSON builds Blob + `<a download>` | correct  | [gap]                                         |
| UI-162 | Error / loading / ready states                                                                                               | each     | [partial]                                     |

### 8.12 Live/polling behavior

| ID     | Case                                                                                                                    | Expected                         | Status                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| UI-180 | Event poll 2 s base, backoff to 30 s when empty, 50 ms drain when `hasMore`                                             | scheduling                       | [covered] (`useLiveTelemetry.test.tsx`) |
| UI-181 | Poll pauses on `visibilitychange` hidden; failure → offline/stale, exp backoff + jitter, cap 5                          | correct                          | [covered]                               |
| UI-182 | Generation guard discards stale in-flight responses; `resetCurrentCycleMeasurements` bumps generation like `resetState` | no backwards jump / resurrection | [covered]                               |
| UI-183 | Demo-reset poll 3 s until complete → `resetState`+refresh                                                               | transition                       | [partial]                               |
| UI-184 | Execution poll 3 s; stops when terminal & rollback settled                                                              | stop condition                   | [covered]                               |
| UI-185 | Event window capped at 200, dedup by `eventId`                                                                          | bounded                          | [covered]                               |
| UI-186 | GlobalExplainTooltip dismisses on scroll/resize                                                                         | no orphaned tooltip              | [partial]                               |

---

## 9. Darwin Labs — UI + full workflow (`LAB`)

### 9.1 Lab UI controls (`LabView.tsx`)

| ID      | Case                                                                                                                         | Expected                          | Status                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| LAB-001 | Designer form → Create Lab task → `POST /api/lab/experiments`; ≥20 `data-explain` labels                                     | correct                           | [covered] (`LabView.test.tsx`)                                          |
| LAB-002 | Success-criterion select swaps route/marker/workflow field                                                                   | correct                           | [partial]                                                               |
| LAB-003 | **L6b: numeric inputs (population/persona/actions/duration/seed) reject NaN** on empty/partial entry; persona sums validated | no `null`/NaN numeric body fields | [covered] (`LabView.test.tsx`)                                          |
| LAB-004 | Draft → Queue population (`.../start`) / Save draft (PUT); disabled while working                                            | correct                           | [covered]                                                               |
| LAB-005 | Release-boundary buttons (Duplicate/Cancel/Force-fail/Retry/Archive) gated by status                                         | §9.3 matrix                       | [partial]                                                               |
| LAB-006 | Evidence → Analyse Darwin Labs pressure (`.../analyse`); gated on `liveReasoningAvailable`+signals                           | correct                           | [covered]                                                               |
| LAB-007 | Behavioural CI: Promote / Rerun eval gating                                                                                  | correct                           | [partial]                                                               |
| LAB-008 | Mutation portfolio → Approve brief (`.../mutations/select`), single approval only                                            | disabled after                    | [covered]                                                               |
| LAB-009 | Dispatch → `.../codex-manifest` then `/execution`; execution panel + PR link                                                 | correct                           | [covered]                                                               |
| LAB-010 | **M3: 2 s experiment poll has stale-response guard; execution poll doesn't `setError` on transient failure**                 | latest-wins, no flicker/banner    | [partial] (implementation fixed; direct deferred-response test remains) |

### 9.2 Lab HTTP state machine (`handler.ts`, CAS)

| ID      | Case                                                                                                                              | Expected                                                                            | Status                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| LAB-030 | Create: target origin ∉ `DARWIN_LAB_ALLOWED_ORIGINS` → 403; population invalid → 400                                              | correct                                                                             | [covered] (`handler.test.ts`)                                      |
| LAB-031 | Edit non-draft → 409 `lab_state_conflict`                                                                                         | correct                                                                             | [covered]                                                          |
| LAB-032 | **Concurrent `/claim`** (two runners) → exactly one 200, other 409 (CAS — prior C2 fixed, guard)                                  | one population                                                                      | [covered] (`lab-repository.test.ts`) → add explicit race [partial] |
| LAB-033 | **Concurrent `/runs` append** → no lost run (CAS — prior C1 fixed, guard)                                                         | atomic                                                                              | [covered] → add explicit race [partial]                            |
| LAB-034 | Run/action provenance + budget conflicts → 409 (`lab_provenance_conflict`/`lab_population_conflict`/`lab_action_budget_conflict`) | correct                                                                             | [partial]                                                          |
| LAB-035 | `/finish` all terminal → finalize evidence; if evidence build throws, run finish still persists (run not stuck `running`)         | correct                                                                             | [partial]                                                          |
| LAB-036 | `/analyse` requires live+completed+evidence → 200/503/409; `/mutations/select` requires analysed+in-portfolio → 200/409           | correct                                                                             | [covered]                                                          |
| LAB-037 | `/codex-manifest` requires evidence+analysis+selection → 201 lab provenance                                                       | correct                                                                             | [covered]                                                          |
| LAB-038 | `/cancel` `/force-fail` `/archive` `/retry` `/duplicate` `/promote-eval` `/rerun-eval` status preconditions                       | 200 or 409 per set                                                                  | [partial]                                                          |
| LAB-039 | Agent-decision requires live + run `running` → 200/409/502                                                                        | correct                                                                             | [covered] (`reasoning.test.ts`)                                    |
| LAB-040 | Start with managed-runner credentials absent                                                                                      | visible 502; experiment remains recoverable in `awaiting_runner`                    | [covered] (`handler.test.ts`)                                      |
| LAB-041 | Start a draft containing immutable run history                                                                                    | 409; historical runs are never requeued                                             | [covered] (`handler.test.ts`)                                      |
| LAB-042 | Retry failed/cancelled experiment                                                                                                 | new experiment/study identity, derived state cleared, exact new identity dispatched | [covered] (`handler.test.ts`)                                      |

### 9.3 Lab status → control availability

Matrix over `{draft, awaiting_runner, running, completed, analysing, analysed, cancelled, archived, failed}` × each button. **[partial]** — build the exhaustive table test.

### 9.4 Lab runner (`packages/lab-runner`, 21% gate — priority)

| ID      | Case                                                                                                                    | Expected                                                                         | Status                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| LAB-060 | Claim → run → actions → finish happy path vs stub API + local page                                                      | population completes                                                             | [partial] (`runner.test.ts`)      |
| LAB-061 | **L4: transient `listSessionEventIds` failure does not reset `knownEventIds`** → events not re-attributed to one action | correct                                                                          | [covered] (`runner.test.ts`)      |
| LAB-062 | `finish` 409 mid-population                                                                                             | error surfaced, context closed, remaining runs continue                          | [gap]                             |
| LAB-063 | Cross-origin `decision.destination` refused server-side                                                                 | rejected                                                                         | [partial]                         |
| LAB-064 | Action/outcome mapping; ≤100 telemetry ids                                                                              | correct shape                                                                    | [gap]                             |
| LAB-065 | Browser action locators time out within 5 seconds; errors are bounded before persistence                                | runner cannot consume the full task duration on one stale target                 | [covered] (`runner.test.ts`)      |
| LAB-066 | Managed GitHub runner against deployed ProjectFlow                                                                      | claim, at least one real action, telemetry linkage, terminal run, evidence build | [gap] (required production smoke) |

---

## 10. Telemetry client (`TEL`) — where the live bugs are

Gate is 82% but C1/H1 slipped through — these edges are the priority.

| ID      | Case                                                                                                                                                               | Expected                                             | Status                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------- |
| TEL-001 | **C1: batch whose receipt returns nonzero `sequenceConflicts`** → client accounts for all four buckets, drops sequence-conflicting events, does NOT infinite-retry | outbox clears, no wedge                              | [covered] (`telemetry-client.test.ts`) |
| TEL-002 | **C1 trigger / L2: client re-instantiates with a stable caller `sessionId`** → sequence high-water persisted/derived, no `(session,sequence)` reuse                | no self-inflicted conflict                           | [covered] (`telemetry-client.test.ts`) |
| TEL-003 | **H1: non-secure context (`crypto.randomUUID` undefined)** → `createId` returns unique ids, not the constant `00000000-…-0001`                                     | no eventId collision, no cross-event outbox deletion | [covered] (`telemetry-client.test.ts`) |
| TEL-004 | `init()` idempotent; enqueues `session_started`+`page_view`; flush interval when `endpoint` set                                                                    | one session                                          | [covered]                              |
| TEL-005 | Tracking methods enqueue correct event shapes                                                                                                                      | schema-valid                                         | [covered]                              |
| TEL-006 | `flush()` single-flight; delivery `POST` batch ≤ batchSize, `keepalive`, optional `X-Darwin-Study-Session`                                                         | correct                                              | [covered]                              |
| TEL-007 | Non-OK → exp backoff + jitter honoring `Retry-After`; no 0 ms hot loop                                                                                             | bounded                                              | [covered]                              |
| TEL-008 | **M5: unload path (`pagehide`) does not double/triple-send; beacon marks sent events; beacon parse guarded**                                                       | no duplicate event IDs and no competing fetch        | [covered] (`telemetry-client.test.ts`) |
| TEL-009 | **L3: `persistOutbox` transient QuotaExceeded does not permanently latch persistence off**                                                                         | later persistence retries                            | [covered] (`telemetry-client.test.ts`) |
| TEL-010 | Outbox persisted per `studyId:participantId`; overflow drops oldest + counts `droppedEvents`                                                                       | cap enforced                                         | [covered]                              |
| TEL-011 | `destroy()` ends session, removes listeners, clears timers, auto-abandons active attempt                                                                           | clean                                                | [covered]                              |

---

## 11. Gateway (`GW`) — ProjectFlow `functions/api/darwin/[[path]].ts`

Lives in a separate repo — confirm whether these run in _that_ repo's CI; if not, this trust-boundary component is untested here.

| ID     | Case                                                                                                             | Expected      | Status |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| GW-001 | Only allowlisted routes pass (study-sessions, telemetry/events, workspace GET/PUT); else 404                     | routing       | [gap]  |
| GW-002 | Missing `PROJECTFLOW_INGESTION_SECRET` → 503 `gateway_unavailable`                                               | fail closed   | [gap]  |
| GW-003 | `clientKey = HMAC(secret, "client\n"+CF-Connecting-IP)` — caller cannot choose (guards SEC-064)                  | IP-pinned     | [gap]  |
| GW-004 | Signs canonical identical to `auth.ts` (method, `/api/{path}`, ts, projectflow, origin, clientKey, sha256(body)) | upstream 2xx  | [gap]  |
| GW-005 | Workspace routes verify `X-Darwin-Study-Session` subject matches path; mismatch → 403                            | subject check | [gap]  |
| GW-006 | Body > 256 KB (Content-Length + stream) → 413; non-JSON upstream → 502, pass through status + `Retry-After`      | correct       | [gap]  |

---

## 12. End-to-end lifecycle scenarios (`LC`)

Full-stack, deterministic via `DARWIN_E2E_FIXTURES` + mock GitHub/OpenAI.

| ID     | Scenario                                                                                                                | Key assertions                                                                   | Status                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| LC-001 | Connect → ingest → evidence → analyse → manifest → dispatch → callbacks → preview_ready → release → released → fitness  | status at each hop; evolution cycle advances **once**; genome+archives update    | [partial]                                 |
| LC-002 | Release → rollback → rollback release (REVERTED)                                                                        | rollback machine; fitness invalidated; Control Room REVERTED                     | [partial]                                 |
| LC-003 | Failed execution → recovery force-fail → retry                                                                          | window respected; id reused, revision+1                                          | [covered] (`recovery.test.ts` + fixtures) |
| LC-004 | Callback replay at each stage (manifest/mutation/rollback/reset)                                                        | 409, no double transition                                                        | [covered]                                 |
| LC-005 | Demo reset lifecycle (dispatch → signed callback → deploying → complete); M2 snapshot-refresh failure                   | study links blocked until complete; snapshot is secured before destructive reset | [partial] overall; M2 failure path [gap]  |
| LC-006 | Lab: create → start → claim → runs+actions → finish → evidence → analyse → select → codex-manifest → dispatch           | parallel stack completes; provenance walled from measured evidence               | [partial]                                 |
| LC-007 | Simulation run → summary → deterministic aggregates across two same-seed runs                                           | byte-identical                                                                   | [covered]                                 |
| LC-008 | **Telemetry pipeline survival**: client with stable sessionId across reload delivers without wedging (C1/H1 end-to-end) | no infinite retry, no loss                                                       | [gap]                                     |
| LC-009 | Browser E2E `@smoke` + observations + workspaces specs                                                                  | pass against `demo-baseline-v3`                                                  | [covered] (Playwright)                    |

---

## 13. Regression cross-index vs. current `audit-report.md`

Each current finding → its test case(s). Prior-audit findings that are now **fixed** appear as **guards** (must keep passing), not gaps.

| Finding                                                     | Sev      | Case(s)                           | Status                                                            |
| ----------------------------------------------------------- | -------- | --------------------------------- | ----------------------------------------------------------------- |
| C1 receipt omits `sequenceConflicts` → wedge                | Critical | TEL-001, TEL-002, API-053, LC-008 | [covered] direct layers; lifecycle E2E remains [gap]              |
| H1 constant-UUID `createId` fallback                        | High     | TEL-003, LC-008                   | [covered] direct; lifecycle E2E remains [gap]                     |
| M1 list 500 on one corrupt row                              | Med      | API-141                           | [gap]                                                             |
| M2 reset wipes before snapshot                              | Med      | API-164, LC-005                   | [gap]                                                             |
| M3 LabView stale-response poll                              | Med      | LAB-010                           | [partial] implementation fixed; direct race test remains          |
| M4 `revealExactSignal` clobbered                            | Med      | UI-062                            | [partial] implementation fixed; direct filtered-view test remains |
| M5 unload double-send / beacon                              | Med      | TEL-008                           | [covered]                                                         |
| L1 reset execution no CAS                                   | Low      | API-165                           | [gap]                                                             |
| L2 sequence resets per instance                             | Low      | TEL-002                           | [covered]                                                         |
| L3 persistence latch                                        | Low      | TEL-009                           | [covered]                                                         |
| L4 runner resets `knownEventIds`                            | Low      | LAB-061                           | [covered]                                                         |
| L5 O(n·m) in-memory conflict scan                           | Low      | UNIT (in-memory repo)             | [gap]                                                             |
| L6a no fetch timeout                                        | Low      | NF-004                            | [gap]                                                             |
| L6b NaN numeric inputs                                      | Low      | LAB-003                           | [covered]                                                         |
| L6c filter after pagination                                 | Low      | UI-074                            | [gap]                                                             |
| L7 simulation metric edges                                  | Low      | API-143 (extend)                  | [partial]                                                         |
| A1 duplicate `retention_runs` table                         | Med      | MIG-001                           | [gap]                                                             |
| A2 dead `operational_audit_events`                          | Low-Med  | MIG-002                           | [gap]                                                             |
| A3 colliding migration prefixes                             | Low-Med  | MIG-003                           | [gap]                                                             |
| A4 status columns no CHECK                                  | Low      | MIG-004                           | [gap]                                                             |
| A5 inconsistent retention constant                          | Low      | API-032 / retention test          | [partial]                                                         |
| A6 worker JSON no `nosniff`                                 | Low      | API-009                           | [covered]                                                         |
| A7 `.gitignore` `.env.*`                                    | Low      | CI-007                            | [gap]                                                             |
| A8 god-files                                                | Low-Med  | (refactor, not a test)            | n/a                                                               |
| sec-1 fail-open capability default                          | Low      | SEC-067, API-008                  | [covered]                                                         |
| **Prior fixed — regression guards**                         |          |                                   |                                                                   |
| Lab `/claim` & `/runs` races (was C1/C2)                    | —        | LAB-032, LAB-033                  | [covered]                                                         |
| non-atomic release (was B10)                                | —        | API-122                           | [covered]                                                         |
| workspace IDOR (was S1)                                     | —        | SEC-041, API-074                  | [covered]                                                         |
| unbounded body (was S2)                                     | —        | SEC-060, API-055                  | [covered]                                                         |
| target signing method/path (was M1)                         | —        | SEC-001                           | [covered]                                                         |
| rate-limit key bypass (was S3)                              | —        | SEC-064, GW-003                   | [gap] (gateway untested here)                                     |
| retention / index / observability / health / error-boundary | —        | API-010/030, UI-015               | [covered]                                                         |
| B5 scorecard ×20 / B11 manifest re-post / B3 friction scale | —        | API-089, API-101, API-085         | verify-and-close                                                  |

> **verify-and-close:** B5/B11/B3 were prior findings the fresh pass did not reproduce. Before marking them resolved, write the named case and confirm current behavior — do not assume the code changed without checking.

---

## 14. Migrations & CI

| ID      | Case                                                                                                           | Expected                | Status    |
| ------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- | --------- |
| MIG-001 | Apply all migrations clean; `retention_runs` has one coherent shape matching `telemetry-repository.ts` inserts | no dead/duplicate table | [gap]     |
| MIG-002 | No table created by a migration is unreferenced by src (catch dead `operational_audit_events`)                 | lint/test               | [gap]     |
| MIG-003 | Migration filenames have unique, sequential numeric prefixes                                                   | ordering test           | [gap]     |
| MIG-004 | Status columns reject out-of-model values (once CHECK added)                                                   | DB backstop             | [gap]     |
| CI-001  | `test:coverage` gates hold per workspace                                                                       | fail below threshold    | [covered] |
| CI-002  | Playwright `@smoke` + visual against `demo-baseline-v3`                                                        | pass                    | [covered] |
| CI-003  | Lint / format / typecheck incl. contract/env/context drift guards                                              | block on drift          | [covered] |
| CI-004  | `npm audit --audit-level=high` + CodeQL + dependency-review                                                    | gates                   | [covered] |
| CI-005  | Deploy re-verifies CI green for exact SHA; secrets scoped to deploy steps; `concurrency: darwin-production`    | correct                 | [covered] |
| CI-006  | Raise `lab-runner` gate above 21% as LAB-060..064 land                                                         | ratchet                 | [gap]     |
| CI-007  | Add `.env*` to `.gitignore`; assert no `.env.local` committable                                                | hygiene                 | [gap]     |
| CI-008  | Gateway (projectflow repo) tests run somewhere                                                                 | trust boundary covered  | [gap]     |

---

## 15. Non-functional (`NF`)

| ID     | Area           | Case                                                                                                | Status                                                               |
| ------ | -------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| NF-001 | Performance    | Evidence generation at ~10k events within CPU budget                                                | [partial]                                                            |
| NF-002 | Performance    | Hot list queries indexed + bounded (no full scan / N+1)                                             | [covered] (indexes present) → verify at scale [partial]              |
| NF-003 | Resilience     | Web pollers back off + pause when API down / tab hidden; Lab loads are latest-wins                  | [partial] (core polling covered; Lab deferred-response test remains) |
| NF-004 | Resilience     | Web client request timeout so buttons/pollers don't wedge (L6a)                                     | [gap]                                                                |
| NF-005 | Resilience     | Corrupt D1 row doesn't 500 every list read (M1)                                                     | [gap]                                                                |
| NF-006 | Data retention | Daily cron prunes past-window rows; health reports retention                                        | [covered] (`retention.test.ts`)                                      |
| NF-007 | Accessibility  | Nav `aria-current`, focusable tooltips, labeled buttons, `data-explain` on forms; axe pass per view | [partial]                                                            |
| NF-008 | Visual         | Playwright visual + type-scale snapshots stable                                                     | [covered]                                                            |
| NF-009 | Observability  | Structured logs + request ID correlate the execution chain; audit trail persisted                   | [covered] → assert correlation [partial]                             |
| NF-010 | Determinism    | `canonicalStringify` hash stability (codepoint sort)                                                | [gap]                                                                |

---

## 16. Execution priority

1. **Production Lab proof** — LAB-066 managed-runner smoke against deployed ProjectFlow, including real linked telemetry and terminal evidence.
2. **Backend data-integrity edges** — API-141 (M1 corrupt-row), API-164 (M2 reset ordering), API-165/API-160-series (L1 reset CAS).
3. **Frontend direct regressions** — complete LAB-010 (M3) and UI-062 (M4) race tests; fix UI-074 filter/pagination.
4. **Verify-and-close prior findings** — API-089 (B5), API-101 (B11), API-085 (B3): confirm current behavior before closing.
5. **Untested trust surfaces** — GW-001..006 (gateway) and UI-001..004 (auth gate).
6. **Migration hygiene** — MIG-001..004.
7. **Coverage ratchets** — lab-runner (LAB-060..064), a direct `telemetry-repository.ts` test file, `packages/shared` function/branch gates.

**Release exit:** P0 tests, full workspace checks, build, browser smoke, production smoke, and LAB-066 pass for the exact release SHA. **Plan completion:** every route in §5, control in §8–§9, GitHub call in §6, and client/gateway method in §10–§11 has a happy path and at least one failure path; every §13 finding is covered or verify-closed; coverage gaps are closed or explicitly retained as tracked P1/P2 work.

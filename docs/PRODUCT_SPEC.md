# Darwin MVP Product Specification

**Status:** Current proof-of-life scope for the controlled ProjectFlow repository workflow.

## 1. Product statement

Darwin is a controlled software evolution engine. It observes privacy-safe product telemetry, converts behavior into deterministic selection pressure, asks GPT-5.6 for an evidence-citing mutation portfolio, supervises a bounded Codex repository change, validates the result, and records retained or reverted changes in Genome.

## 2. Target and operator

The single MVP target is ProjectFlow, a separately versioned and deployed task-management application. The operator is a product or engineering reviewer who controls target connection, mutation selection, repository execution, pull-request review, release, and rollback.

Darwin does not support arbitrary repositories or unsupervised production deployment.

## 3. Proof narrative

1. A participant completes an awkward fixed task in the deployed ProjectFlow baseline.
2. Observations shows the resulting anonymous semantic events and exact task-attempt trace.
3. Deterministic rules convert those records into citable selection pressure.
4. GPT-5.6 returns one selected mutation and bounded alternatives citing only that evidence.
5. A human selects a mutation bundle and creates an immutable implementation manifest.
6. ProjectFlow's authenticated GitHub Actions workflow asks Codex for a bounded patch, applies repository-owned policy, runs real validation, and opens a pull request and preview.
7. A human reviews and releases or rejects the candidate.
8. Genome retains the evidence hash, commits, checks, pull request, deployment, and any controlled revert.

The separate deterministic 10,000-event replay demonstrates scale and is always labelled synthetic. It is not presented as human telemetry or measured fitness.

## 4. Workspaces

### 4.1 Control room

Summarizes the connected target, measured event/session counts, evidence strength, selection pressure, live reasoning availability, measured fitness delta, release confidence, and retained Genome evolutions. The primary action opens the measured ProjectFlow study.

### 4.2 Target application

Verifies the configured ProjectFlow repository, tracked branch, immutable commit, `darwin.target.json`, production deployment, measured study URL, mutable/protected paths, source context, validation commands, and change budgets.

ProjectFlow remains a separate repository and deployment. Darwin contains no prebuilt evolved version.

### 4.3 Observations

Displays measured event, participant, session, and behavior-signal counts; ordered semantic traces; task attempts; evidence coverage; and rule-backed friction signals. Every signal must link to exact source event IDs. Measured and synthetic evidence never share counts or cohorts.

### 4.4 Mutations

Shows live GPT reasoning over a hashed evidence pack and immutable repository snapshot. Candidates state confidence, tradeoffs, evidence IDs, implementation context, acceptance criteria, and a validation plan. Model preference remains separate from deterministic evidence quality.

This workspace also shows the actual GitHub execution, changed files, diff, checks, pull request, preview, release, and rollback state. It never renders fabricated repository output or invented post-mutation fitness.

### 4.5 Genome

Preserves retained repository mutations and controlled reverts with their measured evidence, automated validation, commits, pull requests, deployments, and provenance. A candidate enters Genome only after the real repository workflow creates it; a retained mutation has survived controlled selection, while a rejected or reverted candidate has failed selection.

## 5. Functional requirements

### FR-1 Target boundary

Accept only the configured ProjectFlow target. Resolve and hash source context from one immutable commit and enforce repository-owned mutation policy.

### FR-2 Real telemetry

Capture privacy-conscious, ordered, schema-valid ProjectFlow events with anonymous participant, session, task-attempt, application-version, schema-version, viewport, evidence-class, and source provenance.

### FR-3 Deterministic evidence

Reconstruct attempts and derive friction signals without a language model. Preserve stable rule IDs, supporting event IDs, coverage, limitations, canonical JSON, and a SHA-256 evidence hash.

### FR-4 Live reasoning

Call GPT-5.6 only after deterministic evidence and an immutable repository snapshot exist. Return one selected mutation and two to five alternatives. Reject unavailable, invalid, unsupported, or uncited recommendations without substituting mock prose.

### FR-5 Human selection

Require an operator to select the mutation bundle and explicitly initiate the controlled repository workflow. Require separate pull-request review and release authority before a candidate changes production.

### FR-6 Controlled implementation

Dispatch ProjectFlow's authenticated workflow. Codex proposes a patch in a read-only-content job; a separate repository-owned job enforces paths and budgets, applies the patch, validates it, commits it, and creates the pull request and preview.

### FR-7 Honest validation and fitness

Display genuine automated checks and human evidence with explicit evidence classes. Calculate evolved fitness on the server only from compatible baseline and post-release measured cohorts, and persist the versioned component scores, evidence hashes, cohort metadata, and limitations with the Genome artifact. Never emit a numeric comparison for an undersized, incompatible, or rolled-back cohort.

### FR-8 Genome and revert

Persist execution, release, deployment, and rollback provenance. A revert is another reviewed ProjectFlow pull request and release, not a local UI variant switch.

### FR-9 Synthetic scale replay

Generate exactly 10,000 deterministic events from the configured seed. Store and display replay summaries separately from measured evidence.

### FR-10 Failure behavior

Collection and deterministic parsing work without an OpenAI key. Missing GPT, GitHub, validation, preview, or release state remains explicit and fails closed.

## 6. Non-functional requirements

- Complete the proof loop reliably in a three-minute demonstration.
- Keep core controls keyboard accessible and usable at desktop and mobile widths.
- Keep credentials out of browser bundles and provider errors out of public responses.
- Provide structured, operator-readable failure states.
- Preserve deterministic reset and reproducible validation commands.
- Never mix measured, automated, predicted, or synthetic claims.

## 7. Success standard

The proof succeeds when a reviewer can inspect one real event, follow it through a deterministic evidence ID and live GPT citation, review the actual Codex-authored repository diff and checks, explicitly release or reject it, and inspect the resulting Genome provenance without editing source during the presentation.

## 8. Out of scope

- arbitrary repositories beyond configured ProjectFlow;
- unsupervised production deployment;
- multi-tenant identity, billing, or enterprise access control;
- generic visual editing;
- statistical A/B testing infrastructure;
- raw user content, keystrokes, page text, or personal identity capture.

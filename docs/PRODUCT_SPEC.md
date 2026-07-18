# Darwin MVP Product Specification

## 1. Product statement

Darwin is an autonomous product engineer. It observes application usage, detects product friction, proposes a measurable improvement, uses an engineering agent to implement it, validates the result, and preserves the change in an evolutionary history.

## 2. Target category

Developer Tools.

## 3. Target user

Product and engineering teams responsible for internal or SaaS applications with enough usage data to reveal repeated friction.

## 4. Core user story

As a product engineer, I want Darwin to analyse application behaviour and produce an evidence-backed code improvement so that the product continuously becomes easier to use.

## 5. MVP narrative

The user completes an awkward fixed task in the deployed ProjectFlow baseline.
Darwin shows the resulting anonymous raw events, reconstructs the task attempt and
links a deterministic navigation-friction signal to those records. GPT-5.6
selects an evidence-backed mutation, Codex implements the approved brief, and
Darwin preserves the evidence hash, real diff and validation result. A separate
10,000-event synthetic replay demonstrates scale without being presented as
human telemetry.

## 6. Primary screens

### 6.1 Landing / control room

Must show:

- Darwin wordmark
- “Helping your software evolve.”
- connected target application: ProjectFlow
- current genome version
- interactions observed
- evolution cycles
- fitness score
- primary CTA: `Open measured study`

### 6.2 ProjectFlow organism

A standalone functional study application plus a toggleable control-room preview.

Baseline:

- Dashboard
- Projects
- Tasks
- Reports
- Settings
- buried search
- overloaded dashboard

Evolved:

- My Work
- Projects
- Insights
- global search
- global quick-create task
- concise dashboard

### 6.3 Observation stream

Truthful display of:

- real event receipt time and source provenance
- participant, session and task-attempt identity
- real measured event, session, and participant counts
- evidence coverage and recurrence counts
- friction signals
- workflow abandonment

### 6.4 Selection pressure report

Rank findings by impact and confidence. The intended leading finding is difficulty locating assigned tasks.

### 6.5 Mutation proposal

Fields:

- mutation ID and name
- observation
- evidence
- hypothesis
- implementation summary
- predicted fitness gain
- confidence
- risk
- affected files/components
- approve/reject controls

### 6.6 Mutation execution

Show real steps:

- implementation brief generated
- source diff loaded or produced
- unit tests
- build
- UX acceptance checks
- fitness replay

### 6.7 Fossil record

Timeline of versions and retained/rejected mutations.

## 7. Functional requirements

### FR-1 Real telemetry

Capture privacy-conscious, ordered, schema-valid events from standalone
ProjectFlow and preserve task-attempt and source provenance.

### FR-2 Deterministic evidence

Reconstruct attempts and derive funnels, path loops, abandonment, search use,
task duration and feature usage without a language model.

### FR-3 Scale replay

Generate exactly 10,000 seeded synthetic events within seconds and keep them
separate from real-study evidence.

### FR-4 Analysis

Return a live GPT-5.6 portfolio containing one selected mutation and two to five
alternatives, with every behavioral claim citing a known evidence ID. Fail closed
when live reasoning is unavailable.

### FR-5 Approval

No mutation is applied without explicit approval in the UI.

### FR-6 Validation

Run or load genuine build/test results and calculate evolved fitness on the
server from compatible baseline and evolved measured cohorts. Persist the
versioned component scores, evidence hashes, cohort metadata and limitations
with the Genome artifact. Never emit a numeric comparison for an undersized,
incompatible or rolled-back cohort.

### FR-7 Variant switching

The organism must visibly change between baseline and evolved states without a redeploy during the demo.

### FR-8 Timeline

Persist evolution cycles locally or in D1.

### FR-9 Evidence availability

Collection and deterministic evidence parsing work without an OpenAI key. The UI
must clearly report that reasoning is unavailable and must not invent a proposal.

## 8. Non-functional requirements

- Complete demo flow under three minutes.
- First meaningful paint under two seconds on broadband.
- Keyboard accessible core controls.
- Responsive at 1440x900 and 1920x1080.
- No secrets in browser bundles.
- Structured error states.
- Deterministic demo reset.

## 9. Success metrics

The demo succeeds when:

- judges understand the idea in 20 seconds
- the application visibly changes
- the evidence-to-change chain is clear
- judges can inspect a raw event supporting a selected finding
- measured, automated, predicted and synthetic outcomes are unmistakable
- GPT-5.6 and Codex have distinct roles
- the project works without manual repair

## 10. Out of scope

- unsupervised production deployment
- broad repository compatibility
- real A/B testing infrastructure
- user authentication
- billing
- real organisation analytics integrations

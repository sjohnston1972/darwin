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
The user opens Darwin's control room and sees ProjectFlow v1 with a fitness score of 67. They run a seeded simulation representing six months and 10,000 interactions. Darwin identifies repeated navigation friction, proposes a mutation, creates an implementation brief, validates the evolved variant, and records fitness increasing to approximately 89.

## 6. Primary screens

### 6.1 Landing / control room
Must show:
- Darwin wordmark
- “Software that evolves.”
- connected organism: ProjectFlow
- current genome version
- interactions observed
- evolution cycles
- fitness score
- primary CTA: `Observe 10,000 interactions`

### 6.2 ProjectFlow organism
Toggleable baseline and evolved variants.

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
Animated but truthful display of:
- simulated time passing
- persona activity
- event count
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

### FR-1 Simulation
Generate exactly 10,000 seeded telemetry events within seconds.

### FR-2 Aggregation
Aggregate raw events into funnels, path loops, abandonment, search use, task duration and feature usage.

### FR-3 Analysis
Return a schema-valid mutation proposal from mock or GPT-5.6 analysis.

### FR-4 Approval
No mutation is applied without explicit approval in the UI.

### FR-5 Validation
Run or load genuine build/test results and calculate evolved fitness.

### FR-6 Variant switching
The organism must visibly change between baseline and evolved states without a redeploy during the demo.

### FR-7 Timeline
Persist evolution cycles locally or in D1.

### FR-8 Offline demo mode
The entire flow works without an OpenAI key using deterministic fixtures.

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
- GPT-5.6 and Codex have distinct roles
- the project works without manual repair

## 10. Out of scope
- unsupervised production deployment
- broad repository compatibility
- real A/B testing infrastructure
- user authentication
- billing
- real organisation analytics integrations

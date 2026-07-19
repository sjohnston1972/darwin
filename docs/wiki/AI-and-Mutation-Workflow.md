# AI and Mutation Workflow

> Canonical product boundary: [`docs/PRODUCT_SPEC.md`](https://github.com/sjohnston1972/darwin/blob/main/docs/PRODUCT_SPEC.md). Canonical trust and repository flow: [`docs/ARCHITECTURE.md`](https://github.com/sjohnston1972/darwin/blob/main/docs/ARCHITECTURE.md).

## Roles

Darwin separates three responsibilities:

| Component                | Responsibility                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| deterministic TypeScript | parse events, reconstruct journeys, derive evidence, enforce contracts |
| GPT-5.6                  | explain causal pressure and propose a structured mutation portfolio    |
| Codex                    | implement only the human-approved, repository-bounded manifest         |

GPT does not invent telemetry. Codex does not choose which product mutation to run.

## GPT invocation context

One Responses API request is assembled from:

- the senior product-analysis system prompt;
- versioned mutation examples and project reasoning context;
- the exact approved ProjectFlow source snapshot;
- evidence hash/class/quality;
- task summaries;
- citable friction signals;
- complete privacy-safe ordered journeys;
- application map, mutable areas, and protected areas.

The repository content is explicitly treated as data, not instructions.

## Prompt caching

Darwin supplies a prompt cache key based on the context version and repository source hash with a 24-hour retention request. Its own D1 analysis cache is keyed by:

- evidence hash;
- model;
- prompt/context version;
- repository source hash;
- repository base SHA.

An identical evidence/source request returns the stored validated analysis instead of invoking GPT again.

## Structured output

GPT must return:

- an evidence assessment;
- one to eight causal pressure clusters;
- one selected mutation;
- two to five genuine alternatives;
- cited evidence IDs and pressure-cluster IDs;
- hypothesis, change, scope, tradeoffs, acceptance criteria, and validation plan;
- evidence strength, user impact, feasibility, validation clarity, and total score;
- unsupported ideas that were rejected.

Darwin rejects unknown evidence, unknown clusters, unobserved targets, protected/out-of-scope areas, malformed JSON, timeouts, and unavailable live reasoning. It never substitutes mock recommendation prose.

Additional portfolio coherence validation is tracked in issue [#16](https://github.com/sjohnston1972/darwin/issues/16).

## Human selection

The Mutations workspace ranks all candidates. Each row can be expanded independently and selected with a checkbox. The selected bundle becomes one manifest.

The manifest contains:

- analysis ID and mutation IDs;
- evidence and manifest hashes;
- repository base SHA/source snapshot;
- combined Codex brief;
- evidence citations;
- allowed and protected paths;
- acceptance criteria;
- target-owned validation commands.

Changing the selected bundle creates a different manifest hash.

## Codex execution

Darwin dispatches ProjectFlow's `darwin-evolve.yml` workflow with the execution ID, manifest ID, and callback URL. The target workflow retrieves the manifest using its callback credential, verifies repository identity and base SHA, runs Codex, and enforces:

- mutable path allow-list;
- protected path deny-list;
- maximum changed files;
- maximum changed lines;
- repository-owned validation commands;
- pull request and preview creation only after checks pass.

Darwin displays the returned patch, changed files, checks, Codex report, workflow, pull request, and preview.

## Release

The candidate stays isolated until the operator clicks **Release reviewed mutation**. Darwin squash-merges the exact reviewed pull request, enters deployment verification, and polls ProjectFlow production until its semantic metadata reports both the merged SHA and matching app version. Only that verified timestamp opens the next measurement cycle. Mixed application versions are rejected from a single evidence pack, and Observations displays the precise measured boundary.

## Rollback

A released execution can prepare a controlled rollback. ProjectFlow creates an inverse Git change on a new branch, runs repository validation, opens a rollback pull request, and deploys a preview. The operator must separately release that rollback.

Rollback never rewrites history with `git reset`; it produces another reviewable repository event.

## Fitness

Repository checks establish technical validity. They do not establish product fitness. Fitness requires a distinct, compatible measured cohort against the verified deployed mutation.

The Worker calculates formula `1.0.0` on a 0-100 scale from task completion (30%), navigation efficiency (25%), error rate (15%), feature discovery (15%), and median duration (15%). Baseline and evolved evidence must use the same study and task set, refer to compatible commits and different application versions, cover all three fixed tasks, and contain at least three terminal attempts, sessions, and anonymous participants per cohort. A failed gate produces an auditable `insufficient` outcome without numeric scores.

The persisted outcome contains both evidence hashes, cohort metadata, formula version, component scores, aggregate scores, delta, and limitations. Genome attaches it to the repository execution that produced the deployment. Releasing a rollback marks that outcome `rolled_back`, clears its numeric comparison, and retains the invalidation in the fossil record.

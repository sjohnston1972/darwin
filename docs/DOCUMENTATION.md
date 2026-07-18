# Documentation Ownership and Freshness

The repository is the source of truth. Hosted GitHub wiki pages mirror `docs/wiki`; they link back to canonical repository documents instead of maintaining a second product or route specification.

## Ownership map

| Source | Owns | Review trigger |
| --- | --- | --- |
| `README.md` | entry point, supported workflow, commands, deployment, demo links | any release or operator-flow change |
| `docs/PRODUCT_SPEC.md` | current MVP boundaries and product language | workspace, approval, fitness, or scope change |
| `docs/ARCHITECTURE.md` | components, ownership, trust, persistence, state flow | service, repository, authentication, or persistence change |
| `docs/REAL_TELEMETRY_PLAN.md` | collection boundary, detectors, evidence classes, reasoning handoff | telemetry schema, detector, evidence, or retention change |
| `docs/DEMO_SCRIPT.md` | exact presentation sequence and claims | UI, reset, repository workflow, or release change |
| `workers/api/src/api-route-contract.ts` | route, access boundary, capability, and purpose | every Worker route change |
| `docs/generated/API_ROUTES.md` | generated route reference | generated only by `npm run docs:generate` |
| `docs/wiki/*` | hosted operator/contributor guidance | source-document or operational change |

Code owners are responsible for updating the adjacent source documentation in the same pull request. Reviewers should reject claims that describe planned behavior as current, combine measured and synthetic evidence, or imply unsupervised deployment.

## Release freshness checklist

- [ ] README workflow, commands, supported scope, and screenshots match the release.
- [ ] Product terms use Target application, Observations, Mutations, Genome, fitness, selection pressure, and retained/reverted consistently.
- [ ] Measured, automated, predicted, and synthetic evidence remain explicitly separated.
- [ ] Repository execution, approval, release, and rollback claims match real GitHub behavior.
- [ ] New or changed routes update `api-route-contract.ts`; `npm run docs:generate` has been committed.
- [ ] Zod request/response changes are linked from the API and architecture guidance.
- [ ] D1 migrations, secrets, retention, smoke checks, and recovery steps are reflected in operations documentation.
- [ ] Demo reset and failure branches can be performed without editing source.
- [ ] Wiki source pages link to canonical repository documents and have been published to the hosted GitHub wiki when the release is cut.
- [ ] `npm run docs:check`, `npm run format:check`, `npm run typecheck`, `npm run test`, and `npm run build` pass from a clean checkout.

## Historical material

If a superseded plan must remain for provenance, move it under `docs/archive/`, add a date and immutable commit reference, and label it historical at the top. Historical plans must not be linked as current operating guidance.

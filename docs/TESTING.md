# Verification and coverage

`npm test` runs the fast workspace suites. `npm run test:coverage` runs the same suites with per-workspace floors measured on the 2026-07-19 baseline; CI blocks regressions below those floors. Raise a floor whenever sustained coverage increases rather than lowering it to accommodate new uncovered code.

Direct boundary coverage includes operator capabilities and target signatures (`security/auth.test.ts`), study identity and expiry (`security/study-session.test.ts`), callback binding/expiry/replay (`security/callback.test.ts`), streamed payload limits, D1 execution compare-and-swap and malformed rows, D1 Lab experiment/run/action transitions, and runner retry/provenance behavior.

The API integration suite intentionally covers route orchestration, callback state transitions, release/rollback idempotency, evidence-to-manifest flow, and provider adapters indirectly. Browser telemetry delivery and control-room hydration have dedicated package/view tests. Playwright owns the cross-process demo contract.

Type-aware async linting is enabled first on the trust-boundary security modules, browser telemetry client/hydration, and Darwin Lab runner. This incremental scope makes floating and misused promises blocking where lost work is highest-risk; extend the same rule set as oversized orchestration modules are extracted.

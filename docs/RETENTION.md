# Data retention and deletion

Darwin stores only semantic, privacy-conscious telemetry. Retention policy version `2026-07-19.1` applies these limits:

| Data class | Default retention | Treatment |
| --- | ---: | --- |
| Human-study raw telemetry and participant workspaces | 30 days | Deleted by the daily Worker retention job. |
| Darwin Lab and other automated raw telemetry | 14 days | Deleted separately from human-study records. |
| Scale replay | Process lifetime | The seeded replay is not persisted as real telemetry. |
| Evidence packs and structured analyses | 180 days when not retained | Records linked to a retained mutation remain available for the bounded audit period. |
| Terminal execution patches, check output, and Codex final messages | 90 days | Large output is compacted; commit, PR, status, hashes, provenance, and timestamps remain. |
| Release and rollback audit metadata | 365 days | Kept only to explain controlled repository changes. |

Each study is capped at 100,000 stored events by default (`DARWIN_STUDY_EVENT_QUOTA`, bounded from 1,000 to 1,000,000). Event-ID retries remain idempotent at the quota boundary. Darwin Lab population and action budgets provide an additional per-experiment bound.

Cloudflare invokes the scheduled retention handler daily at 03:17 UTC. Operators with the dedicated `delete_data` capability can also run compaction or submit a targeted participant, study, or execution `DELETE` request to `/api/retention/delete`. Targeted deletion requires the literal confirmation value `DELETE`; it does not use the broad demo reset path. Production smoke telemetry uses a commit-derived event identity and is removed by participant immediately after verification.

Ingestion enforces both the configured per-study quota (`DARWIN_STUDY_EVENT_QUOTA`, 100,000 by default) and the single configured ProjectFlow target quota (`DARWIN_TARGET_EVENT_QUOTA`, 1,000,000 by default). Duplicate event IDs remain idempotent and do not consume another quota slot. System status exposes both limits.

The System status workspace reports stored record counts, the per-study quota, policy version, and last completed retention run. Deletion audit logs contain scope and counts, never deleted payload contents.

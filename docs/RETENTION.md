# Data retention and deletion

Darwin stores pseudonymous product telemetry and controlled mutation artifacts only for the ProjectFlow proof of life. Policy `1.0.0` uses the following bounded lifetimes.

| Data class                                 |              Retention | Expiry action              | Justification                                                                             |
| ------------------------------------------ | ---------------------: | -------------------------- | ----------------------------------------------------------------------------------------- |
| validated raw telemetry                    |                30 days | delete                     | short-lived source material for deterministic friction detection                          |
| participant workspace                      |   30 days after update | delete                     | study convenience state, not a fossil record                                              |
| evidence packs                             |                90 days | delete                     | reproducibility window for measured selection pressure                                    |
| GPT evidence analyses                      |                90 days | delete                     | review window for an evidence-citing proposal                                             |
| Codex manifests                            |               365 days | delete                     | bounded mutation approval record                                                          |
| execution patches and Codex final output   |                30 days | set large fields to `null` | review material is useful briefly but expensive and may contain repository output         |
| compact repository execution/fossil record |               365 days | delete                     | preserves commit, pull-request, checks, release and rollback provenance for the demo year |
| outcome validations                        |               365 days | delete                     | bounded fitness evidence history                                                          |
| callback credentials/signatures            |               24 hours | delete                     | replay protection for an active repository workflow only                                  |
| retention sweep audit                      |                90 days | delete                     | aggregate deletion counts only; no raw event, patch, prompt or participant content        |
| active target connection                   | until disconnect/reset | delete explicitly          | required runtime configuration rather than behavioral evidence                            |

Exactly 10,000 scale-replay events remain in the existing 15-minute, four-entry in-memory simulation cache and are never inserted into these measured telemetry tables.

## Quotas

The Worker enforces both limits during each D1 insert:

- `DARWIN_MAX_EVENTS_PER_STUDY`, default `50000`;
- `DARWIN_MAX_EVENTS_PER_TARGET`, default `250000` for the single configured ProjectFlow organism.

Events beyond either limit are rejected in the acknowledgement rather than evicting newer or unrelated study data. The System status view moves retention health to `attention` at 90% usage or when expired records await sweeping.

## Scheduled compaction

The Worker cron runs every day at `03:17 UTC`. It deletes expired rows, removes expired callback material, compacts large execution fields, and stores only aggregate counts for the sweep. Operators can run the same idempotent operation with `POST /api/retention/sweep`.

Every time-bounded table has an indexed expiry field. Repository executions have separate indexed artifact and compact-record expiries so patch removal does not erase commit-level fossil provenance.

Compact manifests, validations, and execution rows retain an indexed study identifier for their bounded fossil lifetime. This is lineage metadata only, but it ensures a later study-deletion request can still find every derivative after the larger 90-day analysis JSON has expired.

## Targeted deletion

All deletion routes require the operator `reset` capability:

- `DELETE /api/studies/{studyId}/participants/{participantId}` removes that participant's events and workspace. It also invalidates derived study evidence, analyses, manifests and executions because those artifacts may cite the deleted contribution.
- `DELETE /api/studies/{studyId}` removes all raw, workspace and derived artifacts for one study without resetting the active target connection or other studies.
- `DELETE /api/repository-executions/{executionId}/artifacts` removes one execution record and its callback replay material.

Responses contain counts by data class and never echo deleted payloads. The production smoke test uses one deterministic automated participant/event identity and deletes it immediately after D1 readback verification.

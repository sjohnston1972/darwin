# Operational observability

Every Worker request accepts or generates an `X-Darwin-Request-ID`, returns it to the caller, and includes it in structured completion and provider-timing logs. OpenAI, GitHub, target verification, and diagnostics D1 operations emit provider, operation, outcome, and latency. Expected rejections use warning-level records; failures include only the error class.

Privileged mutations also create a bounded D1 audit event containing actor class, target route, action, outcome, request ID, duration, and transition state. The diagnostics API and System status view return the 30 most recent records and provide a JSON export.

Logs and audit events must never include bearer tokens, signing secrets, request bodies, raw telemetry, field values, arbitrary page text, OpenAI prompts, repository file content, patches, or callback payloads. Participant/session identifiers are not written to operational logs. Provider errors are reduced to status/error class.

Platform logs follow the Cloudflare account retention setting. D1 operational audit metadata follows the 365-day controlled-change audit period described in [RETENTION.md](RETENTION.md); raw execution output follows the shorter compaction period. Request tracing is diagnostic evidence, not product fitness evidence.

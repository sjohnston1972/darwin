CREATE TABLE IF NOT EXISTS operational_audit_events (
  audit_event_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  duration_ms INTEGER NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_audit_events_recent
  ON operational_audit_events(occurred_at DESC, audit_event_id DESC);

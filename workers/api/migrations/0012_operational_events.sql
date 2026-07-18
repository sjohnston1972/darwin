CREATE TABLE IF NOT EXISTS operational_events (
  event_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('audit', 'metric')),
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  before_state TEXT,
  after_state TEXT,
  provider TEXT CHECK (provider IN ('d1', 'openai', 'github', 'target')),
  operation TEXT,
  duration_ms INTEGER NOT NULL,
  error_code TEXT,
  event_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_events_occurred
  ON operational_events(occurred_at DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS idx_operational_events_provider_operation
  ON operational_events(provider, operation, occurred_at DESC);

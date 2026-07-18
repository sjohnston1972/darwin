CREATE TABLE IF NOT EXISTS target_request_signatures (
  signature TEXT PRIMARY KEY,
  used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS target_request_signatures_used_at
  ON target_request_signatures(used_at);

CREATE TABLE IF NOT EXISTS operational_metrics (
  metric_name TEXT PRIMARY KEY,
  metric_value INTEGER NOT NULL DEFAULT 0 CHECK (metric_value >= 0),
  updated_at TEXT NOT NULL
);

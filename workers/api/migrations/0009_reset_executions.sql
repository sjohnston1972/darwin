CREATE TABLE IF NOT EXISTS reset_executions (
  reset_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  execution_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reset_executions_updated
  ON reset_executions(updated_at DESC);

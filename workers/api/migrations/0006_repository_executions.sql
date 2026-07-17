CREATE TABLE IF NOT EXISTS repository_executions (
  execution_id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL UNIQUE,
  analysis_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  execution_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repository_executions_analysis_updated
  ON repository_executions(analysis_id, updated_at DESC);

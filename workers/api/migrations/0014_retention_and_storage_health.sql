CREATE INDEX IF NOT EXISTS idx_telemetry_events_retention
  ON telemetry_events(source, received_at);

CREATE INDEX IF NOT EXISTS idx_participant_workspaces_retention
  ON participant_workspaces(updated_at);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_retention
  ON analysis_runs(generated_at);

CREATE INDEX IF NOT EXISTS idx_evidence_analyses_retention
  ON evidence_analyses(created_at);

CREATE INDEX IF NOT EXISTS idx_lab_experiments_retention
  ON lab_experiments(status, updated_at);

CREATE TABLE IF NOT EXISTS retention_runs (
  retention_run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  deleted_records INTEGER NOT NULL,
  compacted_executions INTEGER NOT NULL,
  policy_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_completed
  ON retention_runs(completed_at DESC);

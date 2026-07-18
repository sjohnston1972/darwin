CREATE INDEX IF NOT EXISTS idx_repository_executions_status_updated_id
  ON repository_executions(status, updated_at DESC, execution_id DESC);

CREATE INDEX IF NOT EXISTS idx_repository_executions_updated_id
  ON repository_executions(updated_at DESC, execution_id DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_analyses_evidence
  ON evidence_analyses(evidence_id);

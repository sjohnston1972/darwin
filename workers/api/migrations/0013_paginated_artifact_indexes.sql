CREATE INDEX IF NOT EXISTS idx_repository_executions_page
  ON repository_executions(updated_at DESC, execution_id DESC);

CREATE INDEX IF NOT EXISTS idx_repository_executions_archive_page
  ON repository_executions(status, updated_at DESC, execution_id DESC);

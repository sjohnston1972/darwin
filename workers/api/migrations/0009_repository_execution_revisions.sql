ALTER TABLE repository_executions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

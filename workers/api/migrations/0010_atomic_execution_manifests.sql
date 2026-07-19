CREATE TABLE IF NOT EXISTS codex_manifest_versions (
  manifest_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  repository_commit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  manifest_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_codex_manifest_versions_analysis_created
  ON codex_manifest_versions(analysis_id, created_at DESC);

ALTER TABLE repository_executions
  ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_repository_executions_updated
  ON repository_executions(updated_at DESC);

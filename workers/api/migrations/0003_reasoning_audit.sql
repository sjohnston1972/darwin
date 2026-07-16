CREATE TABLE IF NOT EXISTS evidence_analyses (
  analysis_id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  cache_key TEXT NOT NULL UNIQUE,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  analysis_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_analyses_study_created
  ON evidence_analyses(study_id, created_at DESC);

CREATE TABLE IF NOT EXISTS codex_manifests (
  manifest_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL UNIQUE,
  mutation_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  repository_commit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  manifest_json TEXT NOT NULL
);

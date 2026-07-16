CREATE TABLE IF NOT EXISTS analysis_runs (
  evidence_id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  app_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_event_count INTEGER NOT NULL,
  evidence_hash TEXT NOT NULL UNIQUE,
  evidence_pack_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analysis_study_generated
  ON analysis_runs(study_id, generated_at DESC);

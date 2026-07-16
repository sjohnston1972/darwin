CREATE TABLE IF NOT EXISTS outcome_validations (
  validation_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  baseline_evidence_hash TEXT NOT NULL,
  evolved_evidence_hash TEXT NOT NULL,
  validation_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcome_validations_generated
  ON outcome_validations(generated_at DESC);

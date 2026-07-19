ALTER TABLE codex_manifest_versions ADD COLUMN expires_at TEXT;
ALTER TABLE codex_manifest_versions ADD COLUMN study_id TEXT;

UPDATE codex_manifest_versions
SET expires_at = datetime(created_at, '+365 days'),
    study_id = (
      SELECT study_id FROM evidence_analyses
      WHERE evidence_analyses.analysis_id = codex_manifest_versions.analysis_id
    )
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_codex_manifest_versions_expiry
  ON codex_manifest_versions(expires_at);

CREATE INDEX IF NOT EXISTS idx_codex_manifest_versions_study
  ON codex_manifest_versions(study_id, created_at DESC);

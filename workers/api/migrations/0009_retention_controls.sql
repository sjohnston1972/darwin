ALTER TABLE telemetry_events ADD COLUMN expires_at TEXT;
UPDATE telemetry_events
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', received_at, '+30 days')
WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_telemetry_events_expiry
  ON telemetry_events(expires_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_study_expiry
  ON telemetry_events(study_id, expires_at);

ALTER TABLE participant_workspaces ADD COLUMN expires_at TEXT;
UPDATE participant_workspaces
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+30 days')
WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_participant_workspaces_expiry
  ON participant_workspaces(expires_at);

ALTER TABLE analysis_runs ADD COLUMN expires_at TEXT;
UPDATE analysis_runs
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', generated_at, '+90 days')
WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_runs_expiry
  ON analysis_runs(expires_at);

ALTER TABLE evidence_analyses ADD COLUMN expires_at TEXT;
UPDATE evidence_analyses
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+90 days')
WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_analyses_expiry
  ON evidence_analyses(expires_at);

ALTER TABLE codex_manifests ADD COLUMN expires_at TEXT;
ALTER TABLE codex_manifests ADD COLUMN study_id TEXT;
UPDATE codex_manifests
SET expires_at = COALESCE(
      expires_at,
      strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+365 days')
    ),
    study_id = COALESCE(
      study_id,
      (SELECT study_id FROM evidence_analyses
       WHERE evidence_analyses.analysis_id = codex_manifests.analysis_id)
    )
WHERE expires_at IS NULL OR study_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_codex_manifests_expiry
  ON codex_manifests(expires_at);
CREATE INDEX IF NOT EXISTS idx_codex_manifests_study
  ON codex_manifests(study_id, created_at DESC);

ALTER TABLE outcome_validations ADD COLUMN expires_at TEXT;
ALTER TABLE outcome_validations ADD COLUMN study_id TEXT;
UPDATE outcome_validations
SET expires_at = COALESCE(
      expires_at,
      strftime('%Y-%m-%dT%H:%M:%fZ', generated_at, '+365 days')
    ),
    study_id = COALESCE(
      study_id,
      (SELECT study_id FROM analysis_runs
       WHERE analysis_runs.evidence_hash = outcome_validations.baseline_evidence_hash
          OR analysis_runs.evidence_hash = outcome_validations.evolved_evidence_hash
       LIMIT 1)
    )
WHERE expires_at IS NULL OR study_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_outcome_validations_expiry
  ON outcome_validations(expires_at);
CREATE INDEX IF NOT EXISTS idx_outcome_validations_study
  ON outcome_validations(study_id, generated_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_outcome_validations_expiry
AFTER INSERT ON outcome_validations
WHEN NEW.expires_at IS NULL OR NEW.study_id IS NULL
BEGIN
  UPDATE outcome_validations
  SET expires_at = COALESCE(
        NEW.expires_at,
        strftime('%Y-%m-%dT%H:%M:%fZ', NEW.generated_at, '+365 days')
      ),
      study_id = COALESCE(
        NEW.study_id,
        (SELECT study_id FROM analysis_runs
         WHERE evidence_hash = NEW.baseline_evidence_hash
            OR evidence_hash = NEW.evolved_evidence_hash
         LIMIT 1)
      )
  WHERE validation_id = NEW.validation_id;
END;

ALTER TABLE repository_executions ADD COLUMN created_at TEXT;
ALTER TABLE repository_executions ADD COLUMN study_id TEXT;
ALTER TABLE repository_executions ADD COLUMN artifact_expires_at TEXT;
ALTER TABLE repository_executions ADD COLUMN record_expires_at TEXT;
UPDATE repository_executions
SET created_at = COALESCE(json_extract(execution_json, '$.createdAt'), updated_at),
    study_id = COALESCE(
      study_id,
      (SELECT study_id FROM evidence_analyses
       WHERE evidence_analyses.analysis_id = repository_executions.analysis_id)
    ),
    artifact_expires_at = strftime(
      '%Y-%m-%dT%H:%M:%fZ',
      COALESCE(json_extract(execution_json, '$.createdAt'), updated_at),
      '+30 days'
    ),
    record_expires_at = strftime(
      '%Y-%m-%dT%H:%M:%fZ',
      COALESCE(json_extract(execution_json, '$.createdAt'), updated_at),
      '+365 days'
    )
WHERE created_at IS NULL
   OR study_id IS NULL
   OR artifact_expires_at IS NULL
   OR record_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_repository_executions_artifact_expiry
  ON repository_executions(artifact_expires_at);
CREATE INDEX IF NOT EXISTS idx_repository_executions_record_expiry
  ON repository_executions(record_expires_at);
CREATE INDEX IF NOT EXISTS idx_repository_executions_study
  ON repository_executions(study_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_callback_signatures_used
  ON execution_callback_signatures(used_at);

CREATE TABLE IF NOT EXISTS retention_runs (
  run_id TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_completed
  ON retention_runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_runs_expiry
  ON retention_runs(expires_at);

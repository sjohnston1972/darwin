CREATE TABLE IF NOT EXISTS telemetry_events (
  event_id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  task_attempt_id TEXT,
  app_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('real_user', 'automated', 'synthetic')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  route TEXT NOT NULL,
  target_id TEXT,
  event_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS telemetry_study_participant_session_sequence
  ON telemetry_events(study_id, participant_id, session_id, sequence);

CREATE INDEX IF NOT EXISTS telemetry_study_version
  ON telemetry_events(study_id, app_version, received_at);

CREATE INDEX IF NOT EXISTS telemetry_attempt_sequence
  ON telemetry_events(task_attempt_id, sequence);

CREATE TABLE IF NOT EXISTS participant_workspaces (
  study_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  workspace_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (study_id, participant_id)
);

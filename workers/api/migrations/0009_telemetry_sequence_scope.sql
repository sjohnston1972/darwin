DROP INDEX IF EXISTS telemetry_session_sequence;

CREATE UNIQUE INDEX IF NOT EXISTS telemetry_study_participant_session_sequence
  ON telemetry_events(study_id, participant_id, session_id, sequence);

CREATE INDEX IF NOT EXISTS idx_telemetry_study_received_event
  ON telemetry_events(study_id, received_at, event_id);

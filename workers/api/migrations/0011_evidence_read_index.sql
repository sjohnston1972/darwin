CREATE INDEX IF NOT EXISTS idx_telemetry_evidence_read
  ON telemetry_events(study_id, source, received_at DESC, sequence DESC);

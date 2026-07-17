CREATE TABLE IF NOT EXISTS target_connections (
  connection_id TEXT PRIMARY KEY,
  connected_at TEXT NOT NULL,
  connection_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_target_connections_connected
  ON target_connections(connected_at DESC);

CREATE TABLE IF NOT EXISTS demo_state (
  state_key TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_callback_credentials (
  execution_id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_callback_signatures (
  execution_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (execution_id, signature),
  FOREIGN KEY (execution_id)
    REFERENCES execution_callback_credentials(execution_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS callback_credentials_expiry
  ON execution_callback_credentials(expires_at);

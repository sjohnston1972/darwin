CREATE TABLE IF NOT EXISTS lab_experiments (
  experiment_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_experiments_status_created
  ON lab_experiments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS lab_agent_runs (
  run_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  persona TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_agent_runs_experiment
  ON lab_agent_runs(experiment_id, started_at);

CREATE TABLE IF NOT EXISTS lab_agent_actions (
  action_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  action_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES lab_agent_runs(run_id),
  FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_agent_actions_run
  ON lab_agent_actions(run_id, ordinal);

CREATE TABLE IF NOT EXISTS lab_evidence_records (
  evidence_pack_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
);

CREATE TABLE IF NOT EXISTS lab_analyses (
  analysis_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  evidence_pack_id TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id),
  FOREIGN KEY (evidence_pack_id) REFERENCES lab_evidence_records(evidence_pack_id)
);

CREATE TABLE IF NOT EXISTS lab_selection_results (
  selection_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
);

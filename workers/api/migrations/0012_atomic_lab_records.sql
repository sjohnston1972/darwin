ALTER TABLE lab_experiments
  ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE lab_agent_runs
  ADD COLUMN population_ordinal INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_run_population_slot
  ON lab_agent_runs(experiment_id, population_ordinal);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_action_ordinal
  ON lab_agent_actions(run_id, ordinal);

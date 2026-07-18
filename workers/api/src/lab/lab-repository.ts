import {
  LabExperimentSchema,
  type LabExperiment,
  type LabExperimentStatus,
} from '@darwin/shared';

export interface LabRepository {
  saveExperiment(experiment: LabExperiment): Promise<void>;
  getExperiment(experimentId: string): Promise<LabExperiment | null>;
  listExperiments(status?: LabExperimentStatus): Promise<LabExperiment[]>;
  reset(): Promise<void>;
}

const experimentStore = new Map<string, LabExperiment>();

const cloneExperiment = (experiment: LabExperiment) =>
  LabExperimentSchema.parse(structuredClone(experiment));

export class InMemoryLabRepository implements LabRepository {
  async saveExperiment(experiment: LabExperiment) {
    experimentStore.set(experiment.experimentId, cloneExperiment(experiment));
  }

  async getExperiment(experimentId: string) {
    const experiment = experimentStore.get(experimentId);
    return experiment ? cloneExperiment(experiment) : null;
  }

  async listExperiments(status?: LabExperimentStatus) {
    return [...experimentStore.values()]
      .filter((experiment) => !status || experiment.status === status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneExperiment);
  }

  async reset() {
    experimentStore.clear();
  }
}

export class D1LabRepository implements LabRepository {
  constructor(private readonly database: D1Database) {}

  async saveExperiment(experiment: LabExperiment) {
    const parsed = LabExperimentSchema.parse(experiment);
    const updatedAt = new Date().toISOString();
    await this.database
      .prepare(
        `INSERT INTO lab_experiments (
          experiment_id, status, created_at, updated_at, payload_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(experiment_id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload_json = excluded.payload_json`,
      )
      .bind(
        parsed.experimentId,
        parsed.status,
        parsed.createdAt,
        updatedAt,
        JSON.stringify(parsed),
      )
      .run();

    for (const run of parsed.runs) {
      await this.database
        .prepare(
          `INSERT INTO lab_agent_runs (
            run_id, experiment_id, status, persona, participant_id, session_id,
            started_at, finished_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            status = excluded.status,
            finished_at = excluded.finished_at,
            payload_json = excluded.payload_json`,
        )
        .bind(
          run.runId,
          parsed.experimentId,
          run.status,
          run.persona,
          run.participantId,
          run.sessionId,
          run.startedAt,
          run.finishedAt,
          JSON.stringify(run),
        )
        .run();

      for (const action of run.actions) {
        await this.database
          .prepare(
            `INSERT INTO lab_agent_actions (
              action_id, run_id, experiment_id, ordinal, occurred_at,
              action_type, outcome, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(action_id) DO UPDATE SET
              outcome = excluded.outcome,
              payload_json = excluded.payload_json`,
          )
          .bind(
            action.actionId,
            run.runId,
            parsed.experimentId,
            action.ordinal,
            action.occurredAt,
            action.action,
            action.outcome,
            JSON.stringify(action),
          )
          .run();
      }
    }

    if (parsed.evidence) {
      await this.database
        .prepare(
          `INSERT INTO lab_evidence_records (
            evidence_pack_id, experiment_id, evidence_hash, generated_at,
            payload_json
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(evidence_pack_id) DO UPDATE SET
            evidence_hash = excluded.evidence_hash,
            payload_json = excluded.payload_json`,
        )
        .bind(
          parsed.evidence.evidencePackId,
          parsed.experimentId,
          parsed.evidence.evidenceHash,
          parsed.evidence.generatedAt,
          JSON.stringify(parsed.evidence),
        )
        .run();
    }

    if (parsed.analysis) {
      await this.database
        .prepare(
          `INSERT INTO lab_analyses (
            analysis_id, experiment_id, evidence_pack_id, model, created_at,
            payload_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(analysis_id) DO UPDATE SET payload_json = excluded.payload_json`,
        )
        .bind(
          parsed.analysis.analysisId,
          parsed.experimentId,
          parsed.analysis.evidencePackId,
          parsed.analysis.model,
          parsed.analysis.createdAt,
          JSON.stringify(parsed.analysis),
        )
        .run();
    }

    if (parsed.selection) {
      await this.database
        .prepare(
          `INSERT INTO lab_selection_results (
            selection_id, experiment_id, mutation_id, selected_at, payload_json
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(selection_id) DO UPDATE SET payload_json = excluded.payload_json`,
        )
        .bind(
          parsed.selection.selectionId,
          parsed.experimentId,
          parsed.selection.mutationId,
          parsed.selection.selectedAt,
          JSON.stringify(parsed.selection),
        )
        .run();
    }
  }

  async getExperiment(experimentId: string) {
    const row = await this.database
      .prepare(
        'SELECT payload_json FROM lab_experiments WHERE experiment_id = ?',
      )
      .bind(experimentId)
      .first<{ payload_json: string }>();
    return row ? LabExperimentSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  async listExperiments(status?: LabExperimentStatus) {
    const statement = status
      ? this.database
          .prepare(
            `SELECT payload_json FROM lab_experiments
             WHERE status = ? ORDER BY created_at DESC`,
          )
          .bind(status)
      : this.database.prepare(
          'SELECT payload_json FROM lab_experiments ORDER BY created_at DESC',
        );
    const result = await statement.all<{ payload_json: string }>();
    return result.results.map((row) =>
      LabExperimentSchema.parse(JSON.parse(row.payload_json)),
    );
  }

  async reset() {
    await this.database.batch([
      this.database.prepare('DELETE FROM lab_selection_results'),
      this.database.prepare('DELETE FROM lab_analyses'),
      this.database.prepare('DELETE FROM lab_evidence_records'),
      this.database.prepare('DELETE FROM lab_agent_actions'),
      this.database.prepare('DELETE FROM lab_agent_runs'),
      this.database.prepare('DELETE FROM lab_experiments'),
    ]);
  }
}

const inMemoryLabRepository = new InMemoryLabRepository();

export const getLabRepository = (database?: D1Database): LabRepository =>
  database ? new D1LabRepository(database) : inMemoryLabRepository;

export const resetInMemoryLab = () => inMemoryLabRepository.reset();

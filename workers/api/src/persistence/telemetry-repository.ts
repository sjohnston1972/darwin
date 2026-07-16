import type {
  CodexImplementationManifest,
  EvidenceAnalysis,
  EvidencePack,
  EvolutionRecord,
  FitnessComparison,
  MutationProposal,
  OrganismState,
  OutcomeValidation,
  ProjectFlowWorkspace,
  StoredTelemetryEvent,
  StudyTelemetryEvent,
} from '@darwin/shared';

export interface PersistedDemoState {
  organism: OrganismState;
  timeline: EvolutionRecord[];
  mutations: Array<[string, MutationProposal]>;
  validations: Array<[string, unknown]>;
  fitness: Array<[string, FitnessComparison]>;
}

export interface TelemetryInsertResult {
  accepted: number;
  duplicates: number;
}

export interface TelemetryRepository {
  insertEvents(
    events: StudyTelemetryEvent[],
    receivedAt: string,
  ): Promise<TelemetryInsertResult>;
  listEvents(studyId: string, limit: number): Promise<StoredTelemetryEvent[]>;
  countEvents(studyId: string): Promise<number>;
  listSession(
    studyId: string,
    sessionId: string,
  ): Promise<StoredTelemetryEvent[]>;
  getWorkspace(
    studyId: string,
    participantId: string,
  ): Promise<ProjectFlowWorkspace | null>;
  putWorkspace(
    studyId: string,
    participantId: string,
    workspace: ProjectFlowWorkspace,
  ): Promise<void>;
  saveEvidence(pack: EvidencePack): Promise<void>;
  getLatestEvidence(studyId: string): Promise<EvidencePack | null>;
  saveEvidenceAnalysis(
    studyId: string,
    analysis: EvidenceAnalysis,
  ): Promise<void>;
  getEvidenceAnalysisByCacheKey(
    cacheKey: string,
  ): Promise<EvidenceAnalysis | null>;
  getEvidenceAnalysis(analysisId: string): Promise<EvidenceAnalysis | null>;
  getLatestEvidenceAnalysis(studyId: string): Promise<EvidenceAnalysis | null>;
  saveCodexManifest(manifest: CodexImplementationManifest): Promise<void>;
  getCodexManifest(
    analysisId: string,
  ): Promise<CodexImplementationManifest | null>;
  saveOutcomeValidation(validation: OutcomeValidation): Promise<void>;
  getLatestOutcomeValidation(): Promise<OutcomeValidation | null>;
  saveDemoState(state: PersistedDemoState): Promise<void>;
  getDemoState(): Promise<PersistedDemoState | null>;
  reset(): Promise<void>;
}

const eventStore = new Map<string, StoredTelemetryEvent>();
const workspaceStore = new Map<string, ProjectFlowWorkspace>();
const evidenceStore = new Map<string, EvidencePack>();
const evidenceAnalysisStore = new Map<
  string,
  { studyId: string; analysis: EvidenceAnalysis }
>();
const manifestStore = new Map<string, CodexImplementationManifest>();
let outcomeValidationStore: OutcomeValidation | null = null;
let demoStateStore: PersistedDemoState | null = null;

const workspaceKey = (studyId: string, participantId: string) =>
  `${studyId}:${participantId}`;

export class InMemoryTelemetryRepository implements TelemetryRepository {
  async insertEvents(events: StudyTelemetryEvent[], receivedAt: string) {
    let accepted = 0;
    let duplicates = 0;
    for (const event of events) {
      if (eventStore.has(event.eventId)) {
        duplicates += 1;
        continue;
      }
      eventStore.set(event.eventId, { ...event, receivedAt });
      accepted += 1;
    }
    return { accepted, duplicates };
  }

  async listEvents(studyId: string, limit: number) {
    return [...eventStore.values()]
      .filter((event) => event.studyId === studyId)
      .sort((left, right) =>
        left.receivedAt === right.receivedAt
          ? left.sequence - right.sequence
          : left.receivedAt.localeCompare(right.receivedAt),
      )
      .slice(-limit);
  }

  async listSession(studyId: string, sessionId: string) {
    return [...eventStore.values()]
      .filter(
        (event) => event.studyId === studyId && event.sessionId === sessionId,
      )
      .sort((left, right) => left.sequence - right.sequence);
  }

  async countEvents(studyId: string) {
    return [...eventStore.values()].filter((event) => event.studyId === studyId)
      .length;
  }

  async getWorkspace(studyId: string, participantId: string) {
    return workspaceStore.get(workspaceKey(studyId, participantId)) ?? null;
  }

  async putWorkspace(
    studyId: string,
    participantId: string,
    workspace: ProjectFlowWorkspace,
  ) {
    workspaceStore.set(workspaceKey(studyId, participantId), workspace);
  }

  async saveEvidence(pack: EvidencePack) {
    evidenceStore.set(pack.study.studyId, pack);
  }

  async getLatestEvidence(studyId: string) {
    return evidenceStore.get(studyId) ?? null;
  }

  async saveEvidenceAnalysis(studyId: string, analysis: EvidenceAnalysis) {
    evidenceAnalysisStore.set(analysis.cacheKey, { studyId, analysis });
  }

  async getEvidenceAnalysisByCacheKey(cacheKey: string) {
    return evidenceAnalysisStore.get(cacheKey)?.analysis ?? null;
  }

  async getEvidenceAnalysis(analysisId: string) {
    return (
      [...evidenceAnalysisStore.values()].find(
        (entry) => entry.analysis.analysisId === analysisId,
      )?.analysis ?? null
    );
  }

  async getLatestEvidenceAnalysis(studyId: string) {
    return (
      [...evidenceAnalysisStore.values()]
        .filter((entry) => entry.studyId === studyId)
        .sort((left, right) =>
          left.analysis.createdAt.localeCompare(right.analysis.createdAt),
        )
        .at(-1)?.analysis ?? null
    );
  }

  async saveCodexManifest(manifest: CodexImplementationManifest) {
    manifestStore.set(manifest.analysisId, manifest);
  }

  async getCodexManifest(analysisId: string) {
    return manifestStore.get(analysisId) ?? null;
  }

  async saveOutcomeValidation(validation: OutcomeValidation) {
    outcomeValidationStore = validation;
  }

  async getLatestOutcomeValidation() {
    return outcomeValidationStore;
  }

  async saveDemoState(state: PersistedDemoState) {
    demoStateStore = state;
  }

  async getDemoState() {
    return demoStateStore;
  }

  async reset() {
    eventStore.clear();
    workspaceStore.clear();
    evidenceStore.clear();
    evidenceAnalysisStore.clear();
    manifestStore.clear();
    outcomeValidationStore = null;
    demoStateStore = null;
  }
}

export class D1TelemetryRepository implements TelemetryRepository {
  constructor(private readonly database: D1Database) {}

  async insertEvents(events: StudyTelemetryEvent[], receivedAt: string) {
    if (!events.length) return { accepted: 0, duplicates: 0 };
    const statements = events.map((event) =>
      this.database
        .prepare(
          `INSERT OR IGNORE INTO telemetry_events (
            event_id, study_id, participant_id, session_id, task_attempt_id,
            app_version, source, occurred_at, received_at, sequence,
            event_type, route, target_id, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          event.eventId,
          event.studyId,
          event.participantId,
          event.sessionId,
          'taskAttemptId' in event ? (event.taskAttemptId ?? null) : null,
          event.appVersion,
          event.source,
          event.occurredAt,
          receivedAt,
          event.sequence,
          event.eventType,
          event.route,
          'targetId' in event ? event.targetId : null,
          JSON.stringify(event),
        ),
    );
    const results = await this.database.batch(statements);
    const accepted = results.reduce(
      (count, result) => count + (result.meta.changes > 0 ? 1 : 0),
      0,
    );
    return { accepted, duplicates: events.length - accepted };
  }

  async listEvents(studyId: string, limit: number) {
    const result = await this.database
      .prepare(
        `SELECT event_json, received_at
         FROM telemetry_events
         WHERE study_id = ?
         ORDER BY received_at DESC, sequence DESC
         LIMIT ?`,
      )
      .bind(studyId, limit)
      .all<{ event_json: string; received_at: string }>();

    return result.results
      .map((row) => ({
        ...(JSON.parse(row.event_json) as StudyTelemetryEvent),
        receivedAt: row.received_at,
      }))
      .reverse();
  }

  async listSession(studyId: string, sessionId: string) {
    const result = await this.database
      .prepare(
        `SELECT event_json, received_at
         FROM telemetry_events
         WHERE study_id = ? AND session_id = ?
         ORDER BY sequence ASC`,
      )
      .bind(studyId, sessionId)
      .all<{ event_json: string; received_at: string }>();

    return result.results.map((row) => ({
      ...(JSON.parse(row.event_json) as StudyTelemetryEvent),
      receivedAt: row.received_at,
    }));
  }

  async countEvents(studyId: string) {
    const row = await this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM telemetry_events
         WHERE study_id = ?`,
      )
      .bind(studyId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async getWorkspace(studyId: string, participantId: string) {
    const row = await this.database
      .prepare(
        `SELECT workspace_json
         FROM participant_workspaces
         WHERE study_id = ? AND participant_id = ?`,
      )
      .bind(studyId, participantId)
      .first<{ workspace_json: string }>();
    return row
      ? (JSON.parse(row.workspace_json) as ProjectFlowWorkspace)
      : null;
  }

  async putWorkspace(
    studyId: string,
    participantId: string,
    workspace: ProjectFlowWorkspace,
  ) {
    await this.database
      .prepare(
        `INSERT INTO participant_workspaces (
          study_id, participant_id, workspace_json, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(study_id, participant_id) DO UPDATE SET
          workspace_json = excluded.workspace_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        studyId,
        participantId,
        JSON.stringify(workspace),
        workspace.updatedAt,
      )
      .run();
  }

  async saveEvidence(pack: EvidencePack) {
    await this.database
      .prepare(
        `INSERT INTO analysis_runs (
          evidence_id, study_id, app_version, generated_at,
          source_event_count, evidence_hash, evidence_pack_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(evidence_hash) DO UPDATE SET
          generated_at = excluded.generated_at,
          evidence_pack_json = excluded.evidence_pack_json`,
      )
      .bind(
        pack.evidenceId,
        pack.study.studyId,
        pack.study.appVersion,
        pack.generatedAt,
        pack.study.sourceEventCount,
        pack.evidenceHash,
        JSON.stringify(pack),
      )
      .run();
  }

  async getLatestEvidence(studyId: string) {
    const row = await this.database
      .prepare(
        `SELECT evidence_pack_json
         FROM analysis_runs
         WHERE study_id = ?
         ORDER BY generated_at DESC
         LIMIT 1`,
      )
      .bind(studyId)
      .first<{ evidence_pack_json: string }>();
    return row ? (JSON.parse(row.evidence_pack_json) as EvidencePack) : null;
  }

  async saveEvidenceAnalysis(studyId: string, analysis: EvidenceAnalysis) {
    await this.database
      .prepare(
        `INSERT INTO evidence_analyses (
          analysis_id, study_id, evidence_id, evidence_hash, cache_key,
          prompt_version, model, mode, created_at, analysis_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          analysis_json = excluded.analysis_json`,
      )
      .bind(
        analysis.analysisId,
        studyId,
        analysis.evidenceId,
        analysis.evidenceHash,
        analysis.cacheKey,
        analysis.promptVersion,
        analysis.model,
        analysis.mode,
        analysis.createdAt,
        JSON.stringify(analysis),
      )
      .run();
  }

  async getEvidenceAnalysisByCacheKey(cacheKey: string) {
    const row = await this.database
      .prepare(
        `SELECT analysis_json FROM evidence_analyses WHERE cache_key = ?`,
      )
      .bind(cacheKey)
      .first<{ analysis_json: string }>();
    return row ? (JSON.parse(row.analysis_json) as EvidenceAnalysis) : null;
  }

  async getEvidenceAnalysis(analysisId: string) {
    const row = await this.database
      .prepare(
        `SELECT analysis_json FROM evidence_analyses WHERE analysis_id = ?`,
      )
      .bind(analysisId)
      .first<{ analysis_json: string }>();
    return row ? (JSON.parse(row.analysis_json) as EvidenceAnalysis) : null;
  }

  async getLatestEvidenceAnalysis(studyId: string) {
    const row = await this.database
      .prepare(
        `SELECT analysis_json
         FROM evidence_analyses
         WHERE study_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(studyId)
      .first<{ analysis_json: string }>();
    return row ? (JSON.parse(row.analysis_json) as EvidenceAnalysis) : null;
  }

  async saveCodexManifest(manifest: CodexImplementationManifest) {
    await this.database
      .prepare(
        `INSERT INTO codex_manifests (
          manifest_id, analysis_id, mutation_id, evidence_hash,
          manifest_hash, repository_commit, created_at, manifest_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(analysis_id) DO UPDATE SET
          manifest_hash = excluded.manifest_hash,
          manifest_json = excluded.manifest_json`,
      )
      .bind(
        manifest.manifestId,
        manifest.analysisId,
        manifest.mutationId,
        manifest.evidenceHash,
        manifest.manifestHash,
        manifest.repositoryCommit,
        manifest.createdAt,
        JSON.stringify(manifest),
      )
      .run();
  }

  async getCodexManifest(analysisId: string) {
    const row = await this.database
      .prepare(
        `SELECT manifest_json FROM codex_manifests WHERE analysis_id = ?`,
      )
      .bind(analysisId)
      .first<{ manifest_json: string }>();
    return row
      ? (JSON.parse(row.manifest_json) as CodexImplementationManifest)
      : null;
  }

  async saveOutcomeValidation(validation: OutcomeValidation) {
    await this.database
      .prepare(
        `INSERT INTO outcome_validations (
          validation_id, generated_at, baseline_evidence_hash,
          evolved_evidence_hash, validation_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(validation_id) DO UPDATE SET
          generated_at = excluded.generated_at,
          validation_json = excluded.validation_json`,
      )
      .bind(
        validation.validationId,
        validation.generatedAt,
        validation.baseline.evidenceHash,
        validation.evolved.evidenceHash,
        JSON.stringify(validation),
      )
      .run();
  }

  async getLatestOutcomeValidation() {
    const row = await this.database
      .prepare(
        `SELECT validation_json
         FROM outcome_validations
         ORDER BY generated_at DESC
         LIMIT 1`,
      )
      .first<{ validation_json: string }>();
    return row ? (JSON.parse(row.validation_json) as OutcomeValidation) : null;
  }

  async saveDemoState(state: PersistedDemoState) {
    await this.database
      .prepare(
        `INSERT INTO demo_state (state_key, state_json, updated_at)
         VALUES ('primary', ?, ?)
         ON CONFLICT(state_key) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(state), state.organism.updatedAt)
      .run();
  }

  async getDemoState() {
    const row = await this.database
      .prepare(`SELECT state_json FROM demo_state WHERE state_key = 'primary'`)
      .first<{ state_json: string }>();
    return row ? (JSON.parse(row.state_json) as PersistedDemoState) : null;
  }

  async reset() {
    await this.database.batch([
      this.database.prepare('DELETE FROM telemetry_events'),
      this.database.prepare('DELETE FROM participant_workspaces'),
      this.database.prepare('DELETE FROM analysis_runs'),
      this.database.prepare('DELETE FROM evidence_analyses'),
      this.database.prepare('DELETE FROM codex_manifests'),
      this.database.prepare('DELETE FROM outcome_validations'),
      this.database.prepare('DELETE FROM demo_state'),
    ]);
  }
}

const inMemoryRepository = new InMemoryTelemetryRepository();

export const getTelemetryRepository = (database?: D1Database) =>
  database ? new D1TelemetryRepository(database) : inMemoryRepository;

export const resetInMemoryTelemetry = () => inMemoryRepository.reset();

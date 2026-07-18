import {
  EvolutionCycleSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
  type EvolutionCycle,
  type ProjectFlowWorkspace,
  type RepositoryMutationExecution,
  type StoredTelemetryEvent,
  type StudyTelemetryEvent,
  type TargetApplicationConnection,
} from '@darwin/shared';

export interface TelemetryInsertResult {
  accepted: number;
  duplicates: number;
}

export interface TelemetryEventSummary {
  count: number;
  sessionCounts: Record<string, number>;
  participantCount: number;
  behaviorSignalCount: number;
}

export interface ExecutionCallbackCredential {
  executionId: string;
  nonceHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface TelemetryRepository {
  insertEvents(
    events: StudyTelemetryEvent[],
    receivedAt: string,
  ): Promise<TelemetryInsertResult>;
  listEvents(
    studyId: string,
    limit: number,
    receivedAfter?: string | null,
  ): Promise<StoredTelemetryEvent[]>;
  summarizeEvents(
    studyId: string,
    receivedAfter?: string | null,
  ): Promise<TelemetryEventSummary>;
  listSession(
    studyId: string,
    sessionId: string,
    receivedAfter?: string | null,
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
  getEvidence(evidenceId: string): Promise<EvidencePack | null>;
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
  saveRepositoryExecution(
    execution: RepositoryMutationExecution,
  ): Promise<void>;
  getRepositoryExecution(
    executionId: string,
  ): Promise<RepositoryMutationExecution | null>;
  getRepositoryExecutionByManifest(
    manifestId: string,
  ): Promise<RepositoryMutationExecution | null>;
  getRepositoryExecutionByAnalysis(
    analysisId: string,
  ): Promise<RepositoryMutationExecution | null>;
  listRepositoryExecutions(): Promise<RepositoryMutationExecution[]>;
  saveExecutionCallbackCredential(
    credential: ExecutionCallbackCredential,
  ): Promise<void>;
  getExecutionCallbackCredential(
    executionId: string,
  ): Promise<ExecutionCallbackCredential | null>;
  consumeExecutionCallbackSignature(
    executionId: string,
    signature: string,
    usedAt: string,
  ): Promise<boolean>;
  getEvolutionCycle(): Promise<EvolutionCycle>;
  advanceEvolutionCycle(
    boundary: Pick<
      EvolutionCycle,
      'startedAt' | 'measuredCommit' | 'appVersion' | 'deploymentVerifiedAt'
    >,
  ): Promise<EvolutionCycle>;
  getTargetConnection(): Promise<TargetApplicationConnection | null>;
  saveTargetConnection(connection: TargetApplicationConnection): Promise<void>;
  deleteTargetConnection(): Promise<void>;
  reset(): Promise<void>;
}

const eventStore = new Map<string, StoredTelemetryEvent>();
const workspaceStore = new Map<string, ProjectFlowWorkspace>();
const evidenceStore = new Map<string, EvidencePack>();
const evidenceByIdStore = new Map<string, EvidencePack>();
const evidenceAnalysisStore = new Map<
  string,
  { studyId: string; analysis: EvidenceAnalysis }
>();
const manifestStore = new Map<string, CodexImplementationManifest>();
const repositoryExecutionStore = new Map<string, RepositoryMutationExecution>();
const callbackCredentialStore = new Map<string, ExecutionCallbackCredential>();
const callbackSignatureStore = new Set<string>();
let targetConnectionStore: TargetApplicationConnection | null = null;
const baselineStudyId = 'projectflow-baseline-study';
const defaultEvolutionCycle = (): EvolutionCycle => ({
  studyId: baselineStudyId,
  startedAt: null,
  genomeEvolutionCount: 0,
  measuredCommit: null,
  appVersion: null,
  deploymentVerifiedAt: null,
});
let evolutionCycleStore = defaultEvolutionCycle();

const workspaceKey = (studyId: string, participantId: string) =>
  `${studyId}:${participantId}`;

const behaviorSignalEventTypes = new Set<StudyTelemetryEvent['eventType']>([
  'hover_ended',
  'interaction_signal',
  'drag_attempted',
  'touch_cancelled',
  'browser_navigation',
  'viewport_zoom_changed',
]);

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

  async listEvents(
    studyId: string,
    limit: number,
    receivedAfter?: string | null,
  ) {
    return [...eventStore.values()]
      .filter(
        (event) =>
          event.studyId === studyId &&
          (!receivedAfter || event.receivedAt > receivedAfter),
      )
      .sort((left, right) =>
        left.receivedAt === right.receivedAt
          ? left.sequence - right.sequence
          : left.receivedAt.localeCompare(right.receivedAt),
      )
      .slice(-limit);
  }

  async listSession(
    studyId: string,
    sessionId: string,
    receivedAfter?: string | null,
  ) {
    return [...eventStore.values()]
      .filter(
        (event) =>
          event.studyId === studyId &&
          event.sessionId === sessionId &&
          (!receivedAfter || event.receivedAt > receivedAfter),
      )
      .sort((left, right) => left.sequence - right.sequence);
  }

  async summarizeEvents(studyId: string, receivedAfter?: string | null) {
    const events = [...eventStore.values()].filter(
      (event) =>
        event.studyId === studyId &&
        (!receivedAfter || event.receivedAt > receivedAfter),
    );
    const sessionCounts = events.reduce<Record<string, number>>(
      (counts, event) => {
        counts[event.sessionId] = (counts[event.sessionId] ?? 0) + 1;
        return counts;
      },
      {},
    );
    return {
      count: events.length,
      sessionCounts,
      participantCount: new Set(events.map((event) => event.participantId))
        .size,
      behaviorSignalCount: events.filter((event) =>
        behaviorSignalEventTypes.has(event.eventType),
      ).length,
    };
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
    evidenceByIdStore.set(pack.evidenceId, pack);
  }

  async getLatestEvidence(studyId: string) {
    return evidenceStore.get(studyId) ?? null;
  }

  async getEvidence(evidenceId: string) {
    return evidenceByIdStore.get(evidenceId) ?? null;
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

  async saveRepositoryExecution(execution: RepositoryMutationExecution) {
    repositoryExecutionStore.set(execution.executionId, execution);
  }

  async getRepositoryExecution(executionId: string) {
    return repositoryExecutionStore.get(executionId) ?? null;
  }

  async getRepositoryExecutionByManifest(manifestId: string) {
    return (
      [...repositoryExecutionStore.values()].find(
        (execution) => execution.manifestId === manifestId,
      ) ?? null
    );
  }

  async getRepositoryExecutionByAnalysis(analysisId: string) {
    return (
      [...repositoryExecutionStore.values()].find(
        (execution) => execution.analysisId === analysisId,
      ) ?? null
    );
  }

  async listRepositoryExecutions() {
    return [...repositoryExecutionStore.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async saveExecutionCallbackCredential(
    credential: ExecutionCallbackCredential,
  ) {
    callbackCredentialStore.set(credential.executionId, credential);
    for (const key of callbackSignatureStore) {
      if (key.startsWith(`${credential.executionId}:`)) {
        callbackSignatureStore.delete(key);
      }
    }
  }

  async getExecutionCallbackCredential(executionId: string) {
    return callbackCredentialStore.get(executionId) ?? null;
  }

  async consumeExecutionCallbackSignature(
    executionId: string,
    signature: string,
    usedAt: string,
  ) {
    void usedAt;
    const key = `${executionId}:${signature}`;
    if (callbackSignatureStore.has(key)) return false;
    callbackSignatureStore.add(key);
    return true;
  }

  async getEvolutionCycle() {
    return evolutionCycleStore;
  }

  async advanceEvolutionCycle(
    boundary: Pick<
      EvolutionCycle,
      'startedAt' | 'measuredCommit' | 'appVersion' | 'deploymentVerifiedAt'
    >,
  ) {
    evolutionCycleStore = {
      studyId: baselineStudyId,
      ...boundary,
      genomeEvolutionCount: evolutionCycleStore.genomeEvolutionCount + 1,
    };
    return evolutionCycleStore;
  }

  async getTargetConnection() {
    return targetConnectionStore;
  }

  async saveTargetConnection(connection: TargetApplicationConnection) {
    targetConnectionStore = connection;
  }

  async deleteTargetConnection() {
    targetConnectionStore = null;
  }

  async reset() {
    eventStore.clear();
    workspaceStore.clear();
    evidenceStore.clear();
    evidenceByIdStore.clear();
    evidenceAnalysisStore.clear();
    manifestStore.clear();
    repositoryExecutionStore.clear();
    callbackCredentialStore.clear();
    callbackSignatureStore.clear();
    evolutionCycleStore = defaultEvolutionCycle();
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

  async listEvents(
    studyId: string,
    limit: number,
    receivedAfter?: string | null,
  ) {
    const result = await this.database
      .prepare(
        `SELECT event_json, received_at
         FROM telemetry_events
         WHERE study_id = ? AND (? IS NULL OR received_at > ?)
         ORDER BY received_at DESC, sequence DESC
         LIMIT ?`,
      )
      .bind(studyId, receivedAfter ?? null, receivedAfter ?? null, limit)
      .all<{ event_json: string; received_at: string }>();

    return result.results
      .map((row) => ({
        ...(JSON.parse(row.event_json) as StudyTelemetryEvent),
        receivedAt: row.received_at,
      }))
      .reverse();
  }

  async listSession(
    studyId: string,
    sessionId: string,
    receivedAfter?: string | null,
  ) {
    const result = await this.database
      .prepare(
        `SELECT event_json, received_at
         FROM telemetry_events
         WHERE study_id = ? AND session_id = ?
           AND (? IS NULL OR received_at > ?)
         ORDER BY sequence ASC`,
      )
      .bind(studyId, sessionId, receivedAfter ?? null, receivedAfter ?? null)
      .all<{ event_json: string; received_at: string }>();

    return result.results.map((row) => ({
      ...(JSON.parse(row.event_json) as StudyTelemetryEvent),
      receivedAt: row.received_at,
    }));
  }

  async summarizeEvents(studyId: string, receivedAfter?: string | null) {
    const [totals, sessions] = await Promise.all([
      this.database
        .prepare(
          `SELECT COUNT(*) AS count,
                COUNT(DISTINCT participant_id) AS participant_count,
                SUM(CASE WHEN event_type IN (
                  'hover_ended', 'interaction_signal', 'drag_attempted',
                  'touch_cancelled', 'browser_navigation', 'viewport_zoom_changed'
                ) THEN 1 ELSE 0 END) AS behavior_signal_count
         FROM telemetry_events
         WHERE study_id = ? AND (? IS NULL OR received_at > ?)`,
        )
        .bind(studyId, receivedAfter ?? null, receivedAfter ?? null)
        .first<{
          count: number;
          participant_count: number;
          behavior_signal_count: number;
        }>(),
      this.database
        .prepare(
          `SELECT session_id, COUNT(*) AS count
           FROM telemetry_events
           WHERE study_id = ? AND (? IS NULL OR received_at > ?)
           GROUP BY session_id`,
        )
        .bind(studyId, receivedAfter ?? null, receivedAfter ?? null)
        .all<{ session_id: string; count: number }>(),
    ]);
    return {
      count: totals?.count ?? 0,
      sessionCounts: Object.fromEntries(
        sessions.results.map((row) => [row.session_id, row.count]),
      ),
      participantCount: totals?.participant_count ?? 0,
      behaviorSignalCount: totals?.behavior_signal_count ?? 0,
    };
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

  async getEvidence(evidenceId: string) {
    const row = await this.database
      .prepare(
        `SELECT evidence_pack_json FROM analysis_runs WHERE evidence_id = ? LIMIT 1`,
      )
      .bind(evidenceId)
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
           manifest_id = excluded.manifest_id,
           mutation_id = excluded.mutation_id,
           evidence_hash = excluded.evidence_hash,
           manifest_hash = excluded.manifest_hash,
           repository_commit = excluded.repository_commit,
           created_at = excluded.created_at,
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

  async saveRepositoryExecution(execution: RepositoryMutationExecution) {
    await this.database
      .prepare(
        `INSERT INTO repository_executions (
          execution_id, manifest_id, analysis_id, status, updated_at,
          execution_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(execution_id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at,
          execution_json = excluded.execution_json`,
      )
      .bind(
        execution.executionId,
        execution.manifestId,
        execution.analysisId,
        execution.status,
        execution.updatedAt,
        JSON.stringify(execution),
      )
      .run();
  }

  private async findRepositoryExecution(where: string, value: string) {
    const row = await this.database
      .prepare(
        `SELECT execution_json FROM repository_executions WHERE ${where} = ? LIMIT 1`,
      )
      .bind(value)
      .first<{ execution_json: string }>();
    return row
      ? (JSON.parse(row.execution_json) as RepositoryMutationExecution)
      : null;
  }

  async getRepositoryExecution(executionId: string) {
    return this.findRepositoryExecution('execution_id', executionId);
  }

  async getRepositoryExecutionByManifest(manifestId: string) {
    return this.findRepositoryExecution('manifest_id', manifestId);
  }

  async getRepositoryExecutionByAnalysis(analysisId: string) {
    return this.findRepositoryExecution('analysis_id', analysisId);
  }

  async listRepositoryExecutions() {
    const result = await this.database
      .prepare(
        `SELECT execution_json FROM repository_executions ORDER BY updated_at DESC`,
      )
      .all<{ execution_json: string }>();
    return result.results.map(
      (row) => JSON.parse(row.execution_json) as RepositoryMutationExecution,
    );
  }

  async saveExecutionCallbackCredential(
    credential: ExecutionCallbackCredential,
  ) {
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO execution_callback_credentials (
            execution_id, nonce_hash, expires_at, created_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(execution_id) DO UPDATE SET
             nonce_hash = excluded.nonce_hash,
             expires_at = excluded.expires_at,
             created_at = excluded.created_at`,
        )
        .bind(
          credential.executionId,
          credential.nonceHash,
          credential.expiresAt,
          credential.createdAt,
        ),
      this.database
        .prepare(
          `DELETE FROM execution_callback_signatures WHERE execution_id = ?`,
        )
        .bind(credential.executionId),
    ]);
  }

  async getExecutionCallbackCredential(executionId: string) {
    const row = await this.database
      .prepare(
        `SELECT execution_id, nonce_hash, expires_at, created_at
         FROM execution_callback_credentials
         WHERE execution_id = ?`,
      )
      .bind(executionId)
      .first<{
        execution_id: string;
        nonce_hash: string;
        expires_at: string;
        created_at: string;
      }>();
    return row
      ? {
          executionId: row.execution_id,
          nonceHash: row.nonce_hash,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        }
      : null;
  }

  async consumeExecutionCallbackSignature(
    executionId: string,
    signature: string,
    usedAt: string,
  ) {
    const result = await this.database
      .prepare(
        `INSERT OR IGNORE INTO execution_callback_signatures (
          execution_id, signature, used_at
         ) VALUES (?, ?, ?)`,
      )
      .bind(executionId, signature, usedAt)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async getEvolutionCycle() {
    const row = await this.database
      .prepare(`SELECT state_json FROM demo_state WHERE state_key = ?`)
      .bind('evolution-cycle')
      .first<{ state_json: string }>();
    if (row) {
      try {
        const parsed = EvolutionCycleSchema.safeParse(
          JSON.parse(row.state_json),
        );
        if (parsed.success) return parsed.data;
      } catch {
        // Fall through to the retained-release compatibility path.
      }
    }

    const retained = (await this.listRepositoryExecutions()).filter(
      (execution) => execution.status === 'released',
    );
    if (!retained.length) return defaultEvolutionCycle();
    return {
      studyId: baselineStudyId,
      startedAt: retained.reduce(
        (latest, execution) =>
          !latest || execution.updatedAt > latest
            ? execution.updatedAt
            : latest,
        null as string | null,
      ),
      genomeEvolutionCount: retained.length,
      measuredCommit: retained[0]?.headSha ?? null,
      appVersion:
        retained[0]?.deploymentVerification?.expectedAppVersion ?? null,
      deploymentVerifiedAt:
        retained[0]?.deploymentVerification?.verifiedAt ?? null,
    };
  }

  async advanceEvolutionCycle(
    boundary: Pick<
      EvolutionCycle,
      'startedAt' | 'measuredCommit' | 'appVersion' | 'deploymentVerifiedAt'
    >,
  ) {
    const current = await this.getEvolutionCycle();
    const next: EvolutionCycle = {
      studyId: baselineStudyId,
      ...boundary,
      genomeEvolutionCount: current.genomeEvolutionCount + 1,
    };
    await this.database
      .prepare(
        `INSERT INTO demo_state (state_key, state_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(state_key) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .bind('evolution-cycle', JSON.stringify(next), next.startedAt)
      .run();
    return next;
  }

  async getTargetConnection() {
    const row = await this.database
      .prepare(
        `SELECT connection_json
         FROM target_connections
         ORDER BY connected_at DESC
         LIMIT 1`,
      )
      .first<{ connection_json: string }>();
    return row
      ? (JSON.parse(row.connection_json) as TargetApplicationConnection)
      : null;
  }

  async saveTargetConnection(connection: TargetApplicationConnection) {
    await this.database.batch([
      this.database.prepare('DELETE FROM target_connections'),
      this.database
        .prepare(
          `INSERT INTO target_connections (
            connection_id, connected_at, connection_json
          ) VALUES (?, ?, ?)`,
        )
        .bind(
          connection.connectionId,
          connection.connectedAt,
          JSON.stringify(connection),
        ),
    ]);
  }

  async deleteTargetConnection() {
    await this.database.prepare('DELETE FROM target_connections').run();
  }

  async reset() {
    await this.database.batch([
      this.database.prepare('DELETE FROM telemetry_events'),
      this.database.prepare('DELETE FROM participant_workspaces'),
      this.database.prepare('DELETE FROM analysis_runs'),
      this.database.prepare('DELETE FROM evidence_analyses'),
      this.database.prepare('DELETE FROM codex_manifests'),
      this.database.prepare('DELETE FROM repository_executions'),
      this.database.prepare('DELETE FROM execution_callback_signatures'),
      this.database.prepare('DELETE FROM execution_callback_credentials'),
      this.database.prepare('DELETE FROM outcome_validations'),
      this.database.prepare('DELETE FROM demo_state'),
    ]);
  }
}

const inMemoryRepository = new InMemoryTelemetryRepository();

export const getTelemetryRepository = (database?: D1Database) =>
  database ? new D1TelemetryRepository(database) : inMemoryRepository;

export const resetInMemoryTelemetry = async () => {
  await inMemoryRepository.reset();
  await inMemoryRepository.deleteTargetConnection();
};

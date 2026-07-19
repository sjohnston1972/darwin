import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  OperationalAuditEventSchema,
  ProjectFlowWorkspaceSchema,
  RepositoryMutationExecutionSchema,
  StudyTelemetryEventSchema,
  TargetApplicationConnectionSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
  type EvolutionCycle,
  type ObservationArchive,
  type OperationalAuditEvent,
  type ProjectFlowWorkspace,
  type RepositoryMutationExecution,
  type StorageHealth,
  type StoredTelemetryEvent,
  type StudyTelemetryEvent,
  type TargetApplicationConnection,
} from '@darwin/shared';

interface StoredValueSchema<T> {
  parse(value: unknown): T;
}

const safeDiagnosticId = (value: string) =>
  value.replace(/[^a-zA-Z0-9._:-]/g, '?').slice(0, 128);

const parseStoredValue = <T>(
  schema: StoredValueSchema<T>,
  json: string,
  kind: string,
  recordId: string,
) => {
  try {
    return schema.parse(JSON.parse(json));
  } catch {
    throw new Error(
      `Stored ${kind} record ${safeDiagnosticId(recordId)} is corrupt.`,
    );
  }
};

export interface TelemetryInsertResult {
  accepted: number;
  duplicates: number;
  quotaRejected: number;
}

export interface TelemetryEventSummary {
  count: number;
  sessionCounts: Record<string, number>;
  participantCount: number;
  behaviorSignalCount: number;
}

export interface PageCursor {
  updatedAt: string;
  executionId: string;
}

export interface RepositoryExecutionPage {
  items: RepositoryMutationExecution[];
  hasMore: boolean;
  cursor: PageCursor | null;
}

export interface RetentionResult {
  deletedRecords: number;
  compactedExecutions: number;
  completedAt: string;
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
    maximumStudyEvents?: number,
    maximumTargetEvents?: number,
  ): Promise<TelemetryInsertResult>;
  listEvents(
    studyId: string,
    limit: number,
    receivedAfter?: string | null,
    source?: StudyTelemetryEvent['source'],
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
  getCodexManifestById(
    manifestId: string,
  ): Promise<CodexImplementationManifest | null>;
  saveRepositoryExecution(
    execution: RepositoryMutationExecution,
  ): Promise<void>;
  compareAndSwapRepositoryExecution(
    expected: RepositoryMutationExecution,
    next: RepositoryMutationExecution,
  ): Promise<RepositoryMutationExecution | null>;
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
  listRepositoryExecutionsPage(
    limit: number,
    cursor?: PageCursor | null,
  ): Promise<RepositoryExecutionPage>;
  getObservationArchive(
    executionId: string,
  ): Promise<ObservationArchive | null>;
  listObservationArchivesPage(
    limit: number,
    cursor?: PageCursor | null,
  ): Promise<{
    items: ObservationArchive[];
    hasMore: boolean;
    cursor: PageCursor | null;
  }>;
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
  advanceEvolutionCycle(): Promise<EvolutionCycle>;
  getTargetConnection(): Promise<TargetApplicationConnection | null>;
  saveTargetConnection(connection: TargetApplicationConnection): Promise<void>;
  deleteTargetConnection(): Promise<void>;
  getStorageHealth(
    eventQuotaPerStudy: number,
    eventQuotaPerTarget?: number,
  ): Promise<StorageHealth>;
  compactRetention(now?: string): Promise<RetentionResult>;
  deleteParticipant(studyId: string, participantId: string): Promise<number>;
  deleteStudy(studyId: string): Promise<number>;
  deleteExecution(executionId: string): Promise<number>;
  recordAuditEvent(event: OperationalAuditEvent): Promise<void>;
  listAuditEvents(limit: number): Promise<OperationalAuditEvent[]>;
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
const auditEventStore = new Map<string, OperationalAuditEvent>();
const callbackCredentialStore = new Map<string, ExecutionCallbackCredential>();
const callbackSignatureStore = new Set<string>();
let targetConnectionStore: TargetApplicationConnection | null = null;
let lastRetentionRunAt: string | null = null;
const retentionPolicyVersion = '2026-07-19.1';
const rawTelemetryRetentionDays = 30;
const automatedTelemetryRetentionDays = 14;
const baselineStudyId = 'projectflow-baseline-study';
const defaultEvolutionCycle = (): EvolutionCycle => ({
  studyId: baselineStudyId,
  startedAt: null,
  genomeEvolutionCount: 0,
});

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
  async insertEvents(
    events: StudyTelemetryEvent[],
    receivedAt: string,
    maximumStudyEvents = 100_000,
    maximumTargetEvents = 1_000_000,
  ) {
    let accepted = 0;
    let duplicates = 0;
    let quotaRejected = 0;
    for (const event of events) {
      if (eventStore.has(event.eventId)) {
        duplicates += 1;
        continue;
      }
      const studyCount = [...eventStore.values()].filter(
        (stored) => stored.studyId === event.studyId,
      ).length;
      if (
        studyCount >= maximumStudyEvents ||
        eventStore.size >= maximumTargetEvents
      ) {
        quotaRejected += 1;
        continue;
      }
      eventStore.set(event.eventId, { ...event, receivedAt });
      accepted += 1;
    }
    return { accepted, duplicates, quotaRejected };
  }

  async listEvents(
    studyId: string,
    limit: number,
    receivedAfter?: string | null,
    source?: StudyTelemetryEvent['source'],
  ) {
    return [...eventStore.values()]
      .filter(
        (event) =>
          event.studyId === studyId &&
          (!source || event.source === source) &&
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
    if (!manifestStore.has(manifest.manifestId)) {
      manifestStore.set(manifest.manifestId, manifest);
    }
  }

  async getCodexManifest(analysisId: string) {
    return (
      [...manifestStore.values()]
        .filter((manifest) => manifest.analysisId === analysisId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .at(-1) ?? null
    );
  }

  async getCodexManifestById(manifestId: string) {
    return manifestStore.get(manifestId) ?? null;
  }

  async saveRepositoryExecution(execution: RepositoryMutationExecution) {
    repositoryExecutionStore.set(
      execution.executionId,
      RepositoryMutationExecutionSchema.parse(execution),
    );
  }

  async compareAndSwapRepositoryExecution(
    expected: RepositoryMutationExecution,
    next: RepositoryMutationExecution,
  ) {
    const current = repositoryExecutionStore.get(expected.executionId);
    if (
      !current ||
      current.status !== expected.status ||
      current.version !== expected.version
    ) {
      return null;
    }
    const persisted = RepositoryMutationExecutionSchema.parse({
      ...next,
      version: expected.version + 1,
    });
    repositoryExecutionStore.set(expected.executionId, persisted);
    return persisted;
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
    return [...repositoryExecutionStore.values()].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.executionId.localeCompare(left.executionId),
    );
  }

  async listRepositoryExecutionsPage(
    limit: number,
    cursor?: PageCursor | null,
  ) {
    const eligible = (await this.listRepositoryExecutions()).filter(
      (execution) =>
        !cursor ||
        execution.updatedAt < cursor.updatedAt ||
        (execution.updatedAt === cursor.updatedAt &&
          execution.executionId < cursor.executionId),
    );
    const items = eligible.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      hasMore: eligible.length > limit,
      cursor: last
        ? { updatedAt: last.updatedAt, executionId: last.executionId }
        : null,
    };
  }

  async getObservationArchive(executionId: string) {
    const execution = await this.getRepositoryExecution(executionId);
    if (!execution || !['released', 'failed'].includes(execution.status)) {
      return null;
    }
    const analysis = await this.getEvidenceAnalysis(execution.analysisId);
    if (!analysis) return null;
    const evidence = await this.getEvidence(analysis.evidenceId);
    if (!evidence) return null;
    return {
      archiveId: execution.executionId,
      evidence,
      analysis,
      execution: {
        executionId: execution.executionId,
        manifestId: execution.manifestId,
        status: execution.status,
        createdAt: execution.createdAt,
        completedAt: execution.completedAt,
      },
    };
  }

  async listObservationArchivesPage(limit: number, cursor?: PageCursor | null) {
    const eligible = (await this.listRepositoryExecutions()).filter(
      (execution) =>
        ['released', 'failed'].includes(execution.status) &&
        (!cursor ||
          execution.updatedAt < cursor.updatedAt ||
          (execution.updatedAt === cursor.updatedAt &&
            execution.executionId < cursor.executionId)),
    );
    const executions = eligible.slice(0, limit);
    const archives = await Promise.all(
      executions.map((execution) =>
        this.getObservationArchive(execution.executionId),
      ),
    );
    const last = executions.at(-1);
    return {
      items: archives.filter(
        (archive): archive is ObservationArchive => archive !== null,
      ),
      hasMore: eligible.length > limit,
      cursor: last
        ? { updatedAt: last.updatedAt, executionId: last.executionId }
        : null,
    };
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
    const retained = [...repositoryExecutionStore.values()].filter(
      (execution) => execution.status === 'released',
    );
    if (!retained.length) return defaultEvolutionCycle();
    return {
      studyId: baselineStudyId,
      startedAt: retained.reduce<string | null>((latest, execution) => {
        const retainedAt = execution.completedAt ?? execution.updatedAt;
        return !latest || retainedAt > latest ? retainedAt : latest;
      }, null),
      genomeEvolutionCount: retained.length,
    };
  }

  async advanceEvolutionCycle() {
    return this.getEvolutionCycle();
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

  async getStorageHealth(
    eventQuotaPerStudy: number,
    eventQuotaPerTarget = 1_000_000,
  ) {
    return {
      telemetryEvents: eventStore.size,
      participantWorkspaces: workspaceStore.size,
      evidencePacks: evidenceByIdStore.size,
      repositoryExecutions: repositoryExecutionStore.size,
      labExperiments: 0,
      eventQuotaPerStudy,
      eventQuotaPerTarget,
      rawTelemetryRetentionDays,
      automatedTelemetryRetentionDays,
      lastRetentionRunAt,
      policyVersion: retentionPolicyVersion,
    };
  }

  async compactRetention(now = new Date().toISOString()) {
    const current = Date.parse(now);
    const rawCutoff = new Date(
      current - rawTelemetryRetentionDays * 86_400_000,
    ).toISOString();
    const automatedCutoff = new Date(
      current - automatedTelemetryRetentionDays * 86_400_000,
    ).toISOString();
    const outputCutoff = new Date(current - 90 * 86_400_000).toISOString();
    const auditCutoff = new Date(current - 365 * 86_400_000).toISOString();
    let deletedRecords = 0;
    let compactedExecutions = 0;
    for (const [eventId, event] of eventStore) {
      const cutoff = event.source === 'real_user' ? rawCutoff : automatedCutoff;
      if (event.receivedAt < cutoff) {
        eventStore.delete(eventId);
        deletedRecords += 1;
      }
    }
    for (const [key, workspace] of workspaceStore) {
      if (workspace.updatedAt < rawCutoff) {
        workspaceStore.delete(key);
        deletedRecords += 1;
      }
    }
    for (const [executionId, execution] of repositoryExecutionStore) {
      if (
        ['released', 'failed'].includes(execution.status) &&
        execution.updatedAt < outputCutoff &&
        (execution.patch ||
          execution.codex.finalMessage ||
          execution.checks.some((check) => check.output.length > 0))
      ) {
        repositoryExecutionStore.set(
          executionId,
          RepositoryMutationExecutionSchema.parse({
            ...execution,
            patch: null,
            checks: execution.checks.map((check) => ({
              ...check,
              output: '[compacted by retention policy]',
            })),
            codex: { ...execution.codex, finalMessage: null },
            rollback: execution.rollback
              ? {
                  ...execution.rollback,
                  patch: null,
                  checks: execution.rollback.checks.map((check) => ({
                    ...check,
                    output: '[compacted by retention policy]',
                  })),
                }
              : null,
          }),
        );
        compactedExecutions += 1;
      }
    }
    for (const [auditEventId, auditEvent] of auditEventStore) {
      if (auditEvent.occurredAt < auditCutoff) {
        auditEventStore.delete(auditEventId);
        deletedRecords += 1;
      }
    }
    lastRetentionRunAt = now;
    return { deletedRecords, compactedExecutions, completedAt: now };
  }

  async deleteParticipant(studyId: string, participantId: string) {
    let deleted = 0;
    for (const [eventId, event] of eventStore) {
      if (event.studyId === studyId && event.participantId === participantId) {
        eventStore.delete(eventId);
        deleted += 1;
      }
    }
    if (workspaceStore.delete(workspaceKey(studyId, participantId)))
      deleted += 1;
    return deleted;
  }

  async deleteExecution(executionId: string) {
    const execution = repositoryExecutionStore.get(executionId);
    if (!execution) return 0;
    repositoryExecutionStore.delete(executionId);
    manifestStore.delete(execution.manifestId);
    callbackCredentialStore.delete(executionId);
    return 1;
  }

  async deleteStudy(studyId: string) {
    let deleted = 0;
    for (const [eventId, event] of eventStore) {
      if (event.studyId === studyId) {
        eventStore.delete(eventId);
        deleted += 1;
      }
    }
    for (const key of workspaceStore.keys()) {
      if (key.startsWith(`${studyId}:`) && workspaceStore.delete(key))
        deleted += 1;
    }
    const analysisIds = new Set<string>();
    for (const [cacheKey, entry] of evidenceAnalysisStore) {
      if (entry.studyId === studyId) {
        analysisIds.add(entry.analysis.analysisId);
        evidenceAnalysisStore.delete(cacheKey);
        deleted += 1;
      }
    }
    for (const execution of [...repositoryExecutionStore.values()]) {
      if (analysisIds.has(execution.analysisId)) {
        deleted += await this.deleteExecution(execution.executionId);
      }
    }
    const evidence = evidenceStore.get(studyId);
    if (evidence) {
      evidenceStore.delete(studyId);
      evidenceByIdStore.delete(evidence.evidenceId);
      deleted += 1;
    }
    return deleted;
  }

  async recordAuditEvent(event: OperationalAuditEvent) {
    auditEventStore.set(event.auditEventId, structuredClone(event));
  }

  async listAuditEvents(limit: number) {
    return [...auditEventStore.values()]
      .sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) ||
          right.auditEventId.localeCompare(left.auditEventId),
      )
      .slice(0, limit)
      .map((event) => structuredClone(event));
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
    auditEventStore.clear();
    lastRetentionRunAt = null;
  }
}

export class D1TelemetryRepository implements TelemetryRepository {
  constructor(private readonly database: D1Database) {}

  async insertEvents(
    events: StudyTelemetryEvent[],
    receivedAt: string,
    maximumStudyEvents = 100_000,
    maximumTargetEvents = 1_000_000,
  ) {
    if (!events.length) {
      return { accepted: 0, duplicates: 0, quotaRejected: 0 };
    }
    const existing = await Promise.all(
      events.map((event) =>
        this.database
          .prepare('SELECT event_id FROM telemetry_events WHERE event_id = ?')
          .bind(event.eventId)
          .first<{ event_id: string }>(),
      ),
    );
    const duplicateIds = new Set(
      existing
        .filter((row): row is { event_id: string } => Boolean(row))
        .map((row) => row.event_id),
    );
    const studyIds = [...new Set(events.map((event) => event.studyId))];
    const targetCountRow = await this.database
      .prepare('SELECT COUNT(*) AS count FROM telemetry_events')
      .first<{ count: number }>();
    let targetCount = targetCountRow?.count ?? 0;
    const studyCounts = new Map(
      await Promise.all(
        studyIds.map(async (studyId) => {
          const row = await this.database
            .prepare(
              'SELECT COUNT(*) AS count FROM telemetry_events WHERE study_id = ?',
            )
            .bind(studyId)
            .first<{ count: number }>();
          return [studyId, row?.count ?? 0] as const;
        }),
      ),
    );
    const candidates = events.filter((event) => {
      if (duplicateIds.has(event.eventId)) return false;
      const count = studyCounts.get(event.studyId) ?? 0;
      if (count >= maximumStudyEvents || targetCount >= maximumTargetEvents) {
        return false;
      }
      studyCounts.set(event.studyId, count + 1);
      targetCount += 1;
      return true;
    });
    const statements = candidates.map((event) =>
      this.database
        .prepare(
          `INSERT OR IGNORE INTO telemetry_events (
            event_id, study_id, participant_id, session_id, task_attempt_id,
            app_version, source, occurred_at, received_at, sequence,
            event_type, route, target_id, event_json
          ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM telemetry_events WHERE study_id = ?) < ?
            AND (SELECT COUNT(*) FROM telemetry_events) < ?`,
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
          event.studyId,
          maximumStudyEvents,
          maximumTargetEvents,
        ),
    );
    const results = statements.length
      ? await this.database.batch(statements)
      : [];
    const accepted = results.reduce(
      (count, result) => count + (result.meta.changes > 0 ? 1 : 0),
      0,
    );
    return {
      accepted,
      duplicates: duplicateIds.size,
      quotaRejected: events.length - duplicateIds.size - accepted,
    };
  }

  async listEvents(
    studyId: string,
    limit: number,
    receivedAfter?: string | null,
    source?: StudyTelemetryEvent['source'],
  ) {
    const conditions = ['study_id = ?'];
    const bindings: Array<string | number> = [studyId];
    if (source) {
      conditions.push('source = ?');
      bindings.push(source);
    }
    if (receivedAfter) {
      conditions.push('received_at > ?');
      bindings.push(receivedAfter);
    }
    bindings.push(limit);
    const result = await this.database
      .prepare(
        `SELECT event_id, event_json, received_at
         FROM telemetry_events
         WHERE ${conditions.join(' AND ')}
         ORDER BY received_at DESC, sequence DESC
         LIMIT ?`,
      )
      .bind(...bindings)
      .all<{ event_id: string; event_json: string; received_at: string }>();

    return result.results
      .map((row) => ({
        ...parseStoredValue(
          StudyTelemetryEventSchema,
          row.event_json,
          'telemetry event',
          row.event_id,
        ),
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
        `SELECT event_id, event_json, received_at
         FROM telemetry_events
         WHERE study_id = ? AND session_id = ?
           AND (? IS NULL OR received_at > ?)
         ORDER BY sequence ASC`,
      )
      .bind(studyId, sessionId, receivedAfter ?? null, receivedAfter ?? null)
      .all<{ event_id: string; event_json: string; received_at: string }>();

    return result.results.map((row) => ({
      ...parseStoredValue(
        StudyTelemetryEventSchema,
        row.event_json,
        'telemetry event',
        row.event_id,
      ),
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
      ? parseStoredValue(
          ProjectFlowWorkspaceSchema,
          row.workspace_json,
          'participant workspace',
          `${studyId}:${participantId}`,
        )
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
        `SELECT evidence_id, evidence_pack_json
         FROM analysis_runs
         WHERE study_id = ?
         ORDER BY generated_at DESC
         LIMIT 1`,
      )
      .bind(studyId)
      .first<{ evidence_id: string; evidence_pack_json: string }>();
    return row
      ? parseStoredValue(
          EvidencePackSchema,
          row.evidence_pack_json,
          'evidence pack',
          row.evidence_id,
        )
      : null;
  }

  async getEvidence(evidenceId: string) {
    const row = await this.database
      .prepare(
        `SELECT evidence_pack_json FROM analysis_runs WHERE evidence_id = ? LIMIT 1`,
      )
      .bind(evidenceId)
      .first<{ evidence_pack_json: string }>();
    return row
      ? parseStoredValue(
          EvidencePackSchema,
          row.evidence_pack_json,
          'evidence pack',
          evidenceId,
        )
      : null;
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
        `SELECT analysis_id, analysis_json FROM evidence_analyses WHERE cache_key = ?`,
      )
      .bind(cacheKey)
      .first<{ analysis_id: string; analysis_json: string }>();
    return row
      ? parseStoredValue(
          EvidenceAnalysisSchema,
          row.analysis_json,
          'evidence analysis',
          row.analysis_id,
        )
      : null;
  }

  async getEvidenceAnalysis(analysisId: string) {
    const row = await this.database
      .prepare(
        `SELECT analysis_json FROM evidence_analyses WHERE analysis_id = ?`,
      )
      .bind(analysisId)
      .first<{ analysis_json: string }>();
    return row
      ? parseStoredValue(
          EvidenceAnalysisSchema,
          row.analysis_json,
          'evidence analysis',
          analysisId,
        )
      : null;
  }

  async getLatestEvidenceAnalysis(studyId: string) {
    const row = await this.database
      .prepare(
        `SELECT analysis_id, analysis_json
         FROM evidence_analyses
         WHERE study_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(studyId)
      .first<{ analysis_id: string; analysis_json: string }>();
    return row
      ? parseStoredValue(
          EvidenceAnalysisSchema,
          row.analysis_json,
          'evidence analysis',
          row.analysis_id,
        )
      : null;
  }

  async saveCodexManifest(manifest: CodexImplementationManifest) {
    await this.database
      .prepare(
        `INSERT INTO codex_manifest_versions (
          manifest_id, analysis_id, mutation_id, evidence_hash,
          manifest_hash, repository_commit, created_at, manifest_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(manifest_id) DO NOTHING`,
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
    const versioned = await this.database
      .prepare(
        `SELECT manifest_id, manifest_json
         FROM codex_manifest_versions
         WHERE analysis_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(analysisId)
      .first<{ manifest_id: string; manifest_json: string }>();
    if (versioned) {
      return parseStoredValue(
        CodexImplementationManifestSchema,
        versioned.manifest_json,
        'Codex manifest',
        versioned.manifest_id,
      );
    }
    const legacy = await this.database
      .prepare(
        `SELECT manifest_json FROM codex_manifests WHERE analysis_id = ?`,
      )
      .bind(analysisId)
      .first<{ manifest_json: string }>();
    return legacy
      ? parseStoredValue(
          CodexImplementationManifestSchema,
          legacy.manifest_json,
          'Codex manifest',
          analysisId,
        )
      : null;
  }

  async getCodexManifestById(manifestId: string) {
    const versioned = await this.database
      .prepare(
        `SELECT manifest_json
         FROM codex_manifest_versions
         WHERE manifest_id = ?`,
      )
      .bind(manifestId)
      .first<{ manifest_json: string }>();
    if (versioned) {
      return parseStoredValue(
        CodexImplementationManifestSchema,
        versioned.manifest_json,
        'Codex manifest',
        manifestId,
      );
    }
    const legacy = await this.database
      .prepare(
        `SELECT manifest_json FROM codex_manifests WHERE manifest_id = ?`,
      )
      .bind(manifestId)
      .first<{ manifest_json: string }>();
    return legacy
      ? parseStoredValue(
          CodexImplementationManifestSchema,
          legacy.manifest_json,
          'Codex manifest',
          manifestId,
        )
      : null;
  }

  async saveRepositoryExecution(execution: RepositoryMutationExecution) {
    const parsed = RepositoryMutationExecutionSchema.parse(execution);
    await this.database
      .prepare(
        `INSERT INTO repository_executions (
          execution_id, manifest_id, analysis_id, status, updated_at, version,
          execution_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(execution_id) DO UPDATE SET
          manifest_id = excluded.manifest_id,
          analysis_id = excluded.analysis_id,
          status = excluded.status,
          updated_at = excluded.updated_at,
          version = excluded.version,
          execution_json = excluded.execution_json`,
      )
      .bind(
        parsed.executionId,
        parsed.manifestId,
        parsed.analysisId,
        parsed.status,
        parsed.updatedAt,
        parsed.version,
        JSON.stringify(parsed),
      )
      .run();
  }

  async compareAndSwapRepositoryExecution(
    expected: RepositoryMutationExecution,
    next: RepositoryMutationExecution,
  ) {
    const parsedExpected = RepositoryMutationExecutionSchema.parse(expected);
    const persisted = RepositoryMutationExecutionSchema.parse({
      ...next,
      version: parsedExpected.version + 1,
    });
    const result = await this.database
      .prepare(
        `UPDATE repository_executions
         SET status = ?, updated_at = ?, version = ?, execution_json = ?
         WHERE execution_id = ? AND status = ? AND version = ?`,
      )
      .bind(
        persisted.status,
        persisted.updatedAt,
        persisted.version,
        JSON.stringify(persisted),
        parsedExpected.executionId,
        parsedExpected.status,
        parsedExpected.version,
      )
      .run();
    return (result.meta.changes ?? 0) === 1 ? persisted : null;
  }

  private async findRepositoryExecution(where: string, value: string) {
    const row = await this.database
      .prepare(
        `SELECT execution_id, execution_json FROM repository_executions WHERE ${where} = ? LIMIT 1`,
      )
      .bind(value)
      .first<{ execution_id: string; execution_json: string }>();
    return row
      ? parseStoredValue(
          RepositoryMutationExecutionSchema,
          row.execution_json,
          'repository execution',
          row.execution_id,
        )
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
        `SELECT execution_id, execution_json FROM repository_executions ORDER BY updated_at DESC`,
      )
      .all<{ execution_id: string; execution_json: string }>();
    return result.results.map((row) =>
      parseStoredValue(
        RepositoryMutationExecutionSchema,
        row.execution_json,
        'repository execution',
        row.execution_id,
      ),
    );
  }

  async listRepositoryExecutionsPage(
    limit: number,
    cursor?: PageCursor | null,
  ) {
    const statement = cursor
      ? this.database
          .prepare(
            `SELECT execution_id, execution_json
             FROM repository_executions
             WHERE updated_at < ? OR (updated_at = ? AND execution_id < ?)
             ORDER BY updated_at DESC, execution_id DESC LIMIT ?`,
          )
          .bind(
            cursor.updatedAt,
            cursor.updatedAt,
            cursor.executionId,
            limit + 1,
          )
      : this.database
          .prepare(
            `SELECT execution_id, execution_json
             FROM repository_executions
             ORDER BY updated_at DESC, execution_id DESC LIMIT ?`,
          )
          .bind(limit + 1);
    const result = await statement.all<{
      execution_id: string;
      execution_json: string;
    }>();
    const items = result.results
      .slice(0, limit)
      .map((row) =>
        parseStoredValue(
          RepositoryMutationExecutionSchema,
          row.execution_json,
          'repository execution',
          row.execution_id,
        ),
      );
    const last = items.at(-1);
    return {
      items,
      hasMore: result.results.length > limit,
      cursor: last
        ? { updatedAt: last.updatedAt, executionId: last.executionId }
        : null,
    };
  }

  private parseObservationArchiveRow(row: {
    execution_id: string;
    execution_json: string;
    analysis_id: string;
    analysis_json: string;
    evidence_id: string;
    evidence_pack_json: string;
  }): ObservationArchive {
    const execution = parseStoredValue(
      RepositoryMutationExecutionSchema,
      row.execution_json,
      'repository execution',
      row.execution_id,
    );
    const analysis = parseStoredValue(
      EvidenceAnalysisSchema,
      row.analysis_json,
      'evidence analysis',
      row.analysis_id,
    );
    const evidence = parseStoredValue(
      EvidencePackSchema,
      row.evidence_pack_json,
      'evidence pack',
      row.evidence_id,
    );
    return {
      archiveId: execution.executionId,
      evidence,
      analysis,
      execution: {
        executionId: execution.executionId,
        manifestId: execution.manifestId,
        status: execution.status,
        createdAt: execution.createdAt,
        completedAt: execution.completedAt,
      },
    };
  }

  async getObservationArchive(executionId: string) {
    const row = await this.database
      .prepare(
        `SELECT re.execution_id, re.execution_json,
                ea.analysis_id, ea.analysis_json,
                ar.evidence_id, ar.evidence_pack_json
         FROM repository_executions re
         JOIN evidence_analyses ea ON ea.analysis_id = re.analysis_id
         JOIN analysis_runs ar ON ar.evidence_id = ea.evidence_id
         WHERE re.execution_id = ? AND re.status IN ('released', 'failed')
         LIMIT 1`,
      )
      .bind(executionId)
      .first<{
        execution_id: string;
        execution_json: string;
        analysis_id: string;
        analysis_json: string;
        evidence_id: string;
        evidence_pack_json: string;
      }>();
    return row ? this.parseObservationArchiveRow(row) : null;
  }

  async listObservationArchivesPage(limit: number, cursor?: PageCursor | null) {
    const select = `SELECT re.execution_id, re.execution_json,
                           ea.analysis_id, ea.analysis_json,
                           ar.evidence_id, ar.evidence_pack_json
                    FROM repository_executions re
                    JOIN evidence_analyses ea ON ea.analysis_id = re.analysis_id
                    JOIN analysis_runs ar ON ar.evidence_id = ea.evidence_id
                    WHERE re.status IN ('released', 'failed')`;
    const statement = cursor
      ? this.database
          .prepare(
            `${select}
             AND (re.updated_at < ? OR
                  (re.updated_at = ? AND re.execution_id < ?))
             ORDER BY re.updated_at DESC, re.execution_id DESC LIMIT ?`,
          )
          .bind(
            cursor.updatedAt,
            cursor.updatedAt,
            cursor.executionId,
            limit + 1,
          )
      : this.database
          .prepare(
            `${select}
             ORDER BY re.updated_at DESC, re.execution_id DESC LIMIT ?`,
          )
          .bind(limit + 1);
    const result = await statement.all<{
      execution_id: string;
      execution_json: string;
      analysis_id: string;
      analysis_json: string;
      evidence_id: string;
      evidence_pack_json: string;
    }>();
    const pageRows = result.results.slice(0, limit);
    const items = pageRows.map((row) => this.parseObservationArchiveRow(row));
    const lastExecution = pageRows.at(-1)
      ? parseStoredValue(
          RepositoryMutationExecutionSchema,
          pageRows.at(-1)!.execution_json,
          'repository execution',
          pageRows.at(-1)!.execution_id,
        )
      : null;
    return {
      items,
      hasMore: result.results.length > limit,
      cursor: lastExecution
        ? {
            updatedAt: lastExecution.updatedAt,
            executionId: lastExecution.executionId,
          }
        : null,
    };
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
    const retained = (await this.listRepositoryExecutions()).filter(
      (execution) => execution.status === 'released',
    );
    if (!retained.length) return defaultEvolutionCycle();
    return {
      studyId: baselineStudyId,
      startedAt: retained.reduce(
        (latest, execution) =>
          !latest || (execution.completedAt ?? execution.updatedAt) > latest
            ? (execution.completedAt ?? execution.updatedAt)
            : latest,
        null as string | null,
      ),
      genomeEvolutionCount: retained.length,
    };
  }

  async advanceEvolutionCycle() {
    return this.getEvolutionCycle();
  }

  async getTargetConnection() {
    const row = await this.database
      .prepare(
        `SELECT connection_id, connection_json
         FROM target_connections
         ORDER BY connected_at DESC
         LIMIT 1`,
      )
      .first<{ connection_id: string; connection_json: string }>();
    return row
      ? parseStoredValue(
          TargetApplicationConnectionSchema,
          row.connection_json,
          'target connection',
          row.connection_id,
        )
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

  async getStorageHealth(
    eventQuotaPerStudy: number,
    eventQuotaPerTarget = 1_000_000,
  ) {
    const [events, workspaces, evidence, executions, lab, retention] =
      await Promise.all([
        this.database
          .prepare('SELECT COUNT(*) AS count FROM telemetry_events')
          .first<{ count: number }>(),
        this.database
          .prepare('SELECT COUNT(*) AS count FROM participant_workspaces')
          .first<{ count: number }>(),
        this.database
          .prepare('SELECT COUNT(*) AS count FROM analysis_runs')
          .first<{ count: number }>(),
        this.database
          .prepare('SELECT COUNT(*) AS count FROM repository_executions')
          .first<{ count: number }>(),
        this.database
          .prepare('SELECT COUNT(*) AS count FROM lab_experiments')
          .first<{ count: number }>(),
        this.database
          .prepare(
            'SELECT completed_at FROM retention_runs ORDER BY completed_at DESC LIMIT 1',
          )
          .first<{ completed_at: string }>(),
      ]);
    return {
      telemetryEvents: events?.count ?? 0,
      participantWorkspaces: workspaces?.count ?? 0,
      evidencePacks: evidence?.count ?? 0,
      repositoryExecutions: executions?.count ?? 0,
      labExperiments: lab?.count ?? 0,
      eventQuotaPerStudy,
      eventQuotaPerTarget,
      rawTelemetryRetentionDays,
      automatedTelemetryRetentionDays,
      lastRetentionRunAt: retention?.completed_at ?? null,
      policyVersion: retentionPolicyVersion,
    };
  }

  async compactRetention(now = new Date().toISOString()) {
    const current = Date.parse(now);
    const rawCutoff = new Date(
      current - rawTelemetryRetentionDays * 86_400_000,
    ).toISOString();
    const automatedCutoff = new Date(
      current - automatedTelemetryRetentionDays * 86_400_000,
    ).toISOString();
    const outputCutoff = new Date(current - 90 * 86_400_000).toISOString();
    const auditCutoff = new Date(current - 365 * 86_400_000).toISOString();
    const oldExecutions = await this.database
      .prepare(
        `SELECT execution_id, execution_json FROM repository_executions
         WHERE status IN ('released', 'failed') AND updated_at < ? LIMIT 100`,
      )
      .bind(outputCutoff)
      .all<{ execution_id: string; execution_json: string }>();
    const compacted = oldExecutions.results.flatMap((row) => {
      const execution = parseStoredValue(
        RepositoryMutationExecutionSchema,
        row.execution_json,
        'repository execution',
        row.execution_id,
      );
      if (
        !execution.patch &&
        !execution.codex.finalMessage &&
        execution.checks.every(
          (check) => check.output === '[compacted by retention policy]',
        )
      ) {
        return [];
      }
      const next = RepositoryMutationExecutionSchema.parse({
        ...execution,
        patch: null,
        checks: execution.checks.map((check) => ({
          ...check,
          output: '[compacted by retention policy]',
        })),
        codex: { ...execution.codex, finalMessage: null },
        rollback: execution.rollback
          ? {
              ...execution.rollback,
              patch: null,
              checks: execution.rollback.checks.map((check) => ({
                ...check,
                output: '[compacted by retention policy]',
              })),
            }
          : null,
      });
      return [
        this.database
          .prepare(
            'UPDATE repository_executions SET execution_json = ? WHERE execution_id = ?',
          )
          .bind(JSON.stringify(next), execution.executionId),
      ];
    });
    const deletionStatements = [
      this.database
        .prepare(
          `DELETE FROM telemetry_events
           WHERE (source = 'real_user' AND received_at < ?)
              OR (source != 'real_user' AND received_at < ?)`,
        )
        .bind(rawCutoff, automatedCutoff),
      this.database
        .prepare('DELETE FROM participant_workspaces WHERE updated_at < ?')
        .bind(rawCutoff),
      this.database
        .prepare(
          `DELETE FROM lab_agent_actions WHERE experiment_id IN (
             SELECT experiment_id FROM lab_experiments
             WHERE status IN ('completed', 'cancelled', 'archived', 'failed')
               AND updated_at < ?
           )`,
        )
        .bind(automatedCutoff),
      this.database
        .prepare('DELETE FROM operational_audit_events WHERE occurred_at < ?')
        .bind(auditCutoff),
      this.database
        .prepare(
          `DELETE FROM lab_agent_runs WHERE experiment_id IN (
             SELECT experiment_id FROM lab_experiments
             WHERE status IN ('completed', 'cancelled', 'archived', 'failed')
               AND updated_at < ?
           )`,
        )
        .bind(automatedCutoff),
    ];
    const results = await this.database.batch([
      ...deletionStatements,
      ...compacted,
    ]);
    const deletedRecords = results
      .slice(0, deletionStatements.length)
      .reduce((count, result) => count + (result.meta.changes ?? 0), 0);
    await this.database
      .prepare(
        `INSERT INTO retention_runs (
           retention_run_id, started_at, completed_at, deleted_records,
           compacted_executions, policy_version
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `retention-${crypto.randomUUID()}`,
        now,
        now,
        deletedRecords,
        compacted.length,
        retentionPolicyVersion,
      )
      .run();
    return {
      deletedRecords,
      compactedExecutions: compacted.length,
      completedAt: now,
    };
  }

  async deleteParticipant(studyId: string, participantId: string) {
    const results = await this.database.batch([
      this.database
        .prepare(
          'DELETE FROM telemetry_events WHERE study_id = ? AND participant_id = ?',
        )
        .bind(studyId, participantId),
      this.database
        .prepare(
          'DELETE FROM participant_workspaces WHERE study_id = ? AND participant_id = ?',
        )
        .bind(studyId, participantId),
    ]);
    return results.reduce(
      (count, result) => count + (result.meta.changes ?? 0),
      0,
    );
  }

  async deleteExecution(executionId: string) {
    const results = await this.database.batch([
      this.database
        .prepare(
          'DELETE FROM execution_callback_signatures WHERE execution_id = ?',
        )
        .bind(executionId),
      this.database
        .prepare(
          'DELETE FROM execution_callback_credentials WHERE execution_id = ?',
        )
        .bind(executionId),
      this.database
        .prepare(
          `DELETE FROM codex_manifest_versions WHERE manifest_id IN (
             SELECT manifest_id FROM repository_executions WHERE execution_id = ?
           )`,
        )
        .bind(executionId),
      this.database
        .prepare(
          `DELETE FROM codex_manifests WHERE manifest_id IN (
             SELECT manifest_id FROM repository_executions WHERE execution_id = ?
           )`,
        )
        .bind(executionId),
      this.database
        .prepare('DELETE FROM repository_executions WHERE execution_id = ?')
        .bind(executionId),
    ]);
    return results.reduce(
      (count, result) => count + (result.meta.changes ?? 0),
      0,
    );
  }

  async deleteStudy(studyId: string) {
    const results = await this.database.batch([
      this.database
        .prepare('DELETE FROM telemetry_events WHERE study_id = ?')
        .bind(studyId),
      this.database
        .prepare('DELETE FROM participant_workspaces WHERE study_id = ?')
        .bind(studyId),
      this.database
        .prepare(
          `DELETE FROM execution_callback_signatures WHERE execution_id IN (
             SELECT re.execution_id FROM repository_executions re
             JOIN evidence_analyses ea ON ea.analysis_id = re.analysis_id
             WHERE ea.study_id = ?
           )`,
        )
        .bind(studyId),
      this.database
        .prepare(
          `DELETE FROM execution_callback_credentials WHERE execution_id IN (
             SELECT re.execution_id FROM repository_executions re
             JOIN evidence_analyses ea ON ea.analysis_id = re.analysis_id
             WHERE ea.study_id = ?
           )`,
        )
        .bind(studyId),
      this.database
        .prepare(
          `DELETE FROM codex_manifest_versions WHERE analysis_id IN (
             SELECT analysis_id FROM evidence_analyses WHERE study_id = ?
           )`,
        )
        .bind(studyId),
      this.database
        .prepare(
          `DELETE FROM codex_manifests WHERE analysis_id IN (
             SELECT analysis_id FROM evidence_analyses WHERE study_id = ?
           )`,
        )
        .bind(studyId),
      this.database
        .prepare(
          `DELETE FROM repository_executions WHERE analysis_id IN (
             SELECT analysis_id FROM evidence_analyses WHERE study_id = ?
           )`,
        )
        .bind(studyId),
      this.database
        .prepare('DELETE FROM evidence_analyses WHERE study_id = ?')
        .bind(studyId),
      this.database
        .prepare('DELETE FROM analysis_runs WHERE study_id = ?')
        .bind(studyId),
    ]);
    return results.reduce(
      (count, result) => count + (result.meta.changes ?? 0),
      0,
    );
  }

  async recordAuditEvent(event: OperationalAuditEvent) {
    await this.database
      .prepare(
        `INSERT INTO operational_audit_events (
           audit_event_id, request_id, occurred_at, actor, target, action,
           outcome, before_state, after_state, duration_ms, metadata_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.auditEventId,
        event.requestId,
        event.occurredAt,
        event.actor,
        event.target,
        event.action,
        event.outcome,
        event.beforeState,
        event.afterState,
        event.durationMs,
        JSON.stringify(event.metadata),
      )
      .run();
  }

  async listAuditEvents(limit: number) {
    const result = await this.database
      .prepare(
        `SELECT audit_event_id, request_id, occurred_at, actor, target, action,
                outcome, before_state, after_state, duration_ms, metadata_json
         FROM operational_audit_events
         ORDER BY occurred_at DESC, audit_event_id DESC LIMIT ?`,
      )
      .bind(Math.min(100, Math.max(1, limit)))
      .all<{
        audit_event_id: string;
        request_id: string;
        occurred_at: string;
        actor: string;
        target: string;
        action: string;
        outcome: OperationalAuditEvent['outcome'];
        before_state: string | null;
        after_state: string | null;
        duration_ms: number;
        metadata_json: string;
      }>();
    return result.results.map((row) => ({
      auditEventId: row.audit_event_id,
      requestId: row.request_id,
      occurredAt: row.occurred_at,
      actor: row.actor,
      target: row.target,
      action: row.action,
      outcome: row.outcome,
      beforeState: row.before_state,
      afterState: row.after_state,
      durationMs: row.duration_ms,
      metadata: parseStoredValue(
        OperationalAuditEventSchema.shape.metadata,
        row.metadata_json,
        'audit metadata',
        row.audit_event_id,
      ),
    }));
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
      this.database.prepare('DELETE FROM retention_runs'),
      this.database.prepare('DELETE FROM operational_audit_events'),
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

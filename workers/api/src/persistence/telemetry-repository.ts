import type {
  ProjectFlowWorkspace,
  StoredTelemetryEvent,
  StudyTelemetryEvent,
} from '@darwin/shared';

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
  reset(): Promise<void>;
}

const eventStore = new Map<string, StoredTelemetryEvent>();
const workspaceStore = new Map<string, ProjectFlowWorkspace>();

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

  async reset() {
    eventStore.clear();
    workspaceStore.clear();
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

  async reset() {
    await this.database.batch([
      this.database.prepare('DELETE FROM telemetry_events'),
      this.database.prepare('DELETE FROM participant_workspaces'),
    ]);
  }
}

const inMemoryRepository = new InMemoryTelemetryRepository();

export const getTelemetryRepository = (database?: D1Database) =>
  database ? new D1TelemetryRepository(database) : inMemoryRepository;

export const resetInMemoryTelemetry = () => inMemoryRepository.reset();

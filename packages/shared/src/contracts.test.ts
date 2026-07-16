import { describe, expect, it } from 'vitest';

import {
  HealthResponseSchema,
  MutationProposalSchema,
  StudyTelemetryEventSchema,
  TelemetryBatchSchema,
} from './contracts';

describe('shared contracts', () => {
  it('accepts a valid health response', () => {
    expect(
      HealthResponseSchema.parse({
        status: 'ok',
        service: 'darwin-api',
        version: '0.1.0',
        timestamp: '2026-07-16T12:00:00.000Z',
      }),
    ).toMatchObject({ status: 'ok', service: 'darwin-api' });
  });

  it('rejects mutation confidence outside the supported range', () => {
    const proposal = {
      id: 'mutation-001',
      name: 'Promote task discovery',
      observation: 'Assigned work is difficult to locate.',
      evidence: ['42% of task workflows backtrack through Projects.'],
      hypothesis: 'A global entry point will reduce navigation cost.',
      implementationSummary: 'Promote search and My Work.',
      predictedFitnessGain: 18,
      confidence: 1.2,
      risk: 'low',
      affectedFiles: ['apps/web/src/App.tsx'],
      status: 'proposed',
    };

    expect(() => MutationProposalSchema.parse(proposal)).toThrow();
  });

  it('accepts an attempt-scoped real study event with provenance', () => {
    const event = StudyTelemetryEventSchema.parse({
      schemaVersion: 1,
      eventId: '49d13df2-8dce-4ad3-b20e-d8b4edc01b63',
      sessionId: 'session-01',
      participantId: 'participant-01',
      studyId: 'projectflow-baseline-study',
      appVersion: '1.0.0',
      source: 'real_user',
      occurredAt: '2026-07-16T12:00:00.000Z',
      sequence: 4,
      route: '/projects/apollo/tasks',
      viewport: 'desktop',
      eventType: 'task_completed',
      taskAttemptId: 'attempt-01',
      taskId: 'find-assigned-task',
      durationMs: 12_400,
      outcome: 'success',
    });

    expect(event).toMatchObject({
      source: 'real_user',
      taskAttemptId: 'attempt-01',
      outcome: 'success',
    });
  });

  it('rejects raw values and oversized telemetry batches', () => {
    const event = {
      schemaVersion: 1,
      eventId: '49d13df2-8dce-4ad3-b20e-d8b4edc01b63',
      sessionId: 'session-01',
      participantId: 'participant-01',
      studyId: 'projectflow-baseline-study',
      appVersion: '1.0.0',
      source: 'real_user',
      occurredAt: '2026-07-16T12:00:00.000Z',
      sequence: 4,
      route: '/projects',
      viewport: 'desktop',
      eventType: 'search_performed',
      targetId: 'project-search',
      properties: { queryLength: 5, resultCount: 2, query: 'alpha' },
    };

    expect(() => StudyTelemetryEventSchema.parse(event)).toThrow();
    expect(() =>
      TelemetryBatchSchema.parse({
        events: Array.from({ length: 51 }, () => event),
      }),
    ).toThrow();
  });

  it('accepts bounded pointer evidence and rejects raw coordinates', () => {
    const event = {
      schemaVersion: 1,
      eventId: '49d13df2-8dce-4ad3-b20e-d8b4edc01b63',
      sessionId: 'session-01',
      participantId: 'participant-01',
      studyId: 'projectflow-baseline-study',
      appVersion: '1.0.0',
      source: 'real_user',
      occurredAt: '2026-07-16T12:00:00.000Z',
      sequence: 5,
      route: '/projects',
      viewport: 'desktop',
      eventType: 'element_clicked',
      targetId: 'metric-open-tasks',
      properties: {
        pointerType: 'mouse',
        interactive: false,
        clickCount: 1,
        xRatio: 0.72,
        yRatio: 0.44,
        hoverToClickMs: 840,
      },
    };

    expect(StudyTelemetryEventSchema.parse(event)).toMatchObject({
      eventType: 'element_clicked',
      properties: { xRatio: 0.72, pointerType: 'mouse' },
    });
    expect(() =>
      StudyTelemetryEventSchema.parse({
        ...event,
        properties: { ...event.properties, clientX: 1_248 },
      }),
    ).toThrow();
  });
});

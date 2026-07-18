import { describe, expect, it } from 'vitest';

import {
  HealthResponseSchema,
  EvidenceMutationCandidateSchema,
  OperationalTelemetryMetricsSchema,
  StudyTelemetrySummarySchema,
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
        commitSha: 'a'.repeat(40),
        buildId: 'v0.1.0@aaaaaaa',
        retention: {
          status: 'healthy',
          policy: {
            version: '1.0.0',
            rawTelemetryDays: 30,
            workspaceDays: 30,
            derivedEvidenceDays: 90,
            executionArtifactDays: 30,
            fossilRecordDays: 365,
            operationalAuditDays: 90,
            maxEventsPerStudy: 50_000,
            maxEventsPerTarget: 250_000,
          },
          eventCount: 0,
          studyCount: 0,
          largestStudyEventCount: 0,
          expiredRecordCount: 0,
          lastSweepAt: null,
        },
        analysis: {
          mode: 'live',
          model: 'gpt-5.6',
          liveModelAvailable: false,
        },
        timestamp: '2026-07-16T12:00:00.000Z',
      }),
    ).toMatchObject({ status: 'ok', service: 'darwin-api' });
  });

  it('validates non-negative operational telemetry counters', () => {
    const metrics = {
      updatedAt: '2026-07-18T08:00:00.000Z',
      telemetryRequests: 8,
      acceptedEvents: 3,
      rejectedEvents: 2,
      duplicateEvents: 1,
      authenticationRejected: 1,
      replayRejected: 1,
      contextRejected: 1,
      rateLimited: 0,
    };
    expect(OperationalTelemetryMetricsSchema.parse(metrics)).toEqual(metrics);
    expect(() =>
      OperationalTelemetryMetricsSchema.parse({
        ...metrics,
        authenticationRejected: -1,
      }),
    ).toThrow();
  });

  it('rejects live mutation confidence outside the supported range', () => {
    const proposal = {
      id: 'mutation-001',
      title: 'Promote task discovery',
      problem: 'Assigned work is difficult to locate.',
      evidenceIds: ['EV-001'],
      pressureClusterIds: ['task-discovery'],
      hypothesis: 'A global entry point will reduce navigation cost.',
      change: 'Promote search and My Work.',
      predictedImpact: {
        metric: 'interactions to task',
        direction: 'decrease',
        rationale: 'A direct route removes project guessing.',
      },
      confidence: 1.2,
      scorecard: {
        evidenceStrength: 80,
        userImpact: 90,
        feasibility: 85,
        validationClarity: 90,
        total: 86,
      },
      scope: ['src/App.tsx'],
      tradeoffs: ['Adds one primary destination.'],
      acceptanceCriteria: ['Assigned work is directly reachable.'],
      validationPlan: {
        primaryMetric: 'interactions to task',
        baseline: '8 median interactions',
        successThreshold: '5 or fewer median interactions',
        guardrails: ['Existing routes remain available.'],
      },
      codexBrief: 'Add a directly reachable assigned-work view.',
    };

    expect(() => EvidenceMutationCandidateSchema.parse(proposal)).toThrow();
  });

  it('keeps the default telemetry summary aggregate-only', () => {
    const summary = {
      studyId: 'projectflow-baseline-study',
      count: 24,
      sessionCount: 3,
      participantCount: 2,
      behaviorSignalCount: 6,
    };
    expect(StudyTelemetrySummarySchema.parse(summary)).toEqual(summary);
    expect(() =>
      StudyTelemetrySummarySchema.parse({
        ...summary,
        events: [],
        sessionCounts: { 'session-sensitive': 12 },
      }),
    ).toThrow();
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

  it('accepts browser history and relative zoom telemetry', () => {
    const base = {
      schemaVersion: 1,
      sessionId: 'session-01',
      participantId: 'participant-01',
      studyId: 'projectflow-baseline-study',
      appVersion: '1.0.0',
      source: 'real_user',
      occurredAt: '2026-07-16T12:00:00.000Z',
      route: '/study/projects/apollo',
      viewport: 'desktop',
    } as const;

    expect(
      StudyTelemetryEventSchema.parse({
        ...base,
        eventId: '49d13df2-8dce-4ad3-b20e-d8b4edc01b63',
        sequence: 6,
        eventType: 'browser_navigation',
        properties: {
          direction: 'back',
          fromRoute: '/study/projects/apollo',
          toRoute: '/study/projects',
        },
      }),
    ).toMatchObject({
      eventType: 'browser_navigation',
      properties: { direction: 'back' },
    });
    expect(
      StudyTelemetryEventSchema.parse({
        ...base,
        eventId: '26f5d6df-87a7-486a-95f2-0285fbc85772',
        sequence: 7,
        eventType: 'viewport_zoom_changed',
        properties: { fromScale: 1, toScale: 1.25 },
      }),
    ).toMatchObject({
      eventType: 'viewport_zoom_changed',
      properties: { toScale: 1.25 },
    });
  });
});

import type { StoredTelemetryEvent } from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { buildEvidencePack, reconstructAttempts } from './evidence';

const id = (sequence: number) =>
  `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;

const base = (sequence: number, route: string) => ({
  schemaVersion: 1 as const,
  eventId: id(sequence + 1),
  sessionId: 'session-evidence',
  participantId: 'participant-evidence',
  studyId: 'projectflow-baseline-study',
  appVersion: '1.0.0',
  source: 'real_user' as const,
  occurredAt: `2026-07-16T12:00:${sequence.toString().padStart(2, '0')}.000Z`,
  receivedAt: `2026-07-16T12:01:${sequence.toString().padStart(2, '0')}.000Z`,
  sequence,
  route,
  viewport: 'desktop' as const,
});

const attemptId = 'attempt-evidence';
const taskId = 'find-assigned-task';
const events: StoredTelemetryEvent[] = [
  {
    ...base(0, '/study/dashboard'),
    eventType: 'task_started',
    taskAttemptId: attemptId,
    taskId,
  },
  {
    ...base(1, '/study/dashboard'),
    eventType: 'element_clicked',
    targetId: 'nav-projects',
    taskAttemptId: attemptId,
    taskId,
  },
  {
    ...base(2, '/study/projects'),
    eventType: 'route_changed',
    properties: { fromRoute: '/study/dashboard' },
  },
  { ...base(3, '/study/projects'), eventType: 'page_view' },
  {
    ...base(4, '/study/projects'),
    eventType: 'element_clicked',
    targetId: 'project-open-apollo',
    taskAttemptId: attemptId,
    taskId,
  },
  {
    ...base(5, '/study/projects/apollo'),
    eventType: 'route_changed',
    properties: { fromRoute: '/study/projects' },
  },
  {
    ...base(6, '/study/projects/apollo'),
    eventType: 'element_clicked',
    targetId: 'project-tasks-open',
    taskAttemptId: attemptId,
    taskId,
  },
  {
    ...base(7, '/study/projects/apollo/tasks'),
    eventType: 'route_changed',
    properties: { fromRoute: '/study/projects/apollo' },
  },
  {
    ...base(8, '/study/projects/apollo/tasks'),
    eventType: 'element_clicked',
    targetId: 'task-open-apl-241',
    taskAttemptId: attemptId,
    taskId,
  },
  {
    ...base(9, '/study/projects/apollo/tasks'),
    eventType: 'task_completed',
    taskAttemptId: attemptId,
    taskId,
    durationMs: 9_000,
    outcome: 'success',
  },
];

describe('real telemetry evidence engine', () => {
  it('reconstructs one unambiguous successful task attempt', () => {
    const attempts = reconstructAttempts(events, '2026-07-16T12:02:00.000Z');

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attemptId,
      taskId,
      outcome: 'success',
      interactionCount: 7,
      durationMs: 9_000,
    });
    expect(attempts[0]?.routePath).toEqual([
      '/study/projects',
      '/study/projects/apollo',
      '/study/projects/apollo/tasks',
    ]);
  });

  it('creates stable, traceable excess-path evidence', async () => {
    const first = await buildEvidencePack(
      'projectflow-baseline-study',
      events,
      '2026-07-16T12:02:00.000Z',
    );
    const second = await buildEvidencePack(
      'projectflow-baseline-study',
      events,
      '2026-07-16T13:00:00.000Z',
    );

    expect(first.evidenceHash).toBe(second.evidenceHash);
    expect(first.study).toMatchObject({
      sourceEventCount: 10,
      participants: 1,
      sessions: 1,
      attempts: 1,
    });
    expect(first.frictionSignals[0]).toMatchObject({
      evidenceId: 'EV-001',
      ruleId: 'excess_path_length',
      taskId,
      affectedAttemptIds: [attemptId],
    });
    expect(first.frictionSignals[0]?.supportingEventIds).toContain(id(1));
  });

  it('rounds an even-sample duration median to whole milliseconds', async () => {
    const secondAttempt = events.map((event, index) => ({
      ...event,
      eventId: id(index + 101),
      sessionId: 'session-evidence-second',
      participantId: 'participant-evidence-second',
      sequence: index,
      ...('taskAttemptId' in event
        ? { taskAttemptId: 'attempt-evidence-second' }
        : {}),
      ...(event.eventType === 'task_completed' ? { durationMs: 9_001 } : {}),
    })) as StoredTelemetryEvent[];

    const pack = await buildEvidencePack(
      'projectflow-baseline-study',
      [...events, ...secondAttempt],
      '2026-07-16T12:02:00.000Z',
    );

    expect(pack.tasks[0]?.medianDurationMs).toBe(9_001);
  });

  it('rejects a measurement window containing multiple application versions', async () => {
    const mixedEvents = events.map((event, index) => ({
      ...event,
      appVersion: index === events.length - 1 ? 'bbbbbbbbbbbb' : 'aaaaaaaaaaaa',
    }));

    await expect(
      buildEvidencePack(
        'projectflow-baseline-study',
        mixedEvents,
        '2026-07-16T12:02:00.000Z',
        {
          appVersion: 'bbbbbbbbbbbb',
          measuredCommit: 'b'.repeat(40),
          deploymentVerifiedAt: '2026-07-16T11:59:00.000Z',
        },
      ),
    ).rejects.toMatchObject({
      name: 'EvidenceVersionMismatchError',
      appVersions: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'],
    });
  });

  it('retains the verified deployment boundary in evidence', async () => {
    const versionedEvents = events.map((event) => ({
      ...event,
      appVersion: 'bbbbbbbbbbbb',
    }));
    const pack = await buildEvidencePack(
      'projectflow-baseline-study',
      versionedEvents,
      '2026-07-16T12:02:00.000Z',
      {
        appVersion: 'bbbbbbbbbbbb',
        measuredCommit: 'b'.repeat(40),
        deploymentVerifiedAt: '2026-07-16T11:59:00.000Z',
      },
    );

    expect(pack.study).toMatchObject({
      appVersion: 'bbbbbbbbbbbb',
      measuredCommit: 'b'.repeat(40),
      deploymentVerifiedAt: '2026-07-16T11:59:00.000Z',
    });
  });

  it('turns derived pointer behavior into compact citable evidence', async () => {
    const richEvents: StoredTelemetryEvent[] = [
      ...events,
      {
        ...base(10, '/study/projects/apollo/tasks'),
        eventType: 'hover_ended',
        targetId: 'task-create-open',
        taskAttemptId: attemptId,
        taskId,
        properties: {
          pointerType: 'mouse',
          durationMs: 1_450,
          clicked: false,
          immediateExit: false,
          hoverToClickMs: null,
        },
      },
      {
        ...base(11, '/study/projects/apollo/tasks'),
        eventType: 'interaction_signal',
        targetId: 'task-create-open',
        taskAttemptId: attemptId,
        taskId,
        properties: {
          signal: 'rage_click',
          pointerType: 'mouse',
          count: 4,
          windowMs: 620,
        },
      },
      {
        ...base(12, '/study/projects/apollo/tasks'),
        eventType: 'interaction_signal',
        targetId: 'task-create-open',
        taskAttemptId: attemptId,
        taskId,
        properties: {
          signal: 'rage_click',
          pointerType: 'mouse',
          count: 3,
          windowMs: 540,
        },
      },
      {
        ...base(13, '/study/projects/apollo/tasks'),
        eventType: 'browser_navigation',
        taskAttemptId: attemptId,
        taskId,
        properties: {
          direction: 'back',
          fromRoute: '/study/projects/apollo/tasks',
          toRoute: '/study/projects/apollo',
        },
      },
      {
        ...base(14, '/study/projects/apollo'),
        eventType: 'viewport_zoom_changed',
        taskAttemptId: attemptId,
        taskId,
        properties: { fromScale: 1, toScale: 1.25 },
      },
    ];

    const pack = await buildEvidencePack(
      'projectflow-baseline-study',
      richEvents,
      '2026-07-16T12:02:00.000Z',
    );

    expect(pack.parserVersion).toBe('1.2.0');
    expect(pack.quality).toMatchObject({
      strength: 'directional',
      sessionCount: 1,
      participantCount: 1,
    });
    expect(pack.journeys[0]?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventRef: 'E-011',
          eventType: 'hover_ended',
          attributes: expect.objectContaining({ durationMs: 1450 }),
        }),
      ]),
    );
    expect(pack.frictionSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'rage_click',
          ruleVersion: '1.2.0',
          support: expect.objectContaining({ events: 2, sessions: 1 }),
          supportingEventIds: [id(12), id(13)],
        }),
        expect.objectContaining({
          ruleId: 'hover_hesitation',
          supportingEventIds: [id(11)],
        }),
        expect.objectContaining({
          ruleId: 'browser_back_dependency',
          supportingEventIds: [id(14)],
        }),
        expect.objectContaining({
          ruleId: 'zoom_readability',
          supportingEventIds: [id(15)],
        }),
      ]),
    );
    expect(
      pack.frictionSignals.filter((signal) => signal.ruleId === 'rage_click'),
    ).toHaveLength(1);
  });
});

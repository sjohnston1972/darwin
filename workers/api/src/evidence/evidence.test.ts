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

  it('aggregates recurring behavior across participants with stable group IDs', async () => {
    const hover = (
      sequence: number,
      sessionId: string,
      participantId: string,
    ): StoredTelemetryEvent => ({
      ...base(sequence, '/study/projects'),
      eventId: id(500 + sequence),
      sessionId,
      participantId,
      eventType: 'hover_ended',
      targetId: 'project-create-open',
      taskAttemptId: `attempt-${sessionId}`,
      taskId,
      properties: {
        pointerType: 'mouse',
        durationMs: 1_200 + sequence,
        clicked: false,
        immediateExit: false,
        hoverToClickMs: null,
      },
    });
    const firstEvents = [
      hover(1, 'session-recurring-a', 'participant-recurring-a'),
      hover(2, 'session-recurring-b', 'participant-recurring-b'),
    ];
    const laterEvent = hover(
      3,
      'session-recurring-c',
      'participant-recurring-a',
    );

    const first = await buildEvidencePack(
      'projectflow-baseline-study',
      firstEvents,
      '2026-07-16T12:02:00.000Z',
    );
    const expanded = await buildEvidencePack(
      'projectflow-baseline-study',
      [...firstEvents, laterEvent],
      '2026-07-16T12:02:00.000Z',
    );
    const firstSignal = first.frictionSignals.find(
      (signal) => signal.ruleId === 'hover_hesitation',
    );
    const expandedSignal = expanded.frictionSignals.find(
      (signal) => signal.ruleId === 'hover_hesitation',
    );

    expect(firstSignal?.evidenceId).toMatch(/^EV-[a-f0-9]{12}$/);
    expect(expandedSignal?.evidenceId).toBe(firstSignal?.evidenceId);
    expect(expandedSignal?.support).toEqual({
      events: 3,
      attempts: 3,
      sessions: 3,
      participants: 2,
    });
    expect(expandedSignal?.trace).toHaveLength(3);
  });

  it('keeps recurring behavior on distinct routes in separate groups', async () => {
    const drags = ['/study/dashboard', '/study/projects'].flatMap(
      (route, routeIndex) =>
        [0, 1].map((offset): StoredTelemetryEvent => ({
          ...base(20 + routeIndex * 2 + offset, route),
          eventId: id(700 + routeIndex * 2 + offset),
          sessionId: `session-drag-${routeIndex}-${offset}`,
          participantId: `participant-drag-${offset}`,
          eventType: 'drag_attempted',
          targetId: 'project-card',
          taskAttemptId: `attempt-drag-${routeIndex}-${offset}`,
          taskId,
          properties: {
            pointerType: 'mouse',
            distancePx: 80,
            draggable: false,
          },
        })),
    );

    const pack = await buildEvidencePack(
      'projectflow-baseline-study',
      drags,
      '2026-07-16T12:02:00.000Z',
    );
    const signals = pack.frictionSignals.filter(
      (signal) => signal.ruleId === 'drag_expectation',
    );

    expect(signals).toHaveLength(2);
    expect(signals.map((signal) => signal.support.events)).toEqual([2, 2]);
    expect(new Set(signals.map((signal) => signal.evidenceId)).size).toBe(2);
  });

  it('ends an unterminated attempt when the next task starts', () => {
    const secondAttemptId = 'attempt-evidence-second';
    const boundedEvents: StoredTelemetryEvent[] = [
      {
        ...base(0, '/study/dashboard'),
        eventType: 'task_started',
        taskAttemptId: attemptId,
        taskId: 'create-project',
      },
      {
        ...base(1, '/study/projects'),
        eventType: 'route_changed',
        properties: { fromRoute: '/study/dashboard' },
      },
      {
        ...base(2, '/study/projects'),
        eventType: 'task_started',
        taskAttemptId: secondAttemptId,
        taskId,
      },
      {
        ...base(3, '/study/projects'),
        eventType: 'element_clicked',
        targetId: 'task-open-apl-241',
        taskAttemptId: secondAttemptId,
        taskId,
      },
      {
        ...base(4, '/study/projects/apollo/tasks'),
        eventType: 'task_completed',
        taskAttemptId: secondAttemptId,
        taskId,
        durationMs: 2_000,
        outcome: 'success',
      },
    ];

    const attempts = reconstructAttempts(
      boundedEvents,
      '2026-07-16T12:05:00.000Z',
    );

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      attemptId,
      outcome: 'abandoned',
      eventIds: [id(1), id(2)],
    });
    expect(attempts[1]).toMatchObject({
      attemptId: secondAttemptId,
      outcome: 'success',
      eventIds: [id(3), id(4), id(5)],
    });
  });

  it('rejects mixed application versions and evidence classes', async () => {
    await expect(
      buildEvidencePack('projectflow-baseline-study', [
        events[0]!,
        { ...events[1]!, appVersion: '1.1.0' },
      ]),
    ).rejects.toThrow('cannot mix application versions');
    await expect(
      buildEvidencePack('projectflow-baseline-study', [
        events[0]!,
        { ...events[1]!, source: 'automated' },
      ]),
    ).rejects.toThrow('cannot mix measured, automated, and synthetic');
  });

  it('bounds citations while preserving the total support count', async () => {
    const startedAt = Date.parse('2026-07-16T12:00:00.000Z');
    const longAttempt = Array.from({ length: 82 }, (_, sequence) => {
      const common = {
        ...base(0, '/study/projects'),
        eventId: id(1_000 + sequence),
        occurredAt: new Date(startedAt + sequence * 10).toISOString(),
        receivedAt: new Date(startedAt + 60_000 + sequence * 10).toISOString(),
        sequence,
        taskAttemptId: attemptId,
        taskId,
      };
      if (sequence === 0) {
        return { ...common, eventType: 'task_started' as const };
      }
      if (sequence === 81) {
        return {
          ...common,
          eventType: 'task_completed' as const,
          durationMs: 810,
          outcome: 'success' as const,
        };
      }
      return {
        ...common,
        eventType: 'element_clicked' as const,
        targetId: `target-${sequence}`,
      };
    }) satisfies StoredTelemetryEvent[];

    const pack = await buildEvidencePack(
      'projectflow-baseline-study',
      longAttempt,
      '2026-07-16T12:02:00.000Z',
    );
    const pathSignal = pack.frictionSignals.find(
      (signal) => signal.ruleId === 'excess_path_length',
    );

    expect(pathSignal?.support.events).toBe(82);
    expect(pathSignal?.supportingEventIds).toHaveLength(50);
    expect(pathSignal?.trace).toHaveLength(12);
  });

  it('processes a deterministic 10,000-event study within a bounded budget', async () => {
    const startedAt = Date.parse('2026-07-16T12:00:00.000Z');
    const largeStudy = Array.from({ length: 10_000 }, (_, index) => {
      const attempt = Math.floor(index / 10);
      const sequence = index % 10;
      const common = {
        schemaVersion: 1 as const,
        eventId: id(10_000 + index),
        sessionId: `session-performance-${attempt}`,
        participantId: `participant-performance-${attempt % 4}`,
        studyId: 'projectflow-baseline-study',
        appVersion: '1.0.0',
        source: 'real_user' as const,
        occurredAt: new Date(startedAt + index).toISOString(),
        receivedAt: new Date(startedAt + 60_000 + index).toISOString(),
        sequence,
        route: '/study/projects',
        viewport: 'desktop' as const,
        taskAttemptId: `attempt-performance-${attempt}`,
        taskId,
      };
      if (sequence === 0) {
        return { ...common, eventType: 'task_started' as const };
      }
      if (sequence === 9) {
        return {
          ...common,
          eventType: 'task_completed' as const,
          durationMs: 90,
          outcome: 'success' as const,
        };
      }
      return {
        ...common,
        eventType: 'element_clicked' as const,
        targetId: `performance-target-${sequence}`,
      };
    }) satisfies StoredTelemetryEvent[];
    const before = performance.now();

    const pack = await buildEvidencePack(
      'projectflow-baseline-study',
      largeStudy,
      '2026-07-16T12:05:00.000Z',
    );

    expect(pack.study.sourceEventCount).toBe(10_000);
    expect(pack.study.attempts).toBe(1_000);
    expect(performance.now() - before).toBeLessThan(1_500);
  });
});

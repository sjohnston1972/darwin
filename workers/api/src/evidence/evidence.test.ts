import type {
  EvidenceApplicationMap,
  StoredTelemetryEvent,
} from '@darwin/shared';
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
const applicationMap = {
  source: {
    repositorySha: 'a'.repeat(40),
    sourceHash: 'b'.repeat(64),
  },
  product: {
    name: 'ProjectFlow',
    purpose: 'Project management workspace.',
    primaryUser: 'Knowledge worker.',
    domainEntities: ['project', 'task', 'user'],
    primaryGoals: ['find assigned work'],
  },
  activeGenome: {
    version: 'aaaaaaaaaaaa',
    navigation: ['Dashboard', 'Projects'],
    capabilities: ['project-scoped task search'],
  },
  interfaceInventory: [
    {
      area: 'task-discovery',
      purpose: 'Find assigned work.',
      primaryActions: ['open task'],
    },
  ],
  routes: ['/dashboard', '/projects'],
  mutableAreas: ['navigation', 'search'],
  protectedAreas: ['telemetry-history'],
} satisfies EvidenceApplicationMap;
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

const coverageBase = (
  idOffset: number,
  index: number,
  sessionIndex: number,
  participantIndex: number,
) => ({
  ...base(0, '/study/dashboard'),
  eventId: id(idOffset + index),
  sessionId: `session-coverage-${sessionIndex}`,
  participantId: `participant-coverage-${participantIndex}`,
  occurredAt: new Date(
    Date.parse('2026-07-16T12:00:00.000Z') + index * 1_000,
  ).toISOString(),
  receivedAt: new Date(
    Date.parse('2026-07-16T12:02:00.000Z') + index * 1_000,
  ).toISOString(),
  sequence: index,
});

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
      applicationMap,
      '2026-07-16T12:02:00.000Z',
    );
    const second = await buildEvidencePack(
      'projectflow-baseline-study',
      events,
      applicationMap,
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
      ruleId: 'excess_path_length',
      taskId,
      affectedAttemptIds: [attemptId],
    });
    expect(first.frictionSignals[0]?.evidenceId).toMatch(/^EV-[a-f0-9]{12}$/);
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
      applicationMap,
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
        applicationMap,
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
      applicationMap,
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
      applicationMap,
      '2026-07-16T12:02:00.000Z',
    );

    expect(pack.parserVersion).toBe('1.3.0');
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
          ruleVersion: '1.3.0',
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

  it('groups recurring behavior by canonical context with stable bounded traces', async () => {
    const recurringHovers = Array.from({ length: 15 }, (_, index) => ({
      ...base(20 + index, '/study/projects/apollo/tasks'),
      eventId: id(200 + index),
      sessionId: `session-hover-${index % 5}`,
      participantId: `participant-hover-${index % 3}`,
      taskAttemptId: `attempt-hover-${index % 5}`,
      taskId,
      eventType: 'hover_ended' as const,
      targetId: 'task-create-open',
      properties: {
        pointerType: 'mouse' as const,
        durationMs: 900 + index,
        clicked: false,
        immediateExit: false,
        hoverToClickMs: null,
      },
    })) satisfies StoredTelemetryEvent[];
    const recurringDrags = Array.from({ length: 2 }, (_, index) => ({
      ...base(40 + index, '/study/projects/apollo/tasks'),
      eventId: id(240 + index),
      sessionId: `session-drag-${index}`,
      participantId: `participant-drag-${index}`,
      taskAttemptId: `attempt-drag-${index}`,
      taskId,
      eventType: 'drag_attempted' as const,
      targetId: 'task-card-apl-241',
      properties: {
        pointerType: 'mouse' as const,
        draggable: false,
        distancePx: 80 + index,
      },
    })) satisfies StoredTelemetryEvent[];
    const distinctHoverContexts: StoredTelemetryEvent[] = [
      {
        ...recurringHovers[0]!,
        eventId: id(250),
        sequence: 35,
        route: '/study/dashboard',
      },
      {
        ...recurringHovers[0]!,
        eventId: id(251),
        sequence: 36,
        targetId: 'task-search-open',
      },
      {
        ...recurringHovers[0]!,
        eventId: id(252),
        sequence: 37,
        route: '/study/reports',
      },
    ];
    const studyEvents = [
      ...recurringHovers,
      ...recurringDrags,
      ...distinctHoverContexts,
    ];
    const first = await buildEvidencePack(
      'projectflow-baseline-study',
      studyEvents,
      applicationMap,
      '2026-07-16T12:02:00.000Z',
    );
    const reordered = await buildEvidencePack(
      'projectflow-baseline-study',
      [...studyEvents].reverse(),
      applicationMap,
      '2026-07-16T12:02:00.000Z',
    );
    const hover = first.frictionSignals.find((signal) =>
      signal.supportingEventIds.includes(id(200)),
    );
    const reorderedHover = reordered.frictionSignals.find((signal) =>
      signal.supportingEventIds.includes(id(200)),
    );

    expect(
      first.frictionSignals.filter(
        (signal) => signal.ruleId === 'hover_hesitation',
      ),
    ).toHaveLength(4);
    expect(hover).toMatchObject({
      ruleId: 'hover_hesitation',
      support: { events: 15, attempts: 5, sessions: 5, participants: 3 },
    });
    expect(hover?.supportingEventIds).toHaveLength(15);
    expect(hover?.trace).toHaveLength(12);
    expect(reorderedHover?.evidenceId).toBe(hover?.evidenceId);
    expect(reorderedHover?.trace).toEqual(hover?.trace);
    expect(
      first.frictionSignals.find(
        (signal) => signal.ruleId === 'drag_expectation',
      )?.support,
    ).toEqual({ events: 2, attempts: 2, sessions: 2, participants: 2 });

    const withUnrelatedSignal = await buildEvidencePack(
      'projectflow-baseline-study',
      [
        ...studyEvents,
        {
          ...base(10, '/study/dashboard'),
          eventId: id(260),
          eventType: 'viewport_zoom_changed',
          properties: { fromScale: 1, toScale: 1.25 },
        },
      ],
      applicationMap,
      '2026-07-16T12:02:00.000Z',
    );
    expect(
      withUnrelatedSignal.frictionSignals.find((signal) =>
        signal.supportingEventIds.includes(id(200)),
      )?.evidenceId,
    ).toBe(hover?.evidenceId);
  });

  it('gates substantial quality on independent coverage dimensions', async () => {
    const oneParticipantEvents: StoredTelemetryEvent[] = [
      ...Array.from({ length: 100 }, (_, index) => ({
        ...coverageBase(500, index, 0, 0),
        eventType: 'page_view' as const,
      })),
      {
        ...coverageBase(500, 100, 0, 0),
        eventType: 'task_started',
        taskAttemptId: 'attempt-coverage-one',
        taskId: 'find-assigned-task',
      },
      {
        ...coverageBase(500, 101, 0, 0),
        eventType: 'task_completed',
        taskAttemptId: 'attempt-coverage-one',
        taskId: 'find-assigned-task',
        durationMs: 1_000,
        outcome: 'success',
      },
    ];
    const oneParticipant = await buildEvidencePack(
      'projectflow-baseline-study',
      oneParticipantEvents,
      applicationMap,
      '2026-07-16T12:05:00.000Z',
    );
    expect(oneParticipant.quality).toMatchObject({
      strength: 'directional',
      dimensions: {
        volume: { score: 100 },
        diversity: { score: 33 },
        completion: { score: 33 },
      },
    });
    expect(oneParticipant.quality.limitations).toEqual(
      expect.arrayContaining([
        'Fewer than three independent sessions were observed.',
        'Fewer than three anonymous participants were observed.',
        'Fewer than three terminal task attempts were observed.',
      ]),
    );

    const diverseButSparseEvents: StoredTelemetryEvent[] = Array.from(
      { length: 6 },
      (_, index) => ({
        ...coverageBase(700, index, index, index),
        eventType: 'page_view' as const,
      }),
    );
    const diverseButSparse = await buildEvidencePack(
      'projectflow-baseline-study',
      diverseButSparseEvents,
      applicationMap,
      '2026-07-16T12:05:00.000Z',
    );
    expect(diverseButSparse.quality).toMatchObject({
      strength: 'directional',
      dimensions: {
        volume: { score: 12 },
        diversity: { score: 100 },
        completion: { score: 0 },
      },
    });

    const fullyCoveredEvents: StoredTelemetryEvent[] = [
      ...Array.from({ length: 44 }, (_, index) => ({
        ...coverageBase(800, index, index % 3, index % 3),
        eventType: 'page_view' as const,
      })),
      ...Array.from({ length: 3 }, (_, attemptIndex) => [
        {
          ...coverageBase(
            800,
            44 + attemptIndex * 2,
            attemptIndex,
            attemptIndex,
          ),
          eventType: 'task_started' as const,
          taskAttemptId: `attempt-coverage-${attemptIndex}`,
          taskId: 'find-assigned-task',
        },
        {
          ...coverageBase(
            800,
            45 + attemptIndex * 2,
            attemptIndex,
            attemptIndex,
          ),
          eventType: 'task_completed' as const,
          taskAttemptId: `attempt-coverage-${attemptIndex}`,
          taskId: 'find-assigned-task',
          durationMs: 1_000,
          outcome: 'success' as const,
        },
      ]).flat(),
    ];
    const fullyCovered = await buildEvidencePack(
      'projectflow-baseline-study',
      fullyCoveredEvents,
      applicationMap,
      '2026-07-16T12:05:00.000Z',
    );
    expect(fullyCovered.quality).toMatchObject({
      strength: 'substantial',
      dimensions: {
        volume: { score: 100 },
        diversity: { score: 100 },
        completion: { score: 100 },
      },
    });
  });
});

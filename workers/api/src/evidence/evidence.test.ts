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
});

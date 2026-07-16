// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudyTelemetryEventSchema } from '@darwin/shared';

import { createTelemetryClient } from './telemetry-client';

describe('DarwinTelemetryClient', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('captures semantic controls and unambiguous task attempts', () => {
    const captured: unknown[] = [];
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-test',
      initialRoute: '/study',
      onEvent: (event) => captured.push(event),
    });
    client.init();

    const button = document.createElement('button');
    button.dataset.darwinId = 'project-open';
    button.textContent = 'Private project title';
    document.body.append(button);

    const attemptId = client.taskStarted('find-assigned-task');
    button.click();
    client.trackRouteChanged('/projects/apollo/tasks');
    client.trackSearch('task-search', 14, 1);
    client.taskCompleted('success');

    const parsed = captured.map((event) =>
      StudyTelemetryEventSchema.parse(event),
    );
    const click = parsed.find((event) => event.eventType === 'element_clicked');
    const completion = parsed.find(
      (event) => event.eventType === 'task_completed',
    );

    expect(click).toMatchObject({
      targetId: 'project-open',
      taskAttemptId: attemptId,
      taskId: 'find-assigned-task',
    });
    expect(completion).toMatchObject({
      taskAttemptId: attemptId,
      outcome: 'success',
    });
    expect(JSON.stringify(parsed)).not.toContain('Private project title');

    client.destroy();
  });

  it('keeps failed deliveries and clears a successfully received batch', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: 2, rejected: 0 }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-test',
      endpoint: '/api/telemetry/events',
      initialRoute: '/study',
      batchSize: 20,
      fetcher,
    });
    client.init();

    await expect(client.flush()).resolves.toEqual({
      status: 'delivered',
      accepted: 2,
      rejected: 0,
    });
    expect(client.snapshot()).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledOnce();

    const request = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { events: unknown[] };
    expect(body.events).toHaveLength(2);

    client.destroy();
  });
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  StudyTelemetryEventSchema,
  type StudyTelemetryEvent,
} from '@darwin/shared';

import { createTelemetryClient } from './telemetry-client';

describe('DarwinTelemetryClient', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('derives rich pointer evidence without capturing visible content', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    const captured: StudyTelemetryEvent[] = [];
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-rich',
      initialRoute: '/study',
      onEvent: (event) => captured.push(event),
    });
    client.init();

    const surface = document.createElement('section');
    surface.dataset.darwinId = 'metric-open-tasks';
    surface.textContent = 'Confidential open task count';
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 300,
      bottom: 300,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });
    document.body.append(surface);

    surface.dispatchEvent(
      pointerEvent('pointerover', { clientX: 120, clientY: 220 }),
    );
    vi.advanceTimersByTime(850);
    surface.dispatchEvent(
      pointerEvent('click', { clientX: 250, clientY: 250, detail: 1 }),
    );
    surface.dispatchEvent(
      pointerEvent('pointerout', {
        clientX: 250,
        clientY: 250,
        relatedTarget: document.body,
      }),
    );
    surface.dispatchEvent(pointerEvent('click', { detail: 1 }));
    surface.dispatchEvent(pointerEvent('click', { detail: 1 }));
    surface.dispatchEvent(pointerEvent('click', { detail: 2 }));
    surface.dispatchEvent(
      pointerEvent('pointerdown', { clientX: 10, clientY: 10 }),
    );
    surface.dispatchEvent(
      pointerEvent('pointermove', { clientX: 35, clientY: 10 }),
    );

    expect(captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'hover_started' }),
        expect.objectContaining({
          eventType: 'hover_ended',
          properties: expect.objectContaining({
            durationMs: 850,
            clicked: true,
            hoverToClickMs: 850,
          }),
        }),
        expect.objectContaining({
          eventType: 'element_clicked',
          properties: expect.objectContaining({
            interactive: false,
            xRatio: 0.75,
            yRatio: 0.5,
          }),
        }),
        expect.objectContaining({
          eventType: 'interaction_signal',
          properties: expect.objectContaining({ signal: 'false_affordance' }),
        }),
        expect.objectContaining({
          eventType: 'interaction_signal',
          properties: expect.objectContaining({ signal: 'rage_click' }),
        }),
        expect.objectContaining({
          eventType: 'interaction_signal',
          properties: expect.objectContaining({
            signal: 'unexpected_double_click',
          }),
        }),
        expect.objectContaining({
          eventType: 'drag_attempted',
          properties: expect.objectContaining({
            draggable: false,
            distancePx: 25,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(captured)).not.toContain('Confidential');

    client.destroy();
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
      duplicates: 0,
    });
    expect(client.snapshot()).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledOnce();

    const request = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { events: unknown[] };
    expect(body.events).toHaveLength(2);

    client.destroy();
  });
});

const pointerEvent = (type: string, init: MouseEventInit = {}) => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  return event;
};

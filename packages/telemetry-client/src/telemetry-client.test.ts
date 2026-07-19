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
    client.trackBrowserNavigation(
      'back',
      '/projects/apollo/tasks',
      '/projects/apollo',
    );
    client.trackSearch('task-search', 14, 1);
    client.taskCompleted('success');

    const parsed = captured.map((event) =>
      StudyTelemetryEventSchema.parse(event),
    );
    const click = parsed.find((event) => event.eventType === 'element_clicked');
    const completion = parsed.find(
      (event) => event.eventType === 'task_completed',
    );
    const browserBack = parsed.find(
      (event) => event.eventType === 'browser_navigation',
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
    expect(browserBack).toMatchObject({
      taskAttemptId: attemptId,
      properties: {
        direction: 'back',
        toRoute: '/projects/apollo',
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('Private project title');

    client.destroy();
  });

  it('captures relative browser zoom increases', () => {
    const originalPixelRatio = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    });
    const captured: StudyTelemetryEvent[] = [];
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-zoom',
      initialRoute: '/study/dashboard',
      onEvent: (event) => captured.push(event),
    });
    client.init();

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1.25,
    });
    window.dispatchEvent(new Event('resize'));

    expect(captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'viewport_zoom_changed',
          properties: { fromScale: 1, toScale: 1.25 },
        }),
      ]),
    );

    client.destroy();
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: originalPixelRatio,
    });
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

  it('retains page-exit events because Beacon cannot acknowledge ingestion', async () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: beacon,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 500 }));
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-beacon',
      endpoint: '/api/telemetry/events',
      initialRoute: '/study',
      fetcher,
    });
    client.init();

    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(beacon).not.toHaveBeenCalled();
    expect(client.snapshot().length).toBeGreaterThanOrEqual(3);
    client.destroy();
  });

  it('honors Retry-After and recovers without losing the outbox', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 429,
          headers: { 'Retry-After': '0.05' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { accepted: 2, rejected: 0, duplicates: 0 },
          { status: 202 },
        ),
      );
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-retry',
      endpoint: '/api/telemetry/events',
      initialRoute: '/study',
      flushIntervalMs: 60_000,
      fetcher,
    });
    client.init();

    await expect(client.flush()).rejects.toThrow('429');
    expect(client.snapshot()).toHaveLength(2);
    expect(client.health()).toMatchObject({ consecutiveFailures: 1 });
    await vi.advanceTimersByTimeAsync(100);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.snapshot()).toHaveLength(0);
    expect(client.health()).toMatchObject({ consecutiveFailures: 0 });
    client.destroy();
  });

  it('falls back to memory on storage failure and reports overflow drops', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    const health = vi.fn();
    const client = createTelemetryClient({
      appVersion: '1.0.0',
      studyId: 'projectflow-baseline-study',
      participantId: 'participant-storage',
      initialRoute: '/study',
      onHealth: health,
    });

    expect(() => client.init()).not.toThrow();
    for (let index = 0; index < 510; index += 1) {
      client.trackPageView(`/study/projects/${index}`);
    }

    expect(setItem).toHaveBeenCalled();
    expect(client.health()).toMatchObject({
      queued: 500,
      dropped: 12,
      storageAvailable: false,
    });
    expect(health).toHaveBeenCalled();
    client.destroy();
  });
});

const pointerEvent = (type: string, init: MouseEventInit = {}) => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  return event;
};

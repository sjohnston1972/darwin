import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../api';
import { useLiveTelemetry } from './useLiveTelemetry';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));

const mockedApiFetch = vi.mocked(apiFetch);
const eventsPayload = {
  studyId: 'projectflow-baseline-study',
  events: [],
  cursor: '2026-07-19T08:00:00.000Z',
  count: 0,
  sessionCounts: {},
  participantCount: 0,
  behaviorSignalCount: 0,
};

const responseFor = (url: string) => {
  if (url.includes('/events?')) return Response.json(eventsPayload);
  if (url.includes('/evidence/latest'))
    return new Response(null, { status: 204 });
  if (url.endsWith('/api/genome')) {
    return Response.json({
      evolutionCycle: {
        studyId: 'projectflow-baseline-study',
        startedAt: null,
        genomeEvolutionCount: 0,
      },
      executions: [],
    });
  }
  if (url.endsWith('/api/observations/archives')) {
    return Response.json({ archives: [] });
  }
  return new Response(null, { status: 204 });
};

describe('useLiveTelemetry hydration and polling', () => {
  beforeEach(() => {
    mockedApiFetch.mockImplementation(async (input) =>
      responseFor(String(input)),
    );
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the same complete hydration on mount and manual refresh', async () => {
    const { result } = renderHook(() => useLiveTelemetry(false));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(mockedApiFetch).toHaveBeenCalledTimes(4);

    await act(async () => result.current.refresh());

    expect(mockedApiFetch).toHaveBeenCalledTimes(8);
    expect(result.current.subsystemErrors).toEqual({});
    expect(result.current.lastUpdatedAt).not.toBeNull();
  });

  it('does not poll on a background route or while the document is hidden', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ visible }) => useLiveTelemetry(visible),
      { initialProps: { visible: false } },
    );
    await act(async () => Promise.resolve());
    const callsAfterHydration = mockedApiFetch.mock.calls.length;

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mockedApiFetch).toHaveBeenCalledTimes(callsAfterHydration);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    rerender({ visible: true });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mockedApiFetch).toHaveBeenCalledTimes(callsAfterHydration);
    expect(result.current.stale).toBe(false);
  });

  it('backs off after a polling failure and recovers on an empty delta', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let eventRequests = 0;
    mockedApiFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/events?')) {
        eventRequests += 1;
        if (eventRequests === 2) return new Response(null, { status: 503 });
      }
      return responseFor(url);
    });
    const { result } = renderHook(() => useLiveTelemetry(true));
    await act(async () => Promise.resolve());

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.stale).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    expect(result.current.stale).toBe(false);
    expect(eventRequests).toBe(3);
  });
});

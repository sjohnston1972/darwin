import {
  StudyEventsResponseSchema,
  type StoredTelemetryEvent,
} from '@darwin/shared';
import { useEffect, useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';
const studyId = 'projectflow-baseline-study';

export interface LiveTelemetryState {
  count: number;
  events: StoredTelemetryEvent[];
  status: 'loading' | 'live' | 'offline';
}

export function useLiveTelemetry(): LiveTelemetryState {
  const [events, setEvents] = useState<StoredTelemetryEvent[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<LiveTelemetryState['status']>('loading');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/studies/${studyId}/events?limit=50`,
        );
        if (!response.ok) throw new Error('Live telemetry request failed.');
        const result = StudyEventsResponseSchema.parse(await response.json());
        if (active) {
          setEvents(result.events);
          setCount(result.count);
          setStatus('live');
        }
      } catch {
        if (active) setStatus('offline');
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return { count, events, status };
}

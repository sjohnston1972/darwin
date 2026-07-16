import {
  StudyTelemetryEventSchema,
  TelemetryBatchSchema,
  TelemetryReceiptSchema,
  type StudyTelemetryEvent,
  type TelemetryReceipt,
  type ViewportClass,
} from '@darwin/shared';

type ClientSource = 'real_user' | 'automated';
type TerminalOutcome = 'success' | 'failed' | 'abandoned';

export interface TelemetryClientConfig {
  appVersion: string;
  studyId: string;
  participantId: string;
  endpoint?: string;
  source?: ClientSource;
  sessionId?: string;
  initialRoute?: string;
  flushIntervalMs?: number;
  batchSize?: number;
  onEvent?: (event: StudyTelemetryEvent) => void;
  fetcher?: typeof fetch;
}

export type TelemetryFlushResult =
  | ({ status: 'delivered' } & TelemetryReceipt)
  | { status: 'empty'; accepted: 0; rejected: 0 }
  | { status: 'offline'; accepted: 0; rejected: 0 };

interface ActiveAttempt {
  id: string;
  taskId: string;
  startedAt: number;
}

const storagePrefix = 'darwin:telemetry-outbox';

const createId = (prefix?: string) => {
  const value =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-000000000001';
  return prefix ? `${prefix}-${value}` : value;
};

const getViewportClass = (): ViewportClass => {
  if (window.innerWidth < 640) return 'mobile';
  if (window.innerWidth < 1024) return 'tablet';
  return 'desktop';
};

const normalizeRoute = (route: string) => {
  const path = route.trim();
  return path.startsWith('/') ? path : `/${path}`;
};

export class DarwinTelemetryClient {
  private readonly config: TelemetryClientConfig & {
    source: ClientSource;
    sessionId: string;
    flushIntervalMs: number;
    batchSize: number;
  };
  private readonly outboxKey: string;
  private readonly fetcher: typeof fetch;
  private outbox: StudyTelemetryEvent[];
  private currentRoute: string;
  private sequence = 0;
  private activeAttempt: ActiveAttempt | null = null;
  private flushTimer: number | null = null;
  private startedAt = Date.now();
  private initialized = false;

  constructor(config: TelemetryClientConfig) {
    this.config = {
      ...config,
      source: config.source ?? 'real_user',
      sessionId: config.sessionId ?? createId('session'),
      flushIntervalMs: config.flushIntervalMs ?? 5_000,
      batchSize: Math.min(50, Math.max(1, config.batchSize ?? 20)),
    };
    this.fetcher = config.fetcher ?? fetch.bind(globalThis);
    this.currentRoute = normalizeRoute(
      config.initialRoute ?? window.location.pathname,
    );
    this.outboxKey = `${storagePrefix}:${config.studyId}:${config.participantId}`;
    this.outbox = this.readOutbox();
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.startedAt = Date.now();
    document.addEventListener('click', this.captureClick);
    document.addEventListener('visibilitychange', this.captureVisibility);
    window.addEventListener('pagehide', this.capturePageHide);

    this.enqueue({ eventType: 'session_started' });
    this.enqueue({ eventType: 'page_view' });

    if (this.config.endpoint) {
      this.flushTimer = window.setInterval(() => {
        void this.flush();
      }, this.config.flushIntervalMs);
    }
  }

  destroy() {
    if (!this.initialized) return;
    this.endSession();
    document.removeEventListener('click', this.captureClick);
    document.removeEventListener('visibilitychange', this.captureVisibility);
    window.removeEventListener('pagehide', this.capturePageHide);
    if (this.flushTimer !== null) window.clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.initialized = false;
  }

  trackPageView(route = this.currentRoute) {
    this.currentRoute = normalizeRoute(route);
    this.enqueue({ eventType: 'page_view' });
  }

  trackRouteChanged(route: string) {
    const nextRoute = normalizeRoute(route);
    const fromRoute = this.currentRoute;
    if (nextRoute === fromRoute) return;
    this.currentRoute = nextRoute;
    this.enqueue({
      eventType: 'route_changed',
      properties: { fromRoute },
    });
    this.enqueue({ eventType: 'page_view' });
  }

  trackValidationError(targetId: string, fieldId: string, errorCode: string) {
    this.enqueue({
      eventType: 'validation_error',
      targetId,
      ...this.attemptFields(),
      properties: { fieldId, errorCode },
    });
  }

  trackSearch(targetId: string, queryLength: number, resultCount: number) {
    this.enqueue({
      eventType: 'search_performed',
      targetId,
      ...this.attemptFields(),
      properties: { queryLength, resultCount },
    });
  }

  taskStarted(taskId: string) {
    if (this.activeAttempt) this.taskCompleted('abandoned');
    const attempt: ActiveAttempt = {
      id: createId('attempt'),
      taskId,
      startedAt: Date.now(),
    };
    this.activeAttempt = attempt;
    this.enqueue({
      eventType: 'task_started',
      taskAttemptId: attempt.id,
      taskId,
    });
    return attempt.id;
  }

  taskCompleted(outcome: TerminalOutcome) {
    if (!this.activeAttempt) return null;
    const attempt = this.activeAttempt;
    const durationMs = Math.max(0, Date.now() - attempt.startedAt);
    this.activeAttempt = null;

    if (outcome === 'success') {
      this.enqueue({
        eventType: 'task_completed',
        taskAttemptId: attempt.id,
        taskId: attempt.taskId,
        durationMs,
        outcome,
      });
    } else {
      this.enqueue({
        eventType: 'task_failed',
        taskAttemptId: attempt.id,
        taskId: attempt.taskId,
        durationMs,
        outcome,
      });
    }

    return attempt.id;
  }

  feedbackSubmitted(feedbackLength: number) {
    this.enqueue({
      eventType: 'feedback_submitted',
      ...this.attemptFields(),
      properties: { length: Math.min(500, Math.max(0, feedbackLength)) },
    });
  }

  snapshot() {
    return [...this.outbox];
  }

  async flush(): Promise<TelemetryFlushResult> {
    if (this.outbox.length === 0) {
      return { status: 'empty', accepted: 0, rejected: 0 };
    }
    if (!this.config.endpoint) {
      return { status: 'offline', accepted: 0, rejected: 0 };
    }

    const events = this.outbox.slice(0, this.config.batchSize);
    const batch = TelemetryBatchSchema.parse({ events });
    const response = await this.fetcher(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      keepalive: true,
    });
    if (!response.ok)
      throw new Error(`Telemetry delivery failed: ${response.status}`);

    const receipt = TelemetryReceiptSchema.parse(await response.json());
    this.outbox.splice(0, events.length);
    this.persistOutbox();
    return { status: 'delivered', ...receipt };
  }

  private readonly captureClick = (event: MouseEvent) => {
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    const target = origin.closest<HTMLElement>('[data-darwin-id]');
    const targetId = target?.dataset.darwinId;
    if (!targetId) return;

    this.enqueue({
      eventType: 'element_clicked',
      targetId,
      ...this.attemptFields(),
    });
  };

  private readonly captureVisibility = () => {
    if (document.visibilityState === 'hidden') this.flushWithBeacon();
  };

  private readonly capturePageHide = () => {
    this.endSession();
    this.flushWithBeacon();
  };

  private endSession() {
    if (this.activeAttempt) this.taskCompleted('abandoned');
    this.enqueue({
      eventType: 'session_ended',
      durationMs: Math.max(0, Date.now() - this.startedAt),
    });
  }

  private flushWithBeacon() {
    if (!this.config.endpoint || !navigator.sendBeacon || !this.outbox.length) {
      return;
    }
    const events = this.outbox.slice(0, this.config.batchSize);
    const body = JSON.stringify(TelemetryBatchSchema.parse({ events }));
    if (navigator.sendBeacon(this.config.endpoint, body)) {
      this.outbox.splice(0, events.length);
      this.persistOutbox();
    }
  }

  private attemptFields() {
    return this.activeAttempt
      ? {
          taskAttemptId: this.activeAttempt.id,
          taskId: this.activeAttempt.taskId,
        }
      : {};
  }

  private enqueue(
    event:
      | { eventType: 'session_started' | 'page_view' }
      | { eventType: 'session_ended'; durationMs: number }
      | {
          eventType: 'element_clicked';
          targetId: string;
          taskAttemptId?: string;
          taskId?: string;
        }
      | { eventType: 'route_changed'; properties: { fromRoute: string } }
      | {
          eventType: 'validation_error';
          targetId: string;
          taskAttemptId?: string;
          taskId?: string;
          properties: { fieldId: string; errorCode: string };
        }
      | {
          eventType: 'search_performed';
          targetId: string;
          taskAttemptId?: string;
          taskId?: string;
          properties: { queryLength: number; resultCount: number };
        }
      | {
          eventType: 'task_started';
          taskAttemptId: string;
          taskId: string;
        }
      | {
          eventType: 'task_completed';
          taskAttemptId: string;
          taskId: string;
          durationMs: number;
          outcome: 'success';
        }
      | {
          eventType: 'task_failed';
          taskAttemptId: string;
          taskId: string;
          durationMs: number;
          outcome: 'failed' | 'abandoned';
        }
      | {
          eventType: 'feedback_submitted';
          taskAttemptId?: string;
          taskId?: string;
          properties: { length: number };
        },
  ) {
    const candidate = {
      schemaVersion: 1,
      eventId: createId(),
      sessionId: this.config.sessionId,
      participantId: this.config.participantId,
      studyId: this.config.studyId,
      appVersion: this.config.appVersion,
      source: this.config.source,
      occurredAt: new Date().toISOString(),
      sequence: this.sequence++,
      route: this.currentRoute,
      viewport: getViewportClass(),
      ...event,
    };
    const parsed = StudyTelemetryEventSchema.parse(candidate);
    this.outbox.push(parsed);
    if (this.outbox.length > 500)
      this.outbox.splice(0, this.outbox.length - 500);
    this.persistOutbox();
    this.config.onEvent?.(parsed);
    if (this.config.endpoint && this.outbox.length >= this.config.batchSize) {
      void this.flush().catch(() => undefined);
    }
  }

  private readOutbox() {
    try {
      const stored = localStorage.getItem(this.outboxKey);
      if (!stored) return [];
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value)) return [];
      return value.flatMap((item) => {
        const parsed = StudyTelemetryEventSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
    } catch {
      return [];
    }
  }

  private persistOutbox() {
    localStorage.setItem(this.outboxKey, JSON.stringify(this.outbox));
  }
}

export const createTelemetryClient = (config: TelemetryClientConfig) =>
  new DarwinTelemetryClient(config);

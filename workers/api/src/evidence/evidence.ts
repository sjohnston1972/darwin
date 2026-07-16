import {
  EvidencePackSchema,
  type EvidenceClass,
  type EvidencePack,
  type EvidenceSignal,
  type EvidenceTraceEvent,
  type FrictionRule,
  type StoredTelemetryEvent,
  type TaskAttempt,
} from '@darwin/shared';

const parserVersion = '1.0.0' as const;
const ruleVersion = '1.0.0' as const;
const optimalInteractions: Record<string, number> = {
  'create-project': 3,
  'create-assigned-task': 5,
  'find-assigned-task': 3,
};
const interactionTypes = new Set([
  'element_clicked',
  'route_changed',
  'validation_error',
  'search_performed',
]);

interface SignalCandidate {
  ruleId: FrictionRule;
  severity: EvidenceSignal['severity'];
  taskId?: string;
  summary: string;
  attempts: string[];
  events: StoredTelemetryEvent[];
}

const terminalTypes = new Set(['task_completed', 'task_failed']);

export async function buildEvidencePack(
  studyId: string,
  storedEvents: StoredTelemetryEvent[],
  generatedAt = new Date().toISOString(),
): Promise<EvidencePack> {
  const events = storedEvents
    .filter((event) => event.studyId === studyId)
    .sort((left, right) =>
      left.sessionId === right.sessionId
        ? left.sequence - right.sequence
        : left.receivedAt.localeCompare(right.receivedAt),
    );
  const taskAttempts = reconstructAttempts(events, generatedAt);
  const candidates = detectFriction(events, taskAttempts);
  const frictionSignals = candidates.map((candidate, index) =>
    signalFromCandidate(candidate, index),
  );
  const tasks = summarizeTasks(taskAttempts);
  const evidenceClass = evidenceClassFor(events);
  const appVersion = events.at(-1)?.appVersion ?? 'unknown';
  const payload = {
    parserVersion,
    evidenceClass,
    study: {
      studyId,
      appVersion,
      sourceEventCount: events.length,
      participants: new Set(events.map((event) => event.participantId)).size,
      sessions: new Set(events.map((event) => event.sessionId)).size,
      attempts: taskAttempts.length,
    },
    taskAttempts,
    tasks,
    frictionSignals,
    applicationMap: {
      routes: [...new Set(events.map((event) => event.route))].sort(),
      mutableAreas: ['navigation', 'search', 'task-discovery'],
      protectedAreas: [
        'telemetry-history',
        'authentication',
        'database-schema',
      ],
    },
  };
  const evidenceHash = await sha256(canonicalStringify(payload));
  return EvidencePackSchema.parse({
    evidenceId: `evidence-${evidenceHash.slice(0, 12)}`,
    evidenceHash,
    generatedAt,
    ...payload,
  });
}

export function reconstructAttempts(
  events: StoredTelemetryEvent[],
  generatedAt: string,
): TaskAttempt[] {
  const starts = events.filter((event) => event.eventType === 'task_started');
  return starts.map((start) => {
    const scoped = events.filter(
      (event) =>
        event.sessionId === start.sessionId &&
        event.sequence >= start.sequence &&
        ('taskAttemptId' in event
          ? event.taskAttemptId === start.taskAttemptId
          : true),
    );
    const terminal = scoped.find(
      (
        event,
      ): event is Extract<
        StoredTelemetryEvent,
        { eventType: 'task_completed' | 'task_failed' }
      > => terminalTypes.has(event.eventType),
    );
    const endSequence = terminal?.sequence ?? Number.POSITIVE_INFINITY;
    const attemptEvents = scoped.filter(
      (event) => event.sequence <= endSequence,
    );
    const elapsed = Date.parse(generatedAt) - Date.parse(start.occurredAt);
    const outcome = terminal
      ? terminal.eventType === 'task_completed'
        ? 'success'
        : terminal.outcome
      : elapsed >= 120_000 ||
          attemptEvents.some((event) => event.eventType === 'session_ended')
        ? 'abandoned'
        : 'open';
    const durationMs = terminal
      ? terminal.durationMs
      : outcome === 'abandoned'
        ? Math.max(0, elapsed)
        : null;
    const routePath = attemptEvents
      .filter(
        (event) =>
          event.eventType === 'page_view' ||
          event.eventType === 'route_changed',
      )
      .map((event) => event.route)
      .filter(
        (route, index, routes) => index === 0 || route !== routes[index - 1],
      );

    return {
      attemptId: start.taskAttemptId,
      taskId: start.taskId,
      participantId: start.participantId,
      sessionId: start.sessionId,
      appVersion: start.appVersion,
      source: start.source,
      outcome,
      startedAt: start.occurredAt,
      endedAt: terminal?.occurredAt ?? null,
      durationMs,
      interactionCount: attemptEvents.filter((event) =>
        interactionTypes.has(event.eventType),
      ).length,
      routePath,
      eventIds: attemptEvents.map((event) => event.eventId),
    };
  });
}

function detectFriction(
  events: StoredTelemetryEvent[],
  attempts: TaskAttempt[],
): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];
  for (const attempt of attempts) {
    const attemptEvents = events.filter((event) =>
      attempt.eventIds.includes(event.eventId),
    );
    const optimum = optimalInteractions[attempt.taskId] ?? 4;
    if (attempt.interactionCount >= Math.ceil(optimum * 1.5)) {
      candidates.push({
        ruleId: 'excess_path_length',
        severity: attempt.interactionCount >= optimum * 2 ? 'high' : 'medium',
        taskId: attempt.taskId,
        summary: `${attempt.taskId} required ${attempt.interactionCount} interactions for a ${optimum}-interaction optimal path.`,
        attempts: [attempt.attemptId],
        events: attemptEvents,
      });
    }
    const loop = findNavigationLoop(attempt.routePath);
    if (loop) {
      candidates.push({
        ruleId: 'navigation_loop',
        severity: 'medium',
        taskId: attempt.taskId,
        summary: `${attempt.taskId} contained the navigation loop ${loop.join(' -> ')}.`,
        attempts: [attempt.attemptId],
        events: attemptEvents.filter((event) => loop.includes(event.route)),
      });
    }
    if (attempt.outcome === 'abandoned') {
      candidates.push({
        ruleId: 'task_abandonment',
        severity: 'high',
        taskId: attempt.taskId,
        summary: `${attempt.taskId} ended without a successful or failed terminal event.`,
        attempts: [attempt.attemptId],
        events: attemptEvents,
      });
    }
    const validationEvents = attemptEvents.filter(
      (event) => event.eventType === 'validation_error',
    );
    if (validationEvents.length >= 2) {
      candidates.push({
        ruleId: 'validation_friction',
        severity: 'medium',
        taskId: attempt.taskId,
        summary: `${attempt.taskId} produced ${validationEvents.length} validation errors in one attempt.`,
        attempts: [attempt.attemptId],
        events: validationEvents,
      });
    }
    const repeated = findRepeatedTarget(attemptEvents);
    if (repeated.length >= 3) {
      candidates.push({
        ruleId: 'repeated_target',
        severity: 'medium',
        taskId: attempt.taskId,
        summary: `${attempt.taskId} clicked ${targetOf(repeated[0]!)} ${repeated.length} times within two seconds.`,
        attempts: [attempt.attemptId],
        events: repeated,
      });
    }
  }

  for (const taskId of new Set(attempts.map((attempt) => attempt.taskId))) {
    const successful = attempts.filter(
      (attempt) => attempt.taskId === taskId && attempt.outcome === 'success',
    );
    if (!successful.length) continue;
    const searchAttempts = successful.filter((attempt) =>
      events.some(
        (event) =>
          attempt.eventIds.includes(event.eventId) &&
          event.eventType === 'search_performed',
      ),
    );
    if (searchAttempts.length / successful.length > 0.5) {
      const searchEvents = events.filter(
        (event) =>
          event.eventType === 'search_performed' &&
          searchAttempts.some((attempt) =>
            attempt.eventIds.includes(event.eventId),
          ),
      );
      candidates.push({
        ruleId: 'search_dependency',
        severity: 'medium',
        taskId,
        summary: `${searchAttempts.length} of ${successful.length} successful ${taskId} attempts depended on search.`,
        attempts: searchAttempts.map((attempt) => attempt.attemptId),
        events: searchEvents,
      });
    }
  }

  const order: FrictionRule[] = [
    'task_abandonment',
    'excess_path_length',
    'navigation_loop',
    'validation_friction',
    'repeated_target',
    'search_dependency',
  ];
  return candidates.sort(
    (left, right) =>
      order.indexOf(left.ruleId) - order.indexOf(right.ruleId) ||
      (left.taskId ?? '').localeCompare(right.taskId ?? ''),
  );
}

function signalFromCandidate(
  candidate: SignalCandidate,
  index: number,
): EvidenceSignal {
  const uniqueEvents = [
    ...new Map(
      candidate.events.map((event) => [event.eventId, event]),
    ).values(),
  ];
  return {
    evidenceId: `EV-${String(index + 1).padStart(3, '0')}`,
    ruleId: candidate.ruleId,
    ruleVersion,
    severity: candidate.severity,
    ...(candidate.taskId ? { taskId: candidate.taskId } : {}),
    summary: candidate.summary,
    affectedAttemptIds: candidate.attempts,
    supportingEventIds: uniqueEvents.map((event) => event.eventId),
    trace: uniqueEvents.slice(0, 12).map(traceEvent),
  };
}

function traceEvent(event: StoredTelemetryEvent): EvidenceTraceEvent {
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    eventType: event.eventType,
    route: event.route,
    ...('targetId' in event && event.targetId
      ? { targetId: event.targetId }
      : {}),
  };
}

function summarizeTasks(attempts: TaskAttempt[]) {
  return [...new Set(attempts.map((attempt) => attempt.taskId))]
    .sort()
    .map((taskId) => {
      const taskAttempts = attempts.filter(
        (attempt) => attempt.taskId === taskId,
      );
      const successful = taskAttempts.filter(
        (attempt) => attempt.outcome === 'success',
      );
      const paths = new Map<string, { path: string[]; count: number }>();
      for (const attempt of successful) {
        const key = attempt.routePath.join(' -> ');
        const current = paths.get(key) ?? { path: attempt.routePath, count: 0 };
        current.count += 1;
        paths.set(key, current);
      }
      return {
        taskId,
        attempts: taskAttempts.length,
        successes: successful.length,
        completionRate: successful.length / taskAttempts.length,
        medianDurationMs: median(
          successful.flatMap((attempt) =>
            attempt.durationMs === null ? [] : [attempt.durationMs],
          ),
        ),
        medianInteractions: median(
          successful.map((attempt) => attempt.interactionCount),
        ),
        optimalInteractions: optimalInteractions[taskId] ?? 4,
        topPaths: [...paths.values()]
          .sort((left, right) => right.count - left.count)
          .slice(0, 3),
      };
    });
}

function findNavigationLoop(routes: string[]) {
  for (let index = 0; index <= routes.length - 3; index += 1) {
    if (
      routes[index] === routes[index + 2] &&
      routes[index] !== routes[index + 1]
    ) {
      return routes.slice(index, index + 3);
    }
  }
  return null;
}

function findRepeatedTarget(events: StoredTelemetryEvent[]) {
  const clicks = events.filter(
    (event) => event.eventType === 'element_clicked',
  );
  for (let index = 0; index < clicks.length; index += 1) {
    const start = clicks[index]!;
    const matches = clicks.filter(
      (event) =>
        targetOf(event) === targetOf(start) &&
        Date.parse(event.occurredAt) - Date.parse(start.occurredAt) >= 0 &&
        Date.parse(event.occurredAt) - Date.parse(start.occurredAt) <= 2_000,
    );
    if (matches.length >= 3) return matches;
  }
  return [];
}

const targetOf = (event: StoredTelemetryEvent) =>
  'targetId' in event ? event.targetId : undefined;

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function evidenceClassFor(events: StoredTelemetryEvent[]): EvidenceClass {
  if (events.every((event) => event.source === 'automated')) return 'automated';
  if (events.every((event) => event.source === 'synthetic')) return 'synthetic';
  return 'measured';
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

import {
  EvidencePackSchema,
  type EvidenceApplicationMap,
  type EvidenceClass,
  type EvidencePack,
  type EvidenceSignal,
  type EvidenceTraceEvent,
  type FrictionRule,
  type StoredTelemetryEvent,
  type TaskAttempt,
} from '@darwin/shared';

const parserVersion = '1.3.0' as const;
const ruleVersion = '1.3.0' as const;
const declaredInteractionBudget: Record<string, number> = {
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
  canonicalGroupKey?: string;
}

const terminalTypes = new Set(['task_completed', 'task_failed']);

export async function buildEvidencePack(
  studyId: string,
  storedEvents: StoredTelemetryEvent[],
  applicationMap: EvidenceApplicationMap,
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
  const frictionSignals = await Promise.all(
    candidates.map((candidate) => signalFromCandidate(candidate)),
  );
  const tasks = summarizeTasks(taskAttempts);
  const evidenceClass = evidenceClassFor(events);
  const quality = assessEvidence(events, taskAttempts, generatedAt);
  const journeys = buildJourneys(events);
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
    quality,
    journeys,
    frictionSignals,
    applicationMap,
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
    const optimum = declaredInteractionBudget[attempt.taskId] ?? 4;
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

  for (const event of events) {
    const attemptId =
      'taskAttemptId' in event && event.taskAttemptId
        ? [event.taskAttemptId]
        : [];
    const taskId = 'taskId' in event && event.taskId ? event.taskId : undefined;
    if (event.eventType === 'interaction_signal') {
      const target = event.targetId ?? 'the current surface';
      const definitions: Record<
        typeof event.properties.signal,
        {
          ruleId: FrictionRule;
          severity: EvidenceSignal['severity'];
          summary: string;
        }
      > = {
        rage_click: {
          ruleId: 'rage_click',
          severity: 'high',
          summary: `${target} received ${event.properties.count} rapid clicks within ${event.properties.windowMs}ms, indicating poor response or user frustration.`,
        },
        false_affordance: {
          ruleId: 'false_affordance',
          severity: 'medium',
          summary: `${target} was clicked despite not being interactive, indicating a possible false affordance.`,
        },
        unexpected_double_click: {
          ruleId: 'false_affordance',
          severity: 'low',
          summary: `${target} received a double-click although it exposes a single-click interaction model.`,
        },
        element_indecision: {
          ruleId: 'cursor_indecision',
          severity: 'medium',
          summary: `The pointer moved repeatedly between ${event.properties.relatedTargetIds?.join(' and ') ?? target} within ${event.properties.windowMs}ms.`,
        },
        cursor_thrashing: {
          ruleId: 'cursor_indecision',
          severity: 'medium',
          summary: `${event.properties.count} rapid pointer direction changes occurred within ${event.properties.windowMs}ms near ${target}.`,
        },
      };
      const definition = definitions[event.properties.signal];
      candidates.push({
        ...definition,
        ...(taskId ? { taskId } : {}),
        attempts: attemptId,
        events: [event],
      });
    }
    if (
      event.eventType === 'hover_ended' &&
      !event.properties.clicked &&
      event.properties.durationMs >= 700
    ) {
      candidates.push({
        ruleId: 'hover_hesitation',
        severity: event.properties.durationMs >= 2_000 ? 'medium' : 'low',
        ...(taskId ? { taskId } : {}),
        summary: `${event.targetId} was considered for ${event.properties.durationMs}ms and left without a click.`,
        attempts: attemptId,
        events: [event],
      });
    }
    if (event.eventType === 'drag_attempted' && !event.properties.draggable) {
      candidates.push({
        ruleId: 'drag_expectation',
        severity: 'medium',
        ...(taskId ? { taskId } : {}),
        summary: `${event.targetId ?? 'A surface'} was dragged ${event.properties.distancePx}px despite not supporting drag-and-drop.`,
        attempts: attemptId,
        events: [event],
      });
    }
    if (event.eventType === 'touch_cancelled') {
      candidates.push({
        ruleId: 'touch_conflict',
        severity: 'medium',
        ...(taskId ? { taskId } : {}),
        summary: `A touch interaction on ${event.targetId ?? 'the current surface'} was cancelled after ${event.properties.durationMs}ms, indicating a gesture or scroll conflict.`,
        attempts: attemptId,
        events: [event],
      });
    }
    if (
      event.eventType === 'browser_navigation' &&
      event.properties.direction === 'back'
    ) {
      candidates.push({
        ruleId: 'browser_back_dependency',
        severity: 'medium',
        ...(taskId ? { taskId } : {}),
        summary: `Browser Back was used to move from ${event.properties.fromRoute} to ${event.properties.toRoute}, indicating demand for clearer in-app return navigation.`,
        attempts: attemptId,
        events: [event],
      });
    }
    if (
      event.eventType === 'viewport_zoom_changed' &&
      event.properties.toScale > event.properties.fromScale
    ) {
      candidates.push({
        ruleId: 'zoom_readability',
        severity:
          event.properties.toScale - event.properties.fromScale >= 0.25
            ? 'medium'
            : 'low',
        ...(taskId ? { taskId } : {}),
        summary: `Browser zoom increased from ${Math.round(event.properties.fromScale * 100)}% to ${Math.round(event.properties.toScale * 100)}% on ${event.route}, indicating possible text readability pressure.`,
        attempts: attemptId,
        events: [event],
      });
    }
  }

  const order: FrictionRule[] = [
    'task_abandonment',
    'rage_click',
    'excess_path_length',
    'navigation_loop',
    'browser_back_dependency',
    'validation_friction',
    'repeated_target',
    'false_affordance',
    'hover_hesitation',
    'cursor_indecision',
    'drag_expectation',
    'touch_conflict',
    'zoom_readability',
    'search_dependency',
  ];
  return compactBehaviorCandidates(candidates).sort(
    (left, right) =>
      order.indexOf(left.ruleId) - order.indexOf(right.ruleId) ||
      (left.taskId ?? '').localeCompare(right.taskId ?? '') ||
      canonicalSignalKey(left).localeCompare(canonicalSignalKey(right)),
  );
}

const behaviorRules = new Set<FrictionRule>([
  'rage_click',
  'false_affordance',
  'hover_hesitation',
  'cursor_indecision',
  'drag_expectation',
  'touch_conflict',
  'browser_back_dependency',
  'zoom_readability',
]);

function compactBehaviorCandidates(candidates: SignalCandidate[]) {
  const compacted: SignalCandidate[] = [];
  const grouped = new Map<string, SignalCandidate>();
  for (const candidate of candidates) {
    if (!behaviorRules.has(candidate.ruleId)) {
      compacted.push(candidate);
      continue;
    }
    const representative = candidate.events[0];
    const key = representative
      ? canonicalStringify({
          ruleId: candidate.ruleId,
          taskId: candidate.taskId ?? 'session',
          appVersion: representative.appVersion,
          route: representative.route,
          targetId: targetOf(representative) ?? null,
          viewport: representative.viewport,
          context: behaviorContext(representative),
        })
      : canonicalSignalKey(candidate);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...candidate, canonicalGroupKey: key });
      continue;
    }
    existing.events = [...existing.events, ...candidate.events];
    existing.attempts = [
      ...new Set([...existing.attempts, ...candidate.attempts]),
    ].sort();
    if (severityRank(candidate.severity) > severityRank(existing.severity)) {
      existing.severity = candidate.severity;
    }
    const count = new Set(existing.events.map((event) => event.eventId)).size;
    existing.summary = `${existing.summary.split(' Observed ')[0]} Observed ${count} times in this bounded evidence group.`;
  }
  return [...compacted, ...grouped.values()];
}

function behaviorContext(event: StoredTelemetryEvent) {
  switch (event.eventType) {
    case 'interaction_signal':
      return {
        signal: event.properties.signal,
        pointerType: event.properties.pointerType,
        relatedTargetIds: [...(event.properties.relatedTargetIds ?? [])].sort(),
      };
    case 'hover_ended':
    case 'drag_attempted':
    case 'touch_cancelled':
      return { pointerType: event.properties.pointerType };
    case 'browser_navigation':
      return {
        direction: event.properties.direction,
        fromRoute: event.properties.fromRoute,
        toRoute: event.properties.toRoute,
      };
    case 'viewport_zoom_changed':
      return { direction: 'increase' };
    default:
      return {};
  }
}

const severityRank = (severity: EvidenceSignal['severity']) =>
  ({ low: 0, medium: 1, high: 2 })[severity];

async function signalFromCandidate(
  candidate: SignalCandidate,
): Promise<EvidenceSignal> {
  const uniqueEvents = [
    ...new Map(
      candidate.events.map((event) => [event.eventId, event]),
    ).values(),
  ].sort(compareEvidenceEvents);
  const groupHash = await sha256(canonicalSignalKey(candidate));
  return {
    evidenceId: `EV-${groupHash.slice(0, 12)}`,
    ruleId: candidate.ruleId,
    ruleVersion,
    severity: candidate.severity,
    ...(candidate.taskId ? { taskId: candidate.taskId } : {}),
    summary: candidate.summary,
    affectedAttemptIds: [...new Set(candidate.attempts)].sort(),
    supportingEventIds: uniqueEvents.map((event) => event.eventId),
    trace: representativeEvents(uniqueEvents, 12).map(traceEvent),
    support: {
      events: uniqueEvents.length,
      attempts: new Set(candidate.attempts).size,
      sessions: new Set(uniqueEvents.map((event) => event.sessionId)).size,
      participants: new Set(uniqueEvents.map((event) => event.participantId))
        .size,
    },
  };
}

function canonicalSignalKey(candidate: SignalCandidate) {
  if (candidate.canonicalGroupKey) return candidate.canonicalGroupKey;
  return canonicalStringify({
    ruleId: candidate.ruleId,
    taskId: candidate.taskId ?? 'session',
    attempts: [...new Set(candidate.attempts)].sort(),
    appVersions: [
      ...new Set(candidate.events.map((event) => event.appVersion)),
    ].sort(),
    routes: [...new Set(candidate.events.map((event) => event.route))].sort(),
    targets: [
      ...new Set(candidate.events.map(targetOf).filter(Boolean)),
    ].sort(),
  });
}

function representativeEvents(events: StoredTelemetryEvent[], limit: number) {
  if (events.length <= limit) return events;
  const buckets = new Map<string, StoredTelemetryEvent[]>();
  for (const event of events) {
    const key = `${event.participantId}:${event.sessionId}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(event);
    buckets.set(key, bucket);
  }
  const orderedBuckets = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => bucket.sort(compareEvidenceEvents));
  const selected: StoredTelemetryEvent[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let found = false;
    for (const bucket of orderedBuckets) {
      const event = bucket[round];
      if (!event) continue;
      selected.push(event);
      found = true;
      if (selected.length === limit) break;
    }
    if (!found) break;
  }
  return selected.sort(compareEvidenceEvents);
}

function compareEvidenceEvents(
  left: StoredTelemetryEvent,
  right: StoredTelemetryEvent,
) {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.participantId.localeCompare(right.participantId) ||
    left.sessionId.localeCompare(right.sessionId) ||
    left.sequence - right.sequence ||
    left.eventId.localeCompare(right.eventId)
  );
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

function assessEvidence(
  events: StoredTelemetryEvent[],
  attempts: TaskAttempt[],
  generatedAt: string,
) {
  const minimumEvents = 50;
  const minimumSessions = 3;
  const minimumParticipants = 3;
  const minimumTerminalAttempts = 3;
  const maximumAgeDays = 7;
  const sessionCount = new Set(events.map((event) => event.sessionId)).size;
  const participantCount = new Set(events.map((event) => event.participantId))
    .size;
  const completedAttemptCount = attempts.filter(
    (attempt) => attempt.outcome === 'success',
  ).length;
  const terminalAttemptCount = attempts.filter(
    (attempt) => attempt.outcome === 'success' || attempt.outcome === 'failed',
  ).length;
  const volumeScore = coverageScore(events.length, minimumEvents);
  const diversityScore = Math.min(
    coverageScore(sessionCount, minimumSessions),
    coverageScore(participantCount, minimumParticipants),
  );
  const completionScore = coverageScore(
    terminalAttemptCount,
    minimumTerminalAttempts,
  );
  const latestEventAt = events.reduce(
    (latest, event) => (event.occurredAt > latest ? event.occurredAt : latest),
    events[0]!.occurredAt,
  );
  const evidenceAgeMs = Math.max(
    0,
    Date.parse(generatedAt) - Date.parse(latestEventAt),
  );
  const evidenceAgeDays = Math.floor(evidenceAgeMs / (24 * 60 * 60 * 1_000));
  const maximumAgeMs = maximumAgeDays * 24 * 60 * 60 * 1_000;
  const recencyScore = Math.max(
    0,
    Math.round(100 - (evidenceAgeDays / maximumAgeDays) * 50),
  );
  const dimensionScores = [
    volumeScore,
    diversityScore,
    completionScore,
    recencyScore,
  ];
  const weakestScore = Math.min(...dimensionScores);
  const score = Math.round(
    dimensionScores.reduce((total, value) => total + value, 0) /
      dimensionScores.length,
  );
  const meetsSubstantialGates =
    events.length >= minimumEvents &&
    sessionCount >= minimumSessions &&
    participantCount >= minimumParticipants &&
    terminalAttemptCount >= minimumTerminalAttempts &&
    evidenceAgeMs <= maximumAgeMs;
  const limitations: string[] = [];
  if (events.length < minimumEvents)
    limitations.push(
      `Event volume is below the ${minimumEvents}-event coverage gate.`,
    );
  if (sessionCount < minimumSessions)
    limitations.push('Fewer than three independent sessions were observed.');
  if (participantCount < minimumParticipants)
    limitations.push('Fewer than three anonymous participants were observed.');
  if (terminalAttemptCount < minimumTerminalAttempts)
    limitations.push('Fewer than three terminal task attempts were observed.');
  if (evidenceAgeMs > maximumAgeMs)
    limitations.push(
      'The newest event is older than the seven-day recency gate.',
    );
  if (events.every((event) => event.source === 'automated')) {
    limitations.push(
      'The evidence was produced by automated browser sessions, not people.',
    );
  }
  return {
    strength:
      meetsSubstantialGates && score >= 75
        ? ('substantial' as const)
        : score >= 35
          ? ('directional' as const)
          : ('insufficient' as const),
    score,
    eventCount: events.length,
    sessionCount,
    participantCount,
    completedAttemptCount,
    terminalAttemptCount,
    dimensions: {
      volume: {
        score: volumeScore,
        observedEvents: events.length,
        minimumEvents,
      },
      diversity: {
        score: diversityScore,
        observedParticipants: participantCount,
        minimumParticipants,
        observedSessions: sessionCount,
        minimumSessions,
      },
      completion: {
        score: completionScore,
        terminalAttempts: terminalAttemptCount,
        minimumTerminalAttempts,
      },
      recency: { score: recencyScore, latestEventAt, maximumAgeDays },
      weakestScore,
    },
    limitations,
  };
}

const coverageScore = (observed: number, minimum: number) =>
  Math.min(100, Math.round((observed / minimum) * 100));

function buildJourneys(events: StoredTelemetryEvent[]) {
  const sessions = new Map<string, StoredTelemetryEvent[]>();
  for (const event of events) {
    const session = sessions.get(event.sessionId) ?? [];
    session.push(event);
    sessions.set(event.sessionId, session);
  }
  return [...sessions.values()].slice(0, 50).map((session, sessionIndex) => {
    const ordered = [...session]
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, 500);
    const startedAt = Date.parse(ordered[0]!.occurredAt);
    return {
      journeyId: `J-${String(sessionIndex + 1).padStart(3, '0')}`,
      appVersion: ordered.at(-1)!.appVersion,
      source: ordered[0]!.source === 'real_user' ? 'real_user' : 'automated',
      viewport: ordered[0]!.viewport,
      eventCount: session.length,
      events: ordered.map((event, eventIndex) => ({
        eventRef: `E-${String(eventIndex + 1).padStart(3, '0')}`,
        sequence: event.sequence,
        offsetMs: Math.max(0, Date.parse(event.occurredAt) - startedAt),
        eventType: event.eventType,
        route: event.route,
        ...('targetId' in event && event.targetId
          ? { targetId: event.targetId }
          : {}),
        attributes: compactEventAttributes(event),
      })),
    };
  });
}

function compactEventAttributes(event: StoredTelemetryEvent) {
  const attributes: Record<string, string | number | boolean | null> = {};
  if ('taskId' in event && event.taskId) attributes.taskId = event.taskId;
  if ('durationMs' in event && typeof event.durationMs === 'number') {
    attributes.durationMs = event.durationMs;
  }
  if ('outcome' in event && event.outcome) attributes.outcome = event.outcome;
  if (!('properties' in event) || !event.properties) return attributes;
  for (const [key, value] of Object.entries(event.properties)) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      attributes[key] = value;
    } else if (Array.isArray(value)) {
      attributes[key] = value.join(' > ');
    }
  }
  return attributes;
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
        medianDurationMs: medianInteger(
          successful.flatMap((attempt) =>
            attempt.durationMs === null ? [] : [attempt.durationMs],
          ),
        ),
        medianInteractions: median(
          successful.map((attempt) => attempt.interactionCount),
        ),
        optimalInteractions: declaredInteractionBudget[taskId] ?? 4,
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

function medianInteger(values: number[]) {
  const value = median(values);
  return value === null ? null : Math.round(value);
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

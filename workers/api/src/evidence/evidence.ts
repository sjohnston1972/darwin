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

const parserVersion = '1.2.0' as const;
const ruleVersion = '1.2.0' as const;
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
  supportingEventIds?: Set<string>;
  supportingSessionIds?: Set<string>;
  supportingParticipantIds?: Set<string>;
  canonicalGroup?: string;
}

const terminalTypes = new Set(['task_completed', 'task_failed']);

export class EvidenceBoundaryError extends Error {}

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
  const versions = new Set(events.map((event) => event.appVersion));
  const evidenceClasses = new Set(events.map((event) => classForEvent(event)));
  if (versions.size > 1) {
    throw new EvidenceBoundaryError(
      'Evidence packs cannot mix application versions.',
    );
  }
  if (evidenceClasses.size > 1) {
    throw new EvidenceBoundaryError(
      'Evidence packs cannot mix measured, automated, and synthetic records.',
    );
  }
  const taskAttempts = reconstructAttempts(events, generatedAt);
  const candidates = detectFriction(events, taskAttempts);
  const frictionSignals = await Promise.all(
    candidates
      .slice(0, 999)
      .map((candidate, index) => signalFromCandidate(candidate, index)),
  );
  const tasks = summarizeTasks(taskAttempts);
  const evidenceClass = evidenceClassFor(events);
  const provenance = {
    evidenceClass:
      evidenceClass === 'measured'
        ? ('human_study' as const)
        : evidenceClass === 'automated'
          ? ('automated_study' as const)
          : ('scale_replay' as const),
    label:
      evidenceClass === 'measured'
        ? 'Human study'
        : evidenceClass === 'automated'
          ? 'Automated browser study'
          : 'Scale replay',
    labExperimentId: null,
    taskDefinitionId: null,
    taskDefinitionHash: null,
    evidencePackId: null,
    evidenceHash: null,
    runIds: [],
  };
  const quality = assessEvidence(events, taskAttempts);
  const journeys = buildJourneys(events);
  const appVersion = events.at(-1)?.appVersion ?? 'unknown';
  const evolved = appVersion.startsWith('1.1');
  const payload = {
    parserVersion,
    evidenceClass,
    provenance,
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
    applicationMap: {
      product: {
        name: 'ProjectFlow' as const,
        purpose:
          'A project-management workspace for finding assigned work, coordinating projects, creating tasks, and reviewing delivery health.',
        primaryUser:
          'A knowledge worker managing personal tasks and shared project delivery.',
        domainEntities: ['workspace', 'project', 'task', 'user', 'report'],
        primaryGoals: [
          'find assigned work',
          'create and assign tasks',
          'monitor project delivery',
          'review team workload',
        ],
      },
      activeVariant: {
        name: evolved ? ('evolved' as const) : ('baseline' as const),
        version: appVersion,
        navigation: evolved
          ? ['Dashboard', 'My Work', 'Projects', 'Insights', 'Settings']
          : ['Dashboard', 'Projects', 'Reports', 'Settings'],
        capabilities: evolved
          ? [
              'global task search',
              'direct My Work route',
              'global quick-create task',
              'project task directory',
              'delivery insights',
            ]
          : [
              'dashboard task summary',
              'project directory',
              'project-scoped task search',
              'project-scoped task creation',
              'standalone reports',
            ],
      },
      interfaceInventory: [
        {
          area: 'dashboard',
          purpose: 'Summarise work, project health, capacity, and activity.',
          primaryActions: ['open a project', 'inspect assigned tasks'],
        },
        {
          area: 'projects',
          purpose: 'Browse projects before opening project-scoped work.',
          primaryActions: ['search projects', 'create project', 'open project'],
        },
        {
          area: 'task-discovery',
          purpose: 'Find and open work assigned to the current user.',
          primaryActions: evolved
            ? ['open My Work', 'use global task search', 'open task']
            : [
                'open Projects',
                'open project',
                'open task directory',
                'search tasks',
                'open task',
              ],
        },
        {
          area: 'reporting',
          purpose: 'Review delivery metrics and project status.',
          primaryActions: evolved
            ? ['open Insights']
            : ['open standalone Reports'],
        },
        {
          area: 'global-header',
          purpose: 'Provide workspace-wide actions and navigation context.',
          primaryActions: evolved
            ? ['search all tasks', 'create task']
            : ['view notifications'],
        },
        {
          area: 'work-items',
          purpose:
            'Present project and task summaries with clear actions and readable supporting detail.',
          primaryActions: [
            'inspect item details',
            'open item',
            'reorder item when supported',
          ],
        },
      ],
      routes: [...new Set(events.map((event) => event.route))].sort(),
      mutableAreas: [
        'navigation',
        'search',
        'task-discovery',
        'item-presentation',
        'contextual-help',
        'interaction-behavior',
        'drag-and-drop',
        'in-app-history',
        'typography',
      ],
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
  const sessions = new Map<string, StoredTelemetryEvent[]>();
  for (const event of events) {
    const session = sessions.get(event.sessionId) ?? [];
    session.push(event);
    sessions.set(event.sessionId, session);
  }

  const attempts: TaskAttempt[] = [];
  for (const sessionEvents of sessions.values()) {
    sessionEvents.sort((left, right) => left.sequence - right.sequence);
    const startIndexes = sessionEvents.flatMap((event, index) =>
      event.eventType === 'task_started' ? [index] : [],
    );
    for (let position = 0; position < startIndexes.length; position += 1) {
      const startIndex = startIndexes[position]!;
      const nextStartIndex = startIndexes[position + 1] ?? sessionEvents.length;
      const start = sessionEvents[startIndex]!;
      if (start.eventType !== 'task_started') continue;
      const segment = sessionEvents
        .slice(startIndex, nextStartIndex)
        .filter(
          (event) =>
            !('taskAttemptId' in event) ||
            !event.taskAttemptId ||
            event.taskAttemptId === start.taskAttemptId,
        );
      const terminal = segment.find(
        (
          event,
        ): event is Extract<
          StoredTelemetryEvent,
          { eventType: 'task_completed' | 'task_failed' }
        > => terminalTypes.has(event.eventType),
      );
      const terminalIndex = terminal ? segment.indexOf(terminal) : -1;
      const attemptEvents =
        terminalIndex >= 0 ? segment.slice(0, terminalIndex + 1) : segment;
      const elapsed = Date.parse(generatedAt) - Date.parse(start.occurredAt);
      const endedByBoundary = nextStartIndex < sessionEvents.length;
      const endedBySession = attemptEvents.some(
        (event) => event.eventType === 'session_ended',
      );
      const outcome = terminal
        ? terminal.eventType === 'task_completed'
          ? 'success'
          : terminal.outcome
        : elapsed >= 120_000 || endedByBoundary || endedBySession
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

      attempts.push({
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
      });
    }
  }
  return attempts;
}

function detectFriction(
  events: StoredTelemetryEvent[],
  attempts: TaskAttempt[],
): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];
  const eventsById = new Map(events.map((event) => [event.eventId, event]));
  const attemptEventsById = new Map(
    attempts.map((attempt) => [
      attempt.attemptId,
      attempt.eventIds.flatMap((eventId) => {
        const event = eventsById.get(eventId);
        return event ? [event] : [];
      }),
    ]),
  );
  for (const attempt of attempts) {
    const attemptEvents = attemptEventsById.get(attempt.attemptId) ?? [];
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
      (attemptEventsById.get(attempt.attemptId) ?? []).some(
        (event) => event.eventType === 'search_performed',
      ),
    );
    if (searchAttempts.length / successful.length > 0.5) {
      const searchEvents = searchAttempts.flatMap((attempt) =>
        (attemptEventsById.get(attempt.attemptId) ?? []).filter(
          (event) => event.eventType === 'search_performed',
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
      (left.taskId ?? '').localeCompare(right.taskId ?? ''),
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
    const key = canonicalStringify([
      candidate.ruleId,
      candidate.taskId ?? 'session',
      representative?.appVersion ?? 'unknown',
      representative?.route ?? '',
      representative ? (targetOf(representative) ?? '') : '',
      representative ? behaviorContext(representative) : '',
    ]);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...candidate,
        events: candidate.events,
        supportingEventIds: new Set(
          candidate.events.map((event) => event.eventId),
        ),
        supportingSessionIds: new Set(
          candidate.events.map((event) => event.sessionId),
        ),
        supportingParticipantIds: new Set(
          candidate.events.map((event) => event.participantId),
        ),
        canonicalGroup: key,
      });
      continue;
    }
    for (const event of candidate.events) {
      existing.supportingEventIds?.add(event.eventId);
      existing.supportingSessionIds?.add(event.sessionId);
      existing.supportingParticipantIds?.add(event.participantId);
    }
    existing.events = [
      ...new Map(
        [...existing.events, ...candidate.events].map((event) => [
          event.eventId,
          event,
        ]),
      ).values(),
    ];
    existing.attempts = [
      ...new Set([...existing.attempts, ...candidate.attempts]),
    ];
    if (severityRank(candidate.severity) > severityRank(existing.severity)) {
      existing.severity = candidate.severity;
    }
    const count = existing.supportingEventIds?.size ?? existing.events.length;
    existing.summary = `${existing.summary.split(' Observed ')[0]} Observed ${count} times in this bounded evidence group.`;
  }
  return [...compacted, ...grouped.values()];
}

function behaviorContext(event: StoredTelemetryEvent) {
  if (event.eventType === 'interaction_signal') {
    return event.properties.signal === 'element_indecision'
      ? `${event.properties.signal}:${[
          ...(event.properties.relatedTargetIds ?? []),
        ]
          .sort()
          .join(',')}`
      : event.properties.signal;
  }
  if (event.eventType === 'browser_navigation') {
    return `${event.properties.direction}:${event.properties.fromRoute}->${event.properties.toRoute}`;
  }
  return event.eventType;
}

const severityRank = (severity: EvidenceSignal['severity']) =>
  ({ low: 0, medium: 1, high: 2 })[severity];

async function signalFromCandidate(
  candidate: SignalCandidate,
  index: number,
): Promise<EvidenceSignal> {
  const uniqueEvents = [
    ...new Map(
      candidate.events.map((event) => [event.eventId, event]),
    ).values(),
  ];
  const supportingEventIds = candidate.supportingEventIds
    ? [...candidate.supportingEventIds].sort()
    : uniqueEvents.map((event) => event.eventId);
  const representativeEvents = [...uniqueEvents]
    .sort((left, right) => left.eventId.localeCompare(right.eventId))
    .slice(0, 12)
    .sort(
      (left, right) =>
        left.receivedAt.localeCompare(right.receivedAt) ||
        left.sequence - right.sequence,
    );
  return {
    evidenceId: candidate.canonicalGroup
      ? `EV-${(await sha256(candidate.canonicalGroup)).slice(0, 12)}`
      : `EV-${String(index + 1).padStart(3, '0')}`,
    ruleId: candidate.ruleId,
    ruleVersion,
    severity: candidate.severity,
    ...(candidate.taskId ? { taskId: candidate.taskId } : {}),
    summary: candidate.summary,
    affectedAttemptIds: candidate.attempts,
    supportingEventIds: supportingEventIds.slice(0, 50),
    trace: representativeEvents.map(traceEvent),
    support: {
      events: supportingEventIds.length,
      attempts: new Set(candidate.attempts).size,
      sessions:
        candidate.supportingSessionIds?.size ??
        new Set(uniqueEvents.map((event) => event.sessionId)).size,
      participants:
        candidate.supportingParticipantIds?.size ??
        new Set(uniqueEvents.map((event) => event.participantId)).size,
    },
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

function assessEvidence(
  events: StoredTelemetryEvent[],
  attempts: TaskAttempt[],
) {
  const sessionCount = new Set(events.map((event) => event.sessionId)).size;
  const participantCount = new Set(events.map((event) => event.participantId))
    .size;
  const completedAttemptCount = attempts.filter(
    (attempt) => attempt.outcome === 'success',
  ).length;
  const score = Math.min(
    100,
    Math.min(25, Math.floor(events.length / 4)) +
      Math.min(30, sessionCount * 15) +
      Math.min(30, participantCount * 15) +
      Math.min(15, completedAttemptCount * 5),
  );
  const limitations: string[] = [];
  if (events.length < 50)
    limitations.push('Fewer than 50 semantic events were observed.');
  if (sessionCount < 3)
    limitations.push('Fewer than three independent sessions were observed.');
  if (participantCount < 3)
    limitations.push('Fewer than three anonymous participants were observed.');
  if (completedAttemptCount < 3)
    limitations.push('Fewer than three completed task attempts were observed.');
  if (events.every((event) => event.source === 'automated')) {
    limitations.push(
      'The evidence was produced by automated browser sessions, not people.',
    );
  }
  return {
    strength:
      score >= 75
        ? ('substantial' as const)
        : score >= 35
          ? ('directional' as const)
          : ('insufficient' as const),
    score,
    eventCount: events.length,
    sessionCount,
    participantCount,
    completedAttemptCount,
    limitations,
  };
}

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
  const windows = new Map<string, StoredTelemetryEvent[]>();
  for (const click of clicks) {
    const target = targetOf(click);
    if (!target) continue;
    const occurredAt = Date.parse(click.occurredAt);
    const recent = (windows.get(target) ?? []).filter(
      (event) => occurredAt - Date.parse(event.occurredAt) <= 2_000,
    );
    recent.push(click);
    windows.set(target, recent);
    if (recent.length >= 3) return recent;
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
  return events[0] ? classForEvent(events[0]) : 'measured';
}

const classForEvent = (event: StoredTelemetryEvent): EvidenceClass =>
  event.source === 'automated'
    ? 'automated'
    : event.source === 'synthetic'
      ? 'synthetic'
      : 'measured';

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

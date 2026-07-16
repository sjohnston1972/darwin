import type {
  FrictionSignal,
  SimulationMetrics,
  SimulationRun,
  SimulationSummary,
  TelemetryEvent,
} from '@darwin/shared';

const increment = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};

const round = (value: number, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};

const fingerprintEvents = (events: TelemetryEvent[]) => {
  let hash = 0x811c9dc5;

  for (const event of events) {
    const signature = `${event.id}|${event.sessionId}|${event.persona}|${event.goal}|${event.type}|${event.route}|${event.target ?? ''}|${event.durationMs ?? ''}`;
    for (let index = 0; index < signature.length; index += 1) {
      hash ^= signature.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }

  return hash.toString(16).padStart(8, '0');
};

export const aggregateSimulation = (
  run: SimulationRun,
  events: TelemetryEvent[],
): SimulationSummary => {
  const personaCounts: Record<string, number> = {};
  const eventTypeCounts: Record<string, number> = {};
  const goalCounts: Record<string, number> = {};
  const routeCounts: Record<string, number> = {};
  const sessionsWithSearch = new Set<string>();
  const sessionsWithValidationError = new Set<string>();
  const durations: number[] = [];
  let sessions = 0;
  let completed = 0;
  let abandoned = 0;
  let pageViews = 0;
  let backtracks = 0;

  for (const event of events) {
    increment(eventTypeCounts, event.type);

    if (event.type === 'workflow_started') {
      sessions += 1;
      increment(personaCounts, event.persona);
      increment(goalCounts, event.goal);
    }

    if (event.type === 'page_view') {
      pageViews += 1;
      increment(routeCounts, event.route);
    }

    if (event.type === 'workflow_completed') {
      completed += 1;
      if (event.durationMs !== undefined) durations.push(event.durationMs);
    }

    if (event.type === 'workflow_abandoned') {
      abandoned += 1;
      if (event.durationMs !== undefined) durations.push(event.durationMs);
    }

    if (event.type === 'backtrack') backtracks += 1;
    if (event.type === 'search') sessionsWithSearch.add(event.sessionId);
    if (event.type === 'validation_error') {
      sessionsWithValidationError.add(event.sessionId);
    }
  }

  const outcomes = completed + abandoned;
  const denominator = Math.max(1, outcomes);
  const sessionDenominator = Math.max(1, sessions);
  const metrics: SimulationMetrics = {
    sessions,
    workflowCompletionRate: round(completed / denominator),
    workflowAbandonmentRate: round(abandoned / denominator),
    averagePageViewsPerWorkflow: round(pageViews / sessionDenominator, 2),
    averageBacktracksPerWorkflow: round(backtracks / sessionDenominator, 2),
    searchUsageRate: round(sessionsWithSearch.size / sessionDenominator),
    validationErrorRate: round(
      sessionsWithValidationError.size / sessionDenominator,
    ),
    medianWorkflowDurationMs: median(durations),
  };
  const frictionSignals: FrictionSignal[] = [
    {
      key: 'workflow_abandonment',
      value: metrics.workflowAbandonmentRate,
      unit: 'rate',
    },
    {
      key: 'navigation_overhead',
      value: metrics.averagePageViewsPerWorkflow,
      unit: 'page_views',
    },
    {
      key: 'backtracking',
      value: metrics.averageBacktracksPerWorkflow,
      unit: 'events_per_workflow',
    },
    {
      key: 'search_dependency',
      value: metrics.searchUsageRate,
      unit: 'rate',
    },
    {
      key: 'validation_errors',
      value: sessionsWithValidationError.size,
      unit: 'count',
    },
  ];

  return {
    run,
    fingerprint: fingerprintEvents(events),
    personaCounts,
    eventTypeCounts,
    goalCounts,
    routeCounts,
    metrics,
    frictionSignals,
  };
};

import type {
  FitnessBreakdown,
  FitnessComparison,
  SimulationResult,
  TelemetryEvent,
  WorkflowGoal,
} from '@darwin/shared';

const DISCOVERY_GOALS = new Set<WorkflowGoal>([
  'find_assigned_tasks',
  'create_task',
  'review_reports',
]);

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const calculateFeatureDiscovery = (events: TelemetryEvent[]) => {
  const eligibleSessions = new Set<string>();
  const completedSessions = new Set<string>();

  for (const event of events) {
    if (!DISCOVERY_GOALS.has(event.goal)) continue;
    if (event.type === 'workflow_started')
      eligibleSessions.add(event.sessionId);
    if (event.type === 'workflow_completed')
      completedSessions.add(event.sessionId);
  }

  return eligibleSessions.size === 0
    ? 0
    : (completedSessions.size / eligibleSessions.size) * 100;
};

const calculateInverseErrorRate = (events: TelemetryEvent[]) => {
  const sessions = new Set<string>();
  const sessionsWithErrors = new Set<string>();

  for (const event of events) {
    if (event.type === 'workflow_started') sessions.add(event.sessionId);
    if (event.type === 'validation_error') {
      sessionsWithErrors.add(event.sessionId);
    }
  }

  if (sessions.size === 0) return 0;
  return (1 - sessionsWithErrors.size / sessions.size) * 100;
};

export const calculateFitness = (
  result: SimulationResult,
): FitnessBreakdown => {
  const metrics = result.summary.metrics;
  const completionRate = metrics.workflowCompletionRate * 100;

  // One page view is the ideal direct path. Each extra view and backtrack
  // applies a documented diminishing penalty rather than an arbitrary cutoff.
  const navigationEfficiency =
    100 /
    (1 +
      Math.max(0, metrics.averagePageViewsPerWorkflow - 1) * 0.35 +
      metrics.averageBacktracksPerWorkflow * 1.2);
  const inverseErrorRate = calculateInverseErrorRate(result.events);
  const featureDiscovery = calculateFeatureDiscovery(result.events);

  // Ninety seconds is the reference duration: a 90s median yields 50 points,
  // while faster workflows approach 100 without requiring an absolute cap.
  const inverseTaskDuration =
    100 / (1 + metrics.medianWorkflowDurationMs / 90_000);
  const score =
    completionRate * 0.35 +
    navigationEfficiency * 0.25 +
    inverseErrorRate * 0.15 +
    featureDiscovery * 0.15 +
    inverseTaskDuration * 0.1;

  return {
    score: round(clamp(score)),
    completionRate: round(clamp(completionRate)),
    navigationEfficiency: round(clamp(navigationEfficiency)),
    inverseErrorRate: round(clamp(inverseErrorRate)),
    featureDiscovery: round(clamp(featureDiscovery)),
    inverseTaskDuration: round(clamp(inverseTaskDuration)),
  };
};

export const compareFitness = (
  baseline: SimulationResult,
  evolved: SimulationResult,
): FitnessComparison => {
  const baselineFitness = calculateFitness(baseline);
  const evolvedFitness = calculateFitness(evolved);

  return {
    baseline: baselineFitness,
    evolved: evolvedFitness,
    delta: round(evolvedFitness.score - baselineFitness.score),
  };
};

import type {
  FrictionFinding,
  SimulationResult,
  TelemetryEvent,
  WorkflowGoal,
} from '@darwin/shared';

interface GoalStats {
  sessions: number;
  completed: number;
  abandoned: number;
  pageViews: number;
  backtracks: number;
  searches: Set<string>;
  validationErrors: Set<string>;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const clamp = (value: number) => Math.min(100, Math.max(0, value));

const statsForGoal = (
  events: TelemetryEvent[],
  goal: WorkflowGoal,
): GoalStats => {
  const stats: GoalStats = {
    sessions: 0,
    completed: 0,
    abandoned: 0,
    pageViews: 0,
    backtracks: 0,
    searches: new Set(),
    validationErrors: new Set(),
  };

  for (const event of events) {
    if (event.goal !== goal) continue;
    if (event.type === 'workflow_started') stats.sessions += 1;
    if (event.type === 'workflow_completed') stats.completed += 1;
    if (event.type === 'workflow_abandoned') stats.abandoned += 1;
    if (event.type === 'page_view') stats.pageViews += 1;
    if (event.type === 'backtrack') stats.backtracks += 1;
    if (event.type === 'search') stats.searches.add(event.sessionId);
    if (event.type === 'validation_error') {
      stats.validationErrors.add(event.sessionId);
    }
  }

  return stats;
};

const confidenceFor = (sessions: number) =>
  round(Math.min(0.98, 0.7 + Math.log10(sessions + 1) * 0.065));

export const rankFrictionFindings = (
  result: SimulationResult,
): FrictionFinding[] => {
  const events = result.events;
  const taskDiscovery = statsForGoal(events, 'find_assigned_tasks');
  const taskCreation = statsForGoal(events, 'create_task');
  const taskOutcomes = Math.max(
    1,
    taskDiscovery.completed + taskDiscovery.abandoned,
  );
  const creationOutcomes = Math.max(
    1,
    taskCreation.completed + taskCreation.abandoned,
  );
  const taskAbandonment = taskDiscovery.abandoned / taskOutcomes;
  const taskPageViews =
    taskDiscovery.pageViews / Math.max(1, taskDiscovery.sessions);
  const taskBacktracks =
    taskDiscovery.backtracks / Math.max(1, taskDiscovery.sessions);
  const taskSearchRate =
    taskDiscovery.searches.size / Math.max(1, taskDiscovery.sessions);
  const creationAbandonment = taskCreation.abandoned / creationOutcomes;
  const creationPageViews =
    taskCreation.pageViews / Math.max(1, taskCreation.sessions);
  const creationErrorRate =
    taskCreation.validationErrors.size / Math.max(1, taskCreation.sessions);
  const totalPageViews = Math.max(
    1,
    Object.values(result.summary.routeCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
  );
  const dashboardShare =
    (result.summary.routeCounts['/dashboard'] ?? 0) / totalPageViews;
  const reportsShare =
    (result.summary.routeCounts['/reports'] ?? 0) / totalPageViews;

  const findings: FrictionFinding[] = [
    {
      id: 'finding-task-discovery',
      title: 'Assigned tasks are difficult to locate',
      description:
        'Task-finding workflows require indirect navigation and frequently depend on search after users reach the task directory.',
      impact: Math.round(
        clamp(
          taskAbandonment * 45 +
            taskPageViews * 9 +
            taskBacktracks * 22 +
            taskSearchRate * 20,
        ),
      ),
      confidence: confidenceFor(taskDiscovery.sessions),
      evidence: [
        `${percent(taskAbandonment)} of assigned-task workflows were abandoned.`,
        `Assigned-task workflows averaged ${round(taskPageViews)} page views and ${round(taskBacktracks)} backtracks.`,
        `${percent(taskSearchRate)} of assigned-task sessions used search after navigating into the workflow.`,
      ],
    },
    {
      id: 'finding-task-creation',
      title: 'Task creation carries avoidable navigation cost',
      description:
        'Creating work requires users to enter a project-specific task surface before the task form becomes available.',
      impact: Math.round(
        clamp(
          creationAbandonment * 40 +
            creationPageViews * 8 +
            creationErrorRate * 30,
        ),
      ),
      confidence: confidenceFor(taskCreation.sessions),
      evidence: [
        `${percent(creationAbandonment)} of task-creation workflows were abandoned.`,
        `Task creation averaged ${round(creationPageViews)} page views per workflow.`,
        `${percent(creationErrorRate)} of task-creation sessions produced a validation error.`,
      ],
    },
    {
      id: 'finding-dashboard-overhead',
      title: 'Dashboard traffic is not consistently task-oriented',
      description:
        'A substantial share of navigation begins on the dashboard before moving to the feature required by the workflow.',
      impact: Math.round(clamp(28 + dashboardShare * 55)),
      confidence: confidenceFor(result.summary.metrics.sessions),
      evidence: [
        `${percent(dashboardShare)} of all page views occurred on the dashboard.`,
        `${result.summary.routeCounts['/dashboard'] ?? 0} dashboard page views were observed.`,
      ],
    },
    {
      id: 'finding-report-discovery',
      title: 'Reports receive limited workflow traffic',
      description:
        'The dedicated report destination accounts for a small portion of observed navigation.',
      impact: Math.round(clamp(30 + Math.max(0, 0.08 - reportsShare) * 100)),
      confidence: confidenceFor(result.summary.metrics.sessions),
      evidence: [
        `${percent(reportsShare)} of all page views reached Reports.`,
        `${result.summary.routeCounts['/reports'] ?? 0} report page views were observed.`,
      ],
    },
  ];

  return findings.sort((left, right) => right.impact - left.impact);
};

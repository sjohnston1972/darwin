import {
  LabEvidencePackSchema,
  type LabAgentActionRecord,
  type LabAgentRun,
  type LabEvidencePack,
  type LabEvidenceSignal,
  type LabExperiment,
  type LabFrictionLabel,
} from '@darwin/shared';

const textEncoder = new TextEncoder();

const hexadecimal = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[midpoint]!
    : (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
};

interface DetectorMatch {
  detector: LabFrictionLabel;
  run: LabAgentRun;
  actions: LabAgentActionRecord[];
}

const routePath = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

const detectorMatches = (run: LabAgentRun): DetectorMatch[] => {
  const matches: DetectorMatch[] = [];
  const unchangedClicks = run.actions.filter(
    (action) =>
      ['click', 'submit'].includes(action.action) &&
      action.outcome === 'unchanged',
  );
  if (unchangedClicks.length) {
    matches.push({ detector: 'dead_click', run, actions: unchangedClicks });
    matches.push({
      detector: 'false_affordance',
      run,
      actions: unchangedClicks,
    });
  }

  const rageActions = run.actions.filter((action, index, actions) => {
    if (action.action !== 'click' || !action.targetId) return false;
    const window = actions.slice(Math.max(0, index - 2), index + 1);
    return (
      window.length === 3 &&
      window.every(
        (candidate) =>
          candidate.action === 'click' &&
          candidate.targetId === action.targetId,
      ) &&
      Date.parse(window[2]!.occurredAt) - Date.parse(window[0]!.occurredAt) <=
        2_000
    );
  });
  if (rageActions.length) {
    matches.push({ detector: 'rage_click', run, actions: rageActions });
  }

  const routes = [
    ...(run.actions[0] ? [routePath(run.actions[0].fromUrl)] : []),
    ...run.actions.map((action) => routePath(action.toUrl)),
  ];
  const routeCounts = new Map<string, number>();
  routes.forEach((route) =>
    routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1),
  );
  const repeatedRoutes = new Set(
    [...routeCounts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([route]) => route),
  );
  const loopActions = run.actions.filter((action) =>
    repeatedRoutes.has(routePath(action.toUrl)),
  );
  if (loopActions.length) {
    matches.push({ detector: 'navigation_loop', run, actions: loopActions });
  }

  const pogoActions = run.actions.filter((action, index) => {
    if (['back', 'forward'].includes(action.action)) return true;
    if (index < 1) return false;
    return (
      routePath(action.toUrl) === routePath(run.actions[index - 1]!.fromUrl)
    );
  });
  if (pogoActions.length) {
    matches.push({ detector: 'pogo_navigation', run, actions: pogoActions });
  }

  if (run.actions.length > 8) {
    matches.push({
      detector: 'excess_path_length',
      run,
      actions: run.actions.slice(8),
    });
  }

  const searchActions = run.actions.filter(
    (action) =>
      action.targetId?.includes('search') && action.outcome !== 'changed',
  );
  if (searchActions.length) {
    matches.push({ detector: 'search_failure', run, actions: searchActions });
  }

  if (routes.length >= 6 && new Set(routes).size >= 4) {
    matches.push({
      detector: 'information_architecture_confusion',
      run,
      actions: run.actions,
    });
  }

  const accessibilityErrors = run.actions.filter(
    (action) =>
      action.outcome === 'error' &&
      Boolean(action.error?.toLowerCase().match(/locator|accessible|target/)),
  );
  if (run.status === 'blocked' || accessibilityErrors.length) {
    matches.push({
      detector: 'accessibility_block',
      run,
      actions: accessibilityErrors,
    });
  }

  if (run.taskOutcome === 'abandoned') {
    matches.push({
      detector: 'abandonment',
      run,
      actions: run.actions.slice(-1),
    });
  }
  return matches;
};

const detectorSummary: Record<LabFrictionLabel, string> = {
  dead_click: 'Agents activated controls without an observable UI response.',
  rage_click: 'Agents repeatedly activated the same control in a short window.',
  navigation_loop: 'Agents revisited the same route at least three times.',
  pogo_navigation:
    'Agents reversed direction or bounced between adjacent routes.',
  excess_path_length: 'Agents exceeded the eight-action task path threshold.',
  search_failure:
    'Search-oriented actions did not produce an observable change.',
  false_affordance:
    'Controls appeared actionable but did not change the interface.',
  information_architecture_confusion:
    'Agents traversed at least four routes without a direct task path.',
  accessibility_block:
    'Agents could not resolve a required control through the accessibility tree.',
  abandonment: 'Agents ended the task before satisfying the hidden oracle.',
};

const buildSignals = (runs: LabAgentRun[]): LabEvidenceSignal[] => {
  const grouped = new Map<LabFrictionLabel, DetectorMatch[]>();
  runs.flatMap(detectorMatches).forEach((match) => {
    grouped.set(match.detector, [
      ...(grouped.get(match.detector) ?? []),
      match,
    ]);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([detector, matches], index) => {
      const runIds = [...new Set(matches.map((match) => match.run.runId))];
      const actions = matches.flatMap((match) => match.actions);
      const telemetryEventIds = [
        ...new Set(matches.flatMap((match) => match.run.telemetryEventIds)),
      ];
      const affectedRate = runIds.length / Math.max(runs.length, 1);
      return {
        evidenceId: `L-EV-${String(index + 1).padStart(3, '0')}`,
        detector,
        severity:
          affectedRate >= 0.5
            ? 'high'
            : affectedRate >= 0.25
              ? 'medium'
              : 'low',
        summary: detectorSummary[detector],
        supportingRunIds: runIds,
        supportingActionIds: [
          ...new Set(actions.map((action) => action.actionId)),
        ],
        supportingTelemetryEventIds: telemetryEventIds,
        support: {
          runs: runIds.length,
          actions: actions.length,
          telemetryEvents: telemetryEventIds.length,
        },
      } satisfies LabEvidenceSignal;
    });
};

const hasRepeatedRoute = (run: LabAgentRun) => {
  const routes = run.actions.map((action) => routePath(action.toUrl));
  return new Set(routes).size < routes.length;
};

export async function buildLabEvidence(
  experiment: LabExperiment,
  generatedAt = new Date().toISOString(),
): Promise<LabEvidencePack> {
  const terminalRuns = experiment.runs.filter((run) =>
    ['succeeded', 'failed', 'abandoned', 'blocked'].includes(run.status),
  );
  const successful = terminalRuns.filter(
    (run) => run.taskOutcome === 'success',
  ).length;
  const abandoned = terminalRuns.filter(
    (run) => run.taskOutcome === 'abandoned',
  ).length;
  const searchRuns = terminalRuns.filter((run) =>
    run.actions.some((action) => action.targetId?.includes('search')),
  );
  const failedSearchRuns = searchRuns.filter((run) =>
    run.actions.some(
      (action) =>
        action.targetId?.includes('search') && action.outcome !== 'changed',
    ),
  );
  const signals = buildSignals(terminalRuns);
  const hashInput = JSON.stringify({
    experimentId: experiment.experimentId,
    seed: experiment.seed,
    taskId: experiment.task.taskId,
    runs: terminalRuns.map((run) => ({
      runId: run.runId,
      persona: run.persona,
      viewport: run.viewport,
      status: run.status,
      taskOutcome: run.taskOutcome,
      telemetryEventIds: run.telemetryEventIds,
      actions: run.actions,
    })),
    signals,
  });
  const evidenceHash = hexadecimal(
    await crypto.subtle.digest('SHA-256', textEncoder.encode(hashInput)),
  );

  return LabEvidencePackSchema.parse({
    evidencePackId: `lab-pack-${experiment.experimentId}`,
    experimentId: experiment.experimentId,
    evidenceHash,
    parserVersion: '1.0.0',
    evidenceClass: 'synthetic',
    generatedAt,
    population: {
      planned: experiment.populationSize,
      completed: terminalRuns.length,
      successful,
      abandoned,
    },
    metrics: {
      completionRate: terminalRuns.length
        ? successful / terminalRuns.length
        : 0,
      medianActions: median(terminalRuns.map((run) => run.actions.length)),
      medianDurationMs: median(
        terminalRuns.flatMap((run) =>
          run.durationMs === null ? [] : [run.durationMs],
        ),
      ),
      repeatedRouteRate: terminalRuns.length
        ? terminalRuns.filter(hasRepeatedRoute).length / terminalRuns.length
        : 0,
      searchFailureRate: searchRuns.length
        ? failedSearchRuns.length / searchRuns.length
        : 0,
    },
    signals,
    runIds: terminalRuns.map((run) => run.runId),
    limitations: [
      'This evidence was produced by synthetic AI agents, not human participants.',
      'Agent friction labels supplement deterministic detectors and are not treated as measured user sentiment.',
      'Results apply only to the configured ProjectFlow build, task, personas, and seed.',
    ],
  });
}

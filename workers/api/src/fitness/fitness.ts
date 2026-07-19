import {
  FitnessOutcomeSchema,
  type EvidencePack,
  type FitnessComponent,
  type FitnessCohort,
  type FitnessOutcome,
  type RepositoryMutationExecution,
} from '@darwin/shared';

export const fitnessFormulaVersion = '1.0.0' as const;
export const minimumFitnessSample = {
  terminalAttempts: 3,
  sessions: 3,
  participants: 3,
  tasks: 3,
  matchingTaskSet: true as const,
};

const weights = {
  task_completion: 30,
  navigation_efficiency: 25,
  error_rate: 15,
  feature_discovery: 15,
  median_duration: 15,
} as const;

const idealDurationMs: Record<string, number> = {
  'create-project': 30_000,
  'create-assigned-task': 30_000,
  'find-assigned-task': 15_000,
};

const terminalOutcomes = new Set(['success', 'failed', 'abandoned']);
const clampScore = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));
const sameValues = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const cohortFor = (pack: EvidencePack): FitnessCohort => {
  const terminalAttempts = pack.taskAttempts.filter((attempt) =>
    terminalOutcomes.has(attempt.outcome),
  );
  return {
    evidenceId: pack.evidenceId,
    evidenceHash: pack.evidenceHash,
    appVersion: pack.study.appVersion,
    measuredCommit: pack.study.measuredCommit,
    participants: pack.study.participants,
    sessions: pack.study.sessions,
    terminalAttempts: terminalAttempts.length,
    taskIds: [...new Set(pack.tasks.map((task) => task.taskId))].sort(),
  };
};

const taskCompletionScore = (pack: EvidencePack) => {
  const attempts = pack.taskAttempts.filter((attempt) =>
    terminalOutcomes.has(attempt.outcome),
  );
  return clampScore(
    (attempts.filter((attempt) => attempt.outcome === 'success').length /
      attempts.length) *
      100,
  );
};

const navigationEfficiencyScore = (pack: EvidencePack) => {
  const optimalByTask = new Map(
    pack.tasks.map((task) => [task.taskId, task.optimalInteractions]),
  );
  const attempts = pack.taskAttempts.filter((attempt) =>
    terminalOutcomes.has(attempt.outcome),
  );
  const ratios = attempts.map((attempt) => {
    const optimal = optimalByTask.get(attempt.taskId) ?? 1;
    return Math.min(1, optimal / Math.max(optimal, attempt.interactionCount));
  });
  return clampScore(
    (ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length) * 100,
  );
};

const errorRateScore = (pack: EvidencePack) => {
  const validationErrors = pack.journeys.reduce(
    (count, journey) =>
      count +
      journey.events.filter((event) => event.eventType === 'validation_error')
        .length,
    0,
  );
  const terminalAttempts = pack.taskAttempts.filter((attempt) =>
    terminalOutcomes.has(attempt.outcome),
  ).length;
  return clampScore((1 - validationErrors / terminalAttempts) * 100);
};

const featureDiscoveryScore = (pack: EvidencePack) => {
  const taskIds = new Set(pack.tasks.map((task) => task.taskId));
  const discovered = new Set(
    pack.taskAttempts
      .filter((attempt) => attempt.outcome === 'success')
      .map((attempt) => attempt.taskId),
  );
  return clampScore((discovered.size / taskIds.size) * 100);
};

const durationScore = (pack: EvidencePack) => {
  const ratios = pack.tasks.map((task) => {
    const ideal = idealDurationMs[task.taskId] ?? 30_000;
    return task.medianDurationMs === null
      ? 0
      : Math.min(1, ideal / Math.max(ideal, task.medianDurationMs));
  });
  return clampScore(
    (ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length) * 100,
  );
};

const scorePack = (pack: EvidencePack) => ({
  task_completion: taskCompletionScore(pack),
  navigation_efficiency: navigationEfficiencyScore(pack),
  error_rate: errorRateScore(pack),
  feature_discovery: featureDiscoveryScore(pack),
  median_duration: durationScore(pack),
});

const cohortLimitations = (
  label: 'Baseline' | 'Evolved',
  cohort: FitnessCohort,
) => [
  ...(cohort.terminalAttempts < minimumFitnessSample.terminalAttempts
    ? [
        `${label} requires at least ${minimumFitnessSample.terminalAttempts} terminal task attempts.`,
      ]
    : []),
  ...(cohort.sessions < minimumFitnessSample.sessions
    ? [`${label} requires at least ${minimumFitnessSample.sessions} sessions.`]
    : []),
  ...(cohort.participants < minimumFitnessSample.participants
    ? [
        `${label} requires at least ${minimumFitnessSample.participants} participants.`,
      ]
    : []),
  ...(cohort.taskIds.length < minimumFitnessSample.tasks
    ? [`${label} requires all ${minimumFitnessSample.tasks} fixed study tasks.`]
    : []),
];

export function calculateFitnessOutcome({
  execution,
  baselinePack,
  evolvedPack,
  generatedAt = new Date().toISOString(),
}: {
  execution: RepositoryMutationExecution;
  baselinePack: EvidencePack;
  evolvedPack: EvidencePack;
  generatedAt?: string;
}): FitnessOutcome {
  const baseline = cohortFor(baselinePack);
  const evolved = cohortFor(evolvedPack);
  const expectedEvolvedCommit =
    execution.deploymentVerification?.observedCommit ?? execution.headSha;
  const expectedEvolvedVersion =
    execution.deploymentVerification?.observedAppVersion ??
    expectedEvolvedCommit?.slice(0, 12) ??
    null;
  const limitations = [
    ...(execution.status !== 'released'
      ? ['The repository mutation has not been released.']
      : []),
    ...(baselinePack.evidenceClass !== 'measured' ||
    evolvedPack.evidenceClass !== 'measured'
      ? ['Fitness requires two measured evidence classes.']
      : []),
    ...(baselinePack.study.studyId !== evolvedPack.study.studyId
      ? ['Baseline and evolved evidence must use the same study.']
      : []),
    ...(baseline.appVersion === evolved.appVersion
      ? ['Baseline and evolved application versions must differ.']
      : []),
    ...(baseline.measuredCommit !== null &&
    baseline.measuredCommit !== execution.baseSha
      ? ['Baseline evidence does not match the mutation base commit.']
      : []),
    ...(evolved.measuredCommit !== expectedEvolvedCommit ||
    evolved.appVersion !== expectedEvolvedVersion
      ? ['Evolved evidence does not match the verified released deployment.']
      : []),
    ...(!baseline.taskIds.length ||
    !sameValues(baseline.taskIds, evolved.taskIds)
      ? [
          'Baseline and evolved evidence must cover the same non-empty task set.',
        ]
      : []),
    ...cohortLimitations('Baseline', baseline),
    ...cohortLimitations('Evolved', evolved),
  ];
  const status =
    execution.rollback?.status === 'released'
      ? ('rolled_back' as const)
      : limitations.length
        ? ('insufficient' as const)
        : ('measured' as const);
  if (status === 'rolled_back') {
    limitations.unshift(
      'Fitness comparison stopped because the measured mutation was rolled back.',
    );
  }

  let components: FitnessComponent[] = [];
  let baselineScore: number | null = null;
  let evolvedScore: number | null = null;
  let delta: number | null = null;
  if (status === 'measured') {
    const baselineComponents = scorePack(baselinePack);
    const evolvedComponents = scorePack(evolvedPack);
    components = Object.entries(weights).map(([metric, weight]) => {
      const key = metric as keyof typeof weights;
      const componentBaseline = baselineComponents[key];
      const componentEvolved = evolvedComponents[key];
      return {
        metric: key,
        weight,
        baselineScore: componentBaseline,
        evolvedScore: componentEvolved,
        delta: componentEvolved - componentBaseline,
      };
    });
    baselineScore = clampScore(
      components.reduce(
        (sum, component) =>
          sum + (component.baselineScore * component.weight) / 100,
        0,
      ),
    );
    evolvedScore = clampScore(
      components.reduce(
        (sum, component) =>
          sum + (component.evolvedScore * component.weight) / 100,
        0,
      ),
    );
    delta = evolvedScore - baselineScore;
  }

  return FitnessOutcomeSchema.parse({
    outcomeId: `fitness-${execution.executionId}`,
    executionId: execution.executionId,
    studyId: baselinePack.study.studyId,
    formulaVersion: fitnessFormulaVersion,
    status,
    generatedAt,
    invalidatedAt: status === 'rolled_back' ? generatedAt : null,
    baseline,
    evolved,
    minimumSample: minimumFitnessSample,
    components,
    baselineScore,
    evolvedScore,
    delta,
    limitations,
  });
}

export const invalidateFitnessOutcome = (
  outcome: FitnessOutcome,
  invalidatedAt = new Date().toISOString(),
) =>
  FitnessOutcomeSchema.parse({
    ...outcome,
    status: 'rolled_back',
    baselineScore: null,
    evolvedScore: null,
    delta: null,
    components: [],
    invalidatedAt,
    limitations: [
      'Fitness comparison stopped because the measured mutation was rolled back.',
      ...outcome.limitations.filter(
        (limitation) => !limitation.includes('rolled back'),
      ),
    ],
  });

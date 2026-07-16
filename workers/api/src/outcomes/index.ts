import {
  OutcomeValidationSchema,
  type EvidencePack,
  type OutcomeValidation,
} from '@darwin/shared';

export class OutcomeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutcomeValidationError';
  }
}

const cohort = (
  pack: EvidencePack,
  variant: 'baseline' | 'evolved',
  taskId: string,
) => {
  if (pack.evidenceClass !== 'automated') {
    throw new OutcomeValidationError(
      `${variant} evidence must be labelled automated.`,
    );
  }
  const task = pack.tasks.find((candidate) => candidate.taskId === taskId);
  if (
    !task ||
    task.medianInteractions === null ||
    task.medianDurationMs === null ||
    task.attempts < 1
  ) {
    throw new OutcomeValidationError(
      `${variant} evidence has no completed ${taskId} attempt.`,
    );
  }
  return {
    cohortId: `cohort-${variant}-${pack.evidenceHash.slice(0, 10)}`,
    studyId: pack.study.studyId,
    variant,
    appVersion: pack.study.appVersion,
    source: 'automated' as const,
    evidenceId: pack.evidenceId,
    evidenceHash: pack.evidenceHash,
    taskId,
    attempts: task.attempts,
    successes: task.successes,
    completionRate: task.completionRate,
    medianInteractions: task.medianInteractions,
    medianDurationMs: task.medianDurationMs,
  };
};

export function compareAutomatedOutcomes(
  baselinePack: EvidencePack,
  evolvedPack: EvidencePack,
  taskId = 'find-assigned-task',
  generatedAt = new Date().toISOString(),
): OutcomeValidation {
  const baseline = cohort(baselinePack, 'baseline', taskId);
  const evolved = cohort(evolvedPack, 'evolved', taskId);
  const interactions = evolved.medianInteractions - baseline.medianInteractions;
  const durationMs = evolved.medianDurationMs - baseline.medianDurationMs;
  const completionRate = evolved.completionRate - baseline.completionRate;
  const conclusion =
    interactions < 0
      ? `Automated validation completed the evolved path with ${Math.abs(interactions)} fewer median interactions.`
      : 'Automated validation did not reduce median interactions.';

  return OutcomeValidationSchema.parse({
    validationId: `outcome-${baselinePack.evidenceHash.slice(0, 8)}-${evolvedPack.evidenceHash.slice(0, 8)}`,
    evidenceClass: 'automated',
    provenance: 'live_automated_run',
    generatedAt,
    taskId,
    baseline,
    evolved,
    delta: { interactions, durationMs, completionRate },
    conclusion,
  });
}

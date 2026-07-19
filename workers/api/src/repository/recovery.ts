import type { RepositoryMutationExecution } from '@darwin/shared';

import type { TelemetryRepository } from '../persistence/telemetry-repository';
import { updateRepositoryExecution } from './execution';

export const strandedExecutionMinimumAgeMs = 15 * 60 * 1_000;

export type ExecutionRecoveryResult =
  | { outcome: 'not_found' }
  | { outcome: 'not_stranded'; execution: RepositoryMutationExecution }
  | {
      outcome: 'too_recent';
      execution: RepositoryMutationExecution;
      eligibleAt: string;
    }
  | { outcome: 'recovered'; execution: RepositoryMutationExecution };

export const forceFailStrandedExecution = async (
  repository: TelemetryRepository,
  executionId: string,
  now = new Date(),
  minimumAgeMs = strandedExecutionMinimumAgeMs,
): Promise<ExecutionRecoveryResult> => {
  const execution = await repository.getRepositoryExecution(executionId);
  if (!execution) return { outcome: 'not_found' };
  if (!['queued', 'codex_running', 'validating'].includes(execution.status)) {
    return { outcome: 'not_stranded', execution };
  }
  const eligibleAt = new Date(
    new Date(execution.updatedAt).getTime() + minimumAgeMs,
  );
  if (now.getTime() < eligibleAt.getTime()) {
    return {
      outcome: 'too_recent',
      execution,
      eligibleAt: eligibleAt.toISOString(),
    };
  }
  const failed = updateRepositoryExecution(
    execution,
    {
      status: 'failed',
      error:
        'Operator marked a stranded GitHub workflow as failed after the bounded recovery window.',
      completedAt: now.toISOString(),
    },
    now.toISOString(),
  );
  const persisted = await repository.compareAndSwapRepositoryExecution(
    execution,
    failed,
  );
  return persisted
    ? { outcome: 'recovered', execution: persisted }
    : {
        outcome: 'not_stranded',
        execution:
          (await repository.getRepositoryExecution(executionId)) ?? execution,
      };
};

import {
  RepositoryExecutionCallbackSchema,
  RepositoryMutationExecutionSchema,
  RepositoryRollbackCallbackSchema,
  RepositoryRollbackSchema,
  type CodexImplementationManifest,
  type RepositoryExecutionCallback,
  type RepositoryExecutionStatus,
  type RepositoryMutationExecution,
  type RepositoryRollbackCallback,
  type RepositoryRollbackStatus,
} from '@darwin/shared';

const transitions: Record<
  RepositoryExecutionStatus,
  RepositoryExecutionStatus[]
> = {
  prepared: ['queued', 'failed'],
  queued: ['codex_running', 'failed'],
  codex_running: ['validating', 'failed'],
  validating: ['pull_request_open', 'failed'],
  pull_request_open: ['preview_ready', 'failed'],
  preview_ready: ['releasing', 'failed'],
  releasing: ['deployment_verifying', 'failed'],
  deployment_verifying: ['released', 'failed'],
  released: [],
  failed: [],
};

const rollbackTransitions: Record<
  RepositoryRollbackStatus,
  RepositoryRollbackStatus[]
> = {
  prepared: ['queued', 'failed'],
  queued: ['validating', 'failed'],
  validating: ['pull_request_open', 'failed'],
  pull_request_open: ['preview_ready', 'failed'],
  preview_ready: ['releasing', 'failed'],
  releasing: ['released', 'failed'],
  released: [],
  failed: [],
};

export const createRepositoryExecution = (
  manifest: CodexImplementationManifest,
  createdAt = new Date().toISOString(),
): RepositoryMutationExecution => {
  if (!manifest.repository) {
    throw new Error('The manifest is not bound to a live repository snapshot.');
  }
  const suffix = manifest.manifestHash.slice(0, 12);
  return RepositoryMutationExecutionSchema.parse({
    executionId: `execution-${suffix}`,
    revision: 0,
    manifestId: manifest.manifestId,
    analysisId: manifest.analysisId,
    repository: manifest.repository,
    status: 'prepared',
    branch: `darwin/evolution-${suffix}`,
    baseSha: manifest.repository.baseSha,
    headSha: null,
    workflowRunId: null,
    workflowUrl: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    previewUrl: null,
    patch: null,
    changedFiles: [],
    checks: [
      {
        name: 'Codex patch generation',
        status: 'pending',
        durationMs: null,
        output: 'Waiting for the repository workflow.',
      },
      ...manifest.validationCommands.map((command) => ({
        name: command,
        status: 'pending' as const,
        durationMs: null,
        output: 'Waiting for a generated patch.',
      })),
    ],
    codex: {
      threadId: null,
      finalMessage: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    },
    error: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  });
};

export const retryRepositoryExecution = (
  execution: RepositoryMutationExecution,
  manifest: CodexImplementationManifest,
  createdAt = new Date().toISOString(),
) => {
  if (execution.status !== 'failed') {
    throw new Error('Only a failed repository execution can be retried.');
  }
  const retry = createRepositoryExecution(manifest, createdAt);
  if (retry.executionId !== execution.executionId) {
    throw new Error('A retry must target the original repository execution.');
  }
  return RepositoryMutationExecutionSchema.parse({
    ...retry,
    revision: execution.revision + 1,
  });
};

export const updateRepositoryExecution = (
  execution: RepositoryMutationExecution,
  rawCallback: RepositoryExecutionCallback,
  updatedAt = new Date().toISOString(),
) => {
  const callback = RepositoryExecutionCallbackSchema.parse(rawCallback);
  if (callback.status === execution.status) {
    throw new Error(
      `Repository execution status ${execution.status} is immutable once recorded.`,
    );
  }
  if (
    callback.status !== execution.status &&
    !transitions[execution.status].includes(callback.status)
  ) {
    throw new Error(
      `Invalid repository execution transition: ${execution.status} -> ${callback.status}.`,
    );
  }
  return RepositoryMutationExecutionSchema.parse({
    ...execution,
    ...callback,
    revision: execution.revision + 1,
    updatedAt,
    completedAt:
      callback.completedAt ??
      (callback.status === 'failed' || callback.status === 'released'
        ? updatedAt
        : execution.completedAt),
  });
};

export const createRepositoryRollback = (
  execution: RepositoryMutationExecution,
  createdAt = new Date().toISOString(),
) => {
  if (execution.status !== 'released' || !execution.headSha) {
    throw new Error(
      'A released repository mutation with a retained commit is required before rollback.',
    );
  }
  const suffix = execution.headSha.slice(0, 12);
  return RepositoryRollbackSchema.parse({
    rollbackId: `rollback-${suffix}`,
    status: 'prepared',
    branch: `darwin/rollback-${suffix}`,
    revertedSha: execution.headSha,
    headSha: null,
    workflowRunId: null,
    workflowUrl: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    previewUrl: null,
    patch: null,
    changedFiles: [],
    checks: [
      {
        name: 'Git revert generation',
        status: 'pending',
        durationMs: null,
        output: 'Waiting for the controlled rollback workflow.',
      },
      ...execution.repository.validationCommands.map((command) => ({
        name: command,
        status: 'pending' as const,
        durationMs: null,
        output: 'Waiting for the generated rollback.',
      })),
    ],
    error: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  });
};

export const attachRepositoryRollback = (
  execution: RepositoryMutationExecution,
  rollback: ReturnType<typeof createRepositoryRollback>,
  updatedAt = new Date().toISOString(),
) =>
  RepositoryMutationExecutionSchema.parse({
    ...execution,
    revision: execution.revision + 1,
    updatedAt,
    rollback,
  });

export const updateRepositoryRollback = (
  execution: RepositoryMutationExecution,
  rawCallback: RepositoryRollbackCallback,
  updatedAt = new Date().toISOString(),
) => {
  if (!execution.rollback) {
    throw new Error('A rollback must be prepared before it can be updated.');
  }
  const callback = RepositoryRollbackCallbackSchema.parse(rawCallback);
  const rollback = execution.rollback;
  if (callback.status === rollback.status) {
    throw new Error(
      `Repository rollback status ${rollback.status} is immutable once recorded.`,
    );
  }
  if (
    callback.status !== rollback.status &&
    !rollbackTransitions[rollback.status].includes(callback.status)
  ) {
    throw new Error(
      `Invalid repository rollback transition: ${rollback.status} -> ${callback.status}.`,
    );
  }
  return RepositoryMutationExecutionSchema.parse({
    ...execution,
    revision: execution.revision + 1,
    updatedAt,
    rollback: {
      ...rollback,
      ...callback,
      updatedAt,
      completedAt:
        callback.completedAt ??
        (callback.status === 'failed' || callback.status === 'released'
          ? updatedAt
          : rollback.completedAt),
    },
  });
};

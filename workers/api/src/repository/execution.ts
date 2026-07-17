import {
  RepositoryExecutionCallbackSchema,
  RepositoryMutationExecutionSchema,
  type CodexImplementationManifest,
  type RepositoryExecutionCallback,
  type RepositoryExecutionStatus,
  type RepositoryMutationExecution,
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

export const updateRepositoryExecution = (
  execution: RepositoryMutationExecution,
  rawCallback: RepositoryExecutionCallback,
  updatedAt = new Date().toISOString(),
) => {
  const callback = RepositoryExecutionCallbackSchema.parse(rawCallback);
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
    updatedAt,
    completedAt:
      callback.completedAt ??
      (callback.status === 'failed' || callback.status === 'released'
        ? updatedAt
        : execution.completedAt),
  });
};

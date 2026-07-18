import {
  DemoResetCallbackSchema,
  DemoResetExecutionSchema,
  type DemoResetCallback,
  type DemoResetExecution,
  type DemoResetStatus,
  type RepositoryDeploymentVerification,
} from '@darwin/shared';

export const resetPolicyHash =
  'bf8a84e3a46ebd0a3d507007d058af0a1e3ad895c6c52d258fdf83e6db07a48c';
export const resetBaselineTag = 'demo-baseline-v2';

const transitions: Record<DemoResetStatus, DemoResetStatus[]> = {
  queued: ['running', 'failed'],
  running: ['validating', 'failed'],
  validating: ['deploying', 'failed'],
  deploying: ['complete', 'failed'],
  complete: [],
  failed: [],
};

export const createResetExecution = (
  repository: DemoResetExecution['repository'],
  createdAt = new Date().toISOString(),
): DemoResetExecution =>
  DemoResetExecutionSchema.parse({
    resetId: `reset-${crypto.randomUUID()}`,
    status: 'queued',
    repository,
    baselineTag: resetBaselineTag,
    policyHash: resetPolicyHash,
    repositoryResetDispatched: false,
    workflowRunId: null,
    workflowUrl: null,
    baselineCommit: null,
    deploymentVerification: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  });

export const updateResetExecution = (
  execution: DemoResetExecution,
  rawCallback: DemoResetCallback,
  updatedAt = new Date().toISOString(),
) => {
  const callback = DemoResetCallbackSchema.parse(rawCallback);
  if (!transitions[execution.status].includes(callback.status)) {
    throw new Error(
      `Invalid reset execution transition: ${execution.status} -> ${callback.status}.`,
    );
  }
  if (callback.status === 'deploying' && !callback.baselineCommit) {
    throw new Error('A validated baseline commit is required for deployment.');
  }
  return DemoResetExecutionSchema.parse({
    ...execution,
    ...callback,
    updatedAt,
    completedAt:
      callback.status === 'failed' ? updatedAt : execution.completedAt,
  });
};

export const completeResetExecution = (
  execution: DemoResetExecution,
  deploymentVerification: RepositoryDeploymentVerification,
  updatedAt = new Date().toISOString(),
) => {
  if (execution.status !== 'deploying') {
    throw new Error(
      `Invalid reset execution transition: ${execution.status} -> complete.`,
    );
  }
  return DemoResetExecutionSchema.parse({
    ...execution,
    status: 'complete',
    deploymentVerification,
    error: null,
    updatedAt,
    completedAt: updatedAt,
  });
};

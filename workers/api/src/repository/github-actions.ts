import type {
  RepositoryMutationExecution,
  RepositoryRollback,
} from '@darwin/shared';
import { timeOperation } from '../observability';

const headers = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'darwin-evolution-engine',
  'X-GitHub-Api-Version': '2022-11-28',
});

const commitShaPattern = /^[a-f0-9]{40}$/;

const githubRequest = (
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
) =>
  timeOperation(
    'github',
    `${init.method ?? 'GET'} ${String(input).split('/').slice(-2).join('/')}`,
    () => fetcher(input, init),
  );

export class GitHubMergeStateUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GitHubMergeStateUnknownError';
  }
}

const readMergedCommit = async ({
  token,
  repository,
  pullRequestNumber,
  fetcher,
}: {
  token: string;
  repository: string;
  pullRequestNumber: number;
  fetcher: typeof fetch;
}) => {
  const response = await githubRequest(
    fetcher,
    `https://api.github.com/repos/${repository}/pulls/${pullRequestNumber}`,
    { headers: headers(token) },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub pull request reconciliation failed with HTTP ${response.status}.`,
    );
  }
  const payload = (await response.json()) as {
    merged?: boolean;
    merge_commit_sha?: string | null;
  };
  if (payload.merged !== true) return null;
  if (!payload.merge_commit_sha?.match(commitShaPattern)) {
    throw new Error('GitHub returned a merged pull request without a commit.');
  }
  return payload.merge_commit_sha;
};

const mergePullRequest = async ({
  token,
  repository,
  pullRequestNumber,
  headSha,
  commitTitle,
  failureLabel,
  fetcher,
}: {
  token: string;
  repository: string;
  pullRequestNumber: number;
  headSha: string;
  commitTitle: string;
  failureLabel: string;
  fetcher: typeof fetch;
}) => {
  let response: Response | null = null;
  let requestError: Error | null = null;
  try {
    response = await githubRequest(
      fetcher,
      `https://api.github.com/repos/${repository}/pulls/${pullRequestNumber}/merge`,
      {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({
          sha: headSha,
          merge_method: 'squash',
          commit_title: commitTitle,
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      merged?: boolean;
      sha?: string;
    } | null;
    if (
      response.ok &&
      payload?.merged === true &&
      payload.sha?.match(commitShaPattern)
    ) {
      return payload.sha;
    }
    requestError = new Error(
      `GitHub ${failureLabel} merge failed with HTTP ${response.status}.`,
    );
  } catch (error) {
    requestError =
      error instanceof Error
        ? error
        : new Error(`GitHub ${failureLabel} merge request failed.`);
  }

  try {
    const reconciledSha = await readMergedCommit({
      token,
      repository,
      pullRequestNumber,
      fetcher,
    });
    if (reconciledSha) return reconciledSha;
  } catch (reconciliationError) {
    throw new GitHubMergeStateUnknownError(
      `GitHub ${failureLabel} merge state could not be reconciled.`,
      { cause: reconciliationError },
    );
  }

  if (!response || response.status >= 500) {
    throw new GitHubMergeStateUnknownError(
      `GitHub ${failureLabel} merge result is ambiguous.`,
      { cause: requestError },
    );
  }
  throw requestError;
};

export interface DispatchEvolutionWorkflowOptions {
  token: string;
  execution: RepositoryMutationExecution;
  callbackUrl: string;
  callbackNonce: string;
  manifestHash: string;
  fetch?: typeof fetch;
}

export async function dispatchEvolutionWorkflow({
  token,
  execution,
  callbackUrl,
  callbackNonce,
  manifestHash,
  fetch: fetcher = fetch,
}: DispatchEvolutionWorkflowOptions) {
  const response = await githubRequest(
    fetcher,
    `https://api.github.com/repos/${execution.repository.fullName}/actions/workflows/darwin-evolve.yml/dispatches`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        ref: execution.repository.branch,
        inputs: {
          execution_id: execution.executionId,
          manifest_id: execution.manifestId,
          manifest_hash: manifestHash,
          repository: execution.repository.fullName,
          callback_url: callbackUrl,
          callback_nonce: callbackNonce,
          provenance_class: execution.provenance?.evidenceClass ?? 'legacy',
          lab_experiment_id: execution.provenance?.labExperimentId ?? '',
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub workflow dispatch failed with HTTP ${response.status}.`,
    );
  }
}

export interface DispatchRollbackWorkflowOptions {
  token: string;
  execution: RepositoryMutationExecution;
  rollback: RepositoryRollback;
  callbackUrl: string;
  callbackNonce: string;
  manifestHash: string;
  fetch?: typeof fetch;
}

export async function dispatchRollbackWorkflow({
  token,
  execution,
  rollback,
  callbackUrl,
  callbackNonce,
  manifestHash,
  fetch: fetcher = fetch,
}: DispatchRollbackWorkflowOptions) {
  const response = await githubRequest(
    fetcher,
    `https://api.github.com/repos/${execution.repository.fullName}/actions/workflows/darwin-rollback.yml/dispatches`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        ref: execution.repository.branch,
        inputs: {
          execution_id: execution.executionId,
          rollback_id: rollback.rollbackId,
          rollback_branch: rollback.branch,
          released_sha: rollback.revertedSha,
          manifest_hash: manifestHash,
          repository: execution.repository.fullName,
          callback_url: callbackUrl,
          callback_nonce: callbackNonce,
          provenance_class: execution.provenance?.evidenceClass ?? 'legacy',
          lab_experiment_id: execution.provenance?.labExperimentId ?? '',
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub rollback workflow dispatch failed with HTTP ${response.status}.`,
    );
  }
}

export interface MergeEvolutionPullRequestOptions {
  token: string;
  execution: RepositoryMutationExecution;
  fetch?: typeof fetch;
}

export async function mergeEvolutionPullRequest({
  token,
  execution,
  fetch: fetcher = fetch,
}: MergeEvolutionPullRequestOptions) {
  if (!execution.pullRequestNumber || !execution.headSha) {
    throw new Error(
      'Repository execution does not have a reviewable pull request.',
    );
  }
  return mergePullRequest({
    token,
    repository: execution.repository.fullName,
    pullRequestNumber: execution.pullRequestNumber,
    headSha: execution.headSha,
    commitTitle: `Darwin evolution: ${execution.manifestId}`,
    failureLabel: 'pull request',
    fetcher,
  });
}

export interface MergeRollbackPullRequestOptions {
  token: string;
  execution: RepositoryMutationExecution;
  rollback: RepositoryRollback;
  fetch?: typeof fetch;
}

export async function mergeRollbackPullRequest({
  token,
  execution,
  rollback,
  fetch: fetcher = fetch,
}: MergeRollbackPullRequestOptions) {
  if (!rollback.pullRequestNumber || !rollback.headSha) {
    throw new Error(
      'Repository rollback does not have a reviewable pull request.',
    );
  }
  return mergePullRequest({
    token,
    repository: execution.repository.fullName,
    pullRequestNumber: rollback.pullRequestNumber,
    headSha: rollback.headSha,
    commitTitle: `Darwin rollback: ${execution.manifestId}`,
    failureLabel: 'rollback pull request',
    fetcher,
  });
}

export interface DispatchResetWorkflowOptions {
  token: string;
  fullName: string;
  branch?: string;
  resetId: string;
  callbackUrl: string;
  callbackNonce: string;
  policyHash: string;
  fetch?: typeof fetch;
}

export async function dispatchResetWorkflow({
  token,
  fullName,
  branch = 'main',
  resetId,
  callbackUrl,
  callbackNonce,
  policyHash,
  fetch: fetcher = fetch,
}: DispatchResetWorkflowOptions) {
  const response = await githubRequest(
    fetcher,
    `https://api.github.com/repos/${fullName}/actions/workflows/darwin-reset.yml/dispatches`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        ref: branch,
        inputs: {
          reset_id: resetId,
          repository: fullName,
          callback_url: callbackUrl,
          callback_nonce: callbackNonce,
          reset_policy_hash: policyHash,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub reset dispatch failed with HTTP ${response.status}.`,
    );
  }
}

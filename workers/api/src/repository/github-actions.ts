import type {
  RepositoryMutationExecution,
  RepositoryRollback,
} from '@darwin/shared';

const headers = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'darwin-evolution-engine',
  'X-GitHub-Api-Version': '2022-11-28',
});

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
  const response = await fetcher(
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
  const response = await fetcher(
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
  const response = await fetcher(
    `https://api.github.com/repos/${execution.repository.fullName}/pulls/${execution.pullRequestNumber}/merge`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({
        sha: execution.headSha,
        merge_method: 'squash',
        commit_title: `Darwin evolution: ${execution.manifestId}`,
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    merged?: boolean;
    sha?: string;
  } | null;
  if (
    !response.ok ||
    payload?.merged !== true ||
    !payload.sha?.match(/^[a-f0-9]{40}$/)
  ) {
    throw new Error(
      `GitHub pull request merge failed with HTTP ${response.status}.`,
    );
  }
  return payload.sha;
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
  const response = await fetcher(
    `https://api.github.com/repos/${execution.repository.fullName}/pulls/${rollback.pullRequestNumber}/merge`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({
        sha: rollback.headSha,
        merge_method: 'squash',
        commit_title: `Darwin rollback: ${execution.manifestId}`,
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    merged?: boolean;
    sha?: string;
  } | null;
  if (
    !response.ok ||
    payload?.merged !== true ||
    !payload.sha?.match(/^[a-f0-9]{40}$/)
  ) {
    throw new Error(
      `GitHub rollback pull request merge failed with HTTP ${response.status}.`,
    );
  }
  return payload.sha;
}

export interface DispatchResetWorkflowOptions {
  token: string;
  fullName: string;
  branch?: string;
  fetch?: typeof fetch;
}

export async function dispatchResetWorkflow({
  token,
  fullName,
  branch = 'main',
  fetch: fetcher = fetch,
}: DispatchResetWorkflowOptions) {
  const response = await fetcher(
    `https://api.github.com/repos/${fullName}/actions/workflows/darwin-reset.yml/dispatches`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ ref: branch }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub reset dispatch failed with HTTP ${response.status}.`,
    );
  }
}

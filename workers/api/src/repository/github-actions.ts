import type { RepositoryMutationExecution } from '@darwin/shared';

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
  fetch?: typeof fetch;
}

export async function dispatchEvolutionWorkflow({
  token,
  execution,
  callbackUrl,
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
          callback_url: callbackUrl,
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

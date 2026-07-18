import { describe, expect, it } from 'vitest';

import {
  createE2EBoundaryFetch,
  e2eBaselineSha,
  e2eFixturesEnabled,
  e2eRollbackReleasedSha,
} from './e2e-fixtures';

describe('local E2E provider fixtures', () => {
  it('cannot be enabled for a deployed Worker hostname', () => {
    expect(e2eFixturesEnabled('1', 'localhost')).toBe(true);
    expect(e2eFixturesEnabled('1', '127.0.0.1')).toBe(true);
    expect(e2eFixturesEnabled('1', 'darwin-api.example.workers.dev')).toBe(
      false,
    );
    expect(e2eFixturesEnabled(undefined, 'localhost')).toBe(false);
  });

  it('stubs only known GitHub boundary requests and rejects everything else', async () => {
    const boundaryFetch = createE2EBoundaryFetch();
    const commit = await boundaryFetch(
      'https://api.github.com/repos/sjohnston1972/projectflow/commits/main',
    );
    await expect(commit.json()).resolves.toEqual({ sha: e2eBaselineSha });

    const merge = await boundaryFetch(
      'https://api.github.com/repos/sjohnston1972/projectflow/pulls/12/merge',
      {
        method: 'PUT',
        body: JSON.stringify({ commit_title: 'Darwin rollback: fixture' }),
      },
    );
    await expect(merge.json()).resolves.toMatchObject({
      merged: true,
      sha: e2eRollbackReleasedSha,
    });
    await expect(
      boundaryFetch('https://example.com/unexpected'),
    ).rejects.toThrow('Unexpected E2E provider request');
  });
});

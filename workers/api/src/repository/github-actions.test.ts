import { describe, expect, it, vi } from 'vitest';

import { createRepositoryExecution } from './execution';
import {
  dispatchEvolutionWorkflow,
  dispatchResetWorkflow,
  mergeEvolutionPullRequest,
} from './github-actions';
import type { CodexImplementationManifest } from '@darwin/shared';

describe('dispatchEvolutionWorkflow', () => {
  it('dispatches the pinned manifest without exposing the callback secret', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const execution = createRepositoryExecution({
      manifestId: 'manifest-test',
      manifestHash: 'a'.repeat(64),
      analysisId: 'analysis-test',
      mutationId: 'mutation-test',
      evidenceHash: 'b'.repeat(64),
      promptVersion: '3.0.0',
      repositoryCommit: 'c'.repeat(40),
      repository: {
        owner: 'sjohnston1972',
        name: 'projectflow',
        fullName: 'sjohnston1972/projectflow',
        url: 'https://github.com/sjohnston1972/projectflow',
        branch: 'main',
        baseSha: 'c'.repeat(40),
        sourceHash: 'd'.repeat(64),
        capturedAt: '2026-07-17T10:00:00.000Z',
        mutablePaths: ['apps/projectflow/src/**'],
        protectedPaths: ['.github/**'],
        contextPaths: ['apps/projectflow/src/App.tsx'],
        validationCommands: ['npm run verify'],
        maximumChangedFiles: 8,
        maximumChangedLines: 700,
        productionUrl: 'https://sjohnston1972.github.io/projectflow/',
        studyUrl: 'https://sjohnston1972.github.io/projectflow/?study=true',
      },
      createdAt: '2026-07-17T10:01:00.000Z',
      brief: 'Implement mutation.',
      evidenceCitations: ['EV-001'],
      allowedPaths: ['apps/projectflow/src/**'],
      protectedPaths: ['.github/**'],
      acceptanceCriteria: ['Mutation works.'],
      validationCommands: ['npm run verify'],
    } satisfies CodexImplementationManifest);

    await dispatchEvolutionWorkflow({
      token: 'github-token',
      execution,
      callbackUrl:
        'https://darwin.example/api/repository-executions/execution-test/callback',
      fetch: fetcher,
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/darwin-evolve.yml/dispatches');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer github-token',
    });
    expect(String(init?.body)).not.toContain('github-token');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      ref: 'main',
      inputs: {
        execution_id: execution.executionId,
        manifest_id: execution.manifestId,
      },
    });
  });

  it('merges only the reviewed execution head and dispatches reset', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ merged: true, sha: 'e'.repeat(40) }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const execution = {
      ...createRepositoryExecution({
        manifestId: 'manifest-merge',
        manifestHash: 'f'.repeat(64),
        analysisId: 'analysis-merge',
        mutationId: 'mutation-merge',
        evidenceHash: 'b'.repeat(64),
        promptVersion: '3.0.0',
        repositoryCommit: 'c'.repeat(40),
        repository: {
          owner: 'sjohnston1972',
          name: 'projectflow',
          fullName: 'sjohnston1972/projectflow',
          url: 'https://github.com/sjohnston1972/projectflow',
          branch: 'main',
          baseSha: 'c'.repeat(40),
          sourceHash: 'd'.repeat(64),
          capturedAt: '2026-07-17T10:00:00.000Z',
          mutablePaths: ['apps/projectflow/src/**'],
          protectedPaths: ['.github/**'],
          contextPaths: ['apps/projectflow/src/App.tsx'],
          validationCommands: ['npm run verify'],
          maximumChangedFiles: 8,
          maximumChangedLines: 700,
          productionUrl: 'https://sjohnston1972.github.io/projectflow/',
          studyUrl: 'https://sjohnston1972.github.io/projectflow/?study=true',
        },
        createdAt: '2026-07-17T10:01:00.000Z',
        brief: 'Implement mutation.',
        evidenceCitations: ['EV-001'],
        allowedPaths: ['apps/projectflow/src/**'],
        protectedPaths: ['.github/**'],
        acceptanceCriteria: ['Mutation works.'],
        validationCommands: ['npm run verify'],
      } satisfies CodexImplementationManifest),
      pullRequestNumber: 12,
      headSha: 'a'.repeat(40),
    };

    await expect(
      mergeEvolutionPullRequest({
        token: 'github-token',
        execution,
        fetch: fetcher,
      }),
    ).resolves.toBe('e'.repeat(40));
    const mergeBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(mergeBody).toMatchObject({
      sha: 'a'.repeat(40),
      merge_method: 'squash',
    });

    await dispatchResetWorkflow({
      token: 'github-token',
      fullName: 'sjohnston1972/projectflow',
      fetch: fetcher,
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      '/darwin-reset.yml/dispatches',
    );
  });
});

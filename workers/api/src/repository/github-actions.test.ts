import { describe, expect, it, vi } from 'vitest';

import {
  createRepositoryExecution,
  createRepositoryRollback,
} from './execution';
import {
  GitHubMergeStateUnknownError,
  dispatchRollbackWorkflow,
  dispatchEvolutionWorkflow,
  dispatchResetWorkflow,
  mergeRollbackPullRequest,
  mergeEvolutionPullRequest,
} from './github-actions';
import type { CodexImplementationManifest } from '@darwin/shared';

describe('dispatchEvolutionWorkflow', () => {
  it('dispatches the pinned manifest without exposing the callback secret', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const execution = createRepositoryExecution({
      provenance: {
        evidenceClass: 'darwin_lab',
        label: 'Darwin Lab',
        labExperimentId: 'experiment-test',
        taskDefinitionId: 'task-definition-test',
        taskDefinitionHash: '9'.repeat(64),
        evidencePackId: 'lab-evidence-test',
        evidenceHash: 'b'.repeat(64),
        runIds: ['run-test'],
      },
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
        productionUrl: 'https://darwin-projectflow.pages.dev/',
        studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
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
      callbackNonce: 'callback-nonce',
      manifestHash: 'a'.repeat(64),
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
        manifest_hash: 'a'.repeat(64),
        repository: 'sjohnston1972/projectflow',
        callback_nonce: 'callback-nonce',
        provenance_class: 'darwin_lab',
        lab_experiment_id: 'experiment-test',
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
          productionUrl: 'https://darwin-projectflow.pages.dev/',
          studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
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
      resetId: 'reset-test',
      callbackUrl: 'https://darwin.example/api/demo/reset/reset-test/callback',
      callbackNonce: 'reset-nonce',
      policyHash: 'b'.repeat(64),
      fetch: fetcher,
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      '/darwin-reset.yml/dispatches',
    );
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      ref: 'main',
      inputs: {
        reset_id: 'reset-test',
        repository: 'sjohnston1972/projectflow',
        callback_nonce: 'reset-nonce',
        reset_policy_hash: 'b'.repeat(64),
      },
    });
  });

  it('reconciles an ambiguous merge request from the GitHub pull request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('connection closed after request'))
      .mockResolvedValueOnce(
        Response.json({
          merged: true,
          merge_commit_sha: 'e'.repeat(40),
        }),
      );
    const execution = {
      ...createRepositoryExecution({
        manifestId: 'manifest-reconcile',
        manifestHash: '1'.repeat(64),
        analysisId: 'analysis-reconcile',
        mutationId: 'mutation-reconcile',
        evidenceHash: '2'.repeat(64),
        promptVersion: '3.0.0',
        repositoryCommit: '3'.repeat(40),
        repository: {
          owner: 'sjohnston1972',
          name: 'projectflow',
          fullName: 'sjohnston1972/projectflow',
          url: 'https://github.com/sjohnston1972/projectflow',
          branch: 'main',
          baseSha: '3'.repeat(40),
          sourceHash: '4'.repeat(64),
          capturedAt: '2026-07-17T10:00:00.000Z',
          mutablePaths: ['apps/projectflow/src/**'],
          protectedPaths: ['.github/**'],
          contextPaths: ['apps/projectflow/src/App.tsx'],
          validationCommands: ['npm run verify'],
          maximumChangedFiles: 8,
          maximumChangedLines: 700,
          productionUrl: 'https://darwin-projectflow.pages.dev/',
          studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
        },
        createdAt: '2026-07-17T10:01:00.000Z',
        brief: 'Implement mutation.',
        evidenceCitations: ['EV-001'],
        allowedPaths: ['apps/projectflow/src/**'],
        protectedPaths: ['.github/**'],
        acceptanceCriteria: ['Mutation works.'],
        validationCommands: ['npm run verify'],
      } satisfies CodexImplementationManifest),
      pullRequestNumber: 31,
      headSha: 'a'.repeat(40),
    };

    await expect(
      mergeEvolutionPullRequest({
        token: 'github-token',
        execution,
        fetch: fetcher,
      }),
    ).resolves.toBe('e'.repeat(40));
    expect(String(fetcher.mock.calls[0]?.[0]).endsWith('/merge')).toBe(true);
    expect(String(fetcher.mock.calls[1]?.[0]).endsWith('/pulls/31')).toBe(true);
    expect(fetcher.mock.calls[1]?.[1]?.method).toBeUndefined();
  });

  it('reports an unknown merge state when GitHub cannot be reconciled', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 502 }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }));
    const execution = {
      ...createRepositoryExecution({
        manifestId: 'manifest-unknown',
        manifestHash: '1'.repeat(64),
        analysisId: 'analysis-unknown',
        mutationId: 'mutation-unknown',
        evidenceHash: '2'.repeat(64),
        promptVersion: '3.0.0',
        repositoryCommit: '3'.repeat(40),
        repository: {
          owner: 'sjohnston1972',
          name: 'projectflow',
          fullName: 'sjohnston1972/projectflow',
          url: 'https://github.com/sjohnston1972/projectflow',
          branch: 'main',
          baseSha: '3'.repeat(40),
          sourceHash: '4'.repeat(64),
          capturedAt: '2026-07-17T10:00:00.000Z',
          mutablePaths: ['apps/projectflow/src/**'],
          protectedPaths: ['.github/**'],
          contextPaths: ['apps/projectflow/src/App.tsx'],
          validationCommands: ['npm run verify'],
          maximumChangedFiles: 8,
          maximumChangedLines: 700,
          productionUrl: 'https://darwin-projectflow.pages.dev/',
          studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
        },
        createdAt: '2026-07-17T10:01:00.000Z',
        brief: 'Implement mutation.',
        evidenceCitations: ['EV-001'],
        allowedPaths: ['apps/projectflow/src/**'],
        protectedPaths: ['.github/**'],
        acceptanceCriteria: ['Mutation works.'],
        validationCommands: ['npm run verify'],
      } satisfies CodexImplementationManifest),
      pullRequestNumber: 32,
      headSha: 'a'.repeat(40),
    };

    await expect(
      mergeEvolutionPullRequest({
        token: 'github-token',
        execution,
        fetch: fetcher,
      }),
    ).rejects.toBeInstanceOf(GitHubMergeStateUnknownError);
  });

  it('dispatches and merges a separately reviewable rollback', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({ merged: true, sha: 'f'.repeat(40) }),
      );
    const released = {
      ...createRepositoryExecution({
        manifestId: 'manifest-rollback',
        manifestHash: 'a'.repeat(64),
        analysisId: 'analysis-rollback',
        mutationId: 'mutation-rollback',
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
          productionUrl: 'https://darwin-projectflow.pages.dev/',
          studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
        },
        createdAt: '2026-07-17T10:01:00.000Z',
        brief: 'Implement mutation.',
        evidenceCitations: ['EV-001'],
        allowedPaths: ['apps/projectflow/src/**'],
        protectedPaths: ['.github/**'],
        acceptanceCriteria: ['Mutation works.'],
        validationCommands: ['npm run verify'],
      } satisfies CodexImplementationManifest),
      status: 'released' as const,
      headSha: 'e'.repeat(40),
    };
    const rollback = {
      ...createRepositoryRollback(released),
      pullRequestNumber: 19,
      headSha: 'a'.repeat(40),
    };

    await dispatchRollbackWorkflow({
      token: 'github-token',
      execution: released,
      rollback,
      callbackUrl:
        'https://darwin.example/api/repository-executions/execution-rollback/rollback/callback',
      callbackNonce: 'rollback-nonce',
      manifestHash: 'f'.repeat(64),
      fetch: fetcher,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/darwin-rollback.yml/dispatches',
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      inputs: {
        rollback_id: rollback.rollbackId,
        released_sha: released.headSha,
        manifest_hash: 'f'.repeat(64),
        callback_nonce: 'rollback-nonce',
      },
    });

    await expect(
      mergeRollbackPullRequest({
        token: 'github-token',
        execution: released,
        rollback,
        fetch: fetcher,
      }),
    ).resolves.toBe('f'.repeat(40));
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      sha: rollback.headSha,
      merge_method: 'squash',
    });
  });
});

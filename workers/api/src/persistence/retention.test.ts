import type {
  CodexImplementationManifest,
  EvidenceAnalysis,
  RepositoryMutationExecution,
} from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryTelemetryRepository } from './telemetry-repository';
import { retentionPolicy } from './retention';

const execution: RepositoryMutationExecution = {
  revision: 0,
  executionId: 'execution-retention-test',
  manifestId: 'manifest-retention-test',
  analysisId: 'analysis-retention-test',
  repository: {
    owner: 'sjohnston1972',
    name: 'projectflow',
    fullName: 'sjohnston1972/projectflow',
    url: 'https://github.com/sjohnston1972/projectflow',
    branch: 'main',
    baseSha: 'a'.repeat(40),
    sourceHash: 'b'.repeat(64),
    capturedAt: '2025-01-01T00:00:00.000Z',
    mutablePaths: ['apps/projectflow/src/**'],
    protectedPaths: ['.github/**'],
    contextPaths: ['AGENTS.md'],
    validationCommands: ['npm run test'],
    maximumChangedFiles: 8,
    maximumChangedLines: 700,
    productionUrl: 'https://darwin-projectflow.pages.dev/',
    studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
  },
  status: 'failed',
  branch: 'darwin/candidate-retention-test',
  baseSha: 'a'.repeat(40),
  headSha: null,
  workflowRunId: null,
  workflowUrl: null,
  pullRequestNumber: null,
  pullRequestUrl: null,
  previewUrl: null,
  patch: 'diff --git a/App.tsx b/App.tsx',
  changedFiles: ['apps/projectflow/src/App.tsx'],
  checks: [],
  codex: {
    threadId: 'thread-retention-test',
    finalMessage: 'Implemented the bounded mutation.',
    inputTokens: 100,
    cachedInputTokens: 50,
    outputTokens: 25,
  },
  rollback: null,
  error: 'Validation stopped the candidate.',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:05:00.000Z',
  completedAt: '2025-01-01T00:05:00.000Z',
};

describe('retention policy', () => {
  it('compacts large execution output before expiring the fossil record', async () => {
    const repository = new InMemoryTelemetryRepository();
    const policy = retentionPolicy();
    await repository.reset();
    await repository.saveRepositoryExecution(execution, null);

    const compacted = await repository.runRetentionSweep(
      policy,
      '2025-02-01T00:00:00.000Z',
    );
    expect(compacted).toMatchObject({
      compactedExecutions: 1,
      deleted: { executions: 0 },
    });
    await expect(
      repository.getRepositoryExecution(execution.executionId),
    ).resolves.toMatchObject({
      executionId: execution.executionId,
      patch: null,
      codex: { finalMessage: null },
    });

    const expired = await repository.runRetentionSweep(
      policy,
      '2026-01-02T00:00:00.000Z',
    );
    expect(expired.deleted.executions).toBe(1);
    await expect(
      repository.getRepositoryExecution(execution.executionId),
    ).resolves.toBeNull();
  });

  it('retains study lineage after analysis JSON expires', async () => {
    const repository = new InMemoryTelemetryRepository();
    const policy = retentionPolicy();
    await repository.reset();
    await repository.saveEvidenceAnalysis('study-retention-test', {
      analysisId: execution.analysisId,
      cacheKey: 'cache-retention-test',
      createdAt: execution.createdAt,
    } as EvidenceAnalysis);
    await repository.saveCodexManifest({
      analysisId: execution.analysisId,
      createdAt: execution.createdAt,
    } as CodexImplementationManifest);
    await repository.saveRepositoryExecution(execution, null);

    await repository.runRetentionSweep(policy, '2025-04-02T00:00:00.000Z');
    await expect(
      repository.getEvidenceAnalysis(execution.analysisId),
    ).resolves.toBeNull();
    await expect(
      repository.getRepositoryExecution(execution.executionId),
    ).resolves.not.toBeNull();

    const deleted = await repository.deleteStudy('study-retention-test');
    expect(deleted).toMatchObject({ manifests: 1, executions: 1 });
    await expect(
      repository.getRepositoryExecution(execution.executionId),
    ).resolves.toBeNull();
  });
});

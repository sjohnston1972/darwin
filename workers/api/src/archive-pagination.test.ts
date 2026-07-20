import {
  GenomeExecutionDetailResponseSchema,
  GenomeHistoryResponseSchema,
  RepositoryMutationExecutionSchema,
} from '@darwin/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleRequest } from './index';
import {
  getTelemetryRepository,
  resetInMemoryTelemetry,
} from './persistence/telemetry-repository';

const timestamp = '2026-07-18T09:00:00.000Z';
const largePatch = `@@ -1 +1 @@\n-${'a'.repeat(100_000)}\n+${'b'.repeat(100_000)}`;

const makeExecution = (index: number) =>
  RepositoryMutationExecutionSchema.parse({
    executionId: `execution-cycle-${index.toString().padStart(2, '0')}`,
    manifestId: `manifest-cycle-${index.toString().padStart(2, '0')}`,
    analysisId: `analysis-cycle-${index.toString().padStart(2, '0')}`,
    repository: {
      owner: 'darwin-test',
      name: 'projectflow',
      fullName: 'darwin-test/projectflow',
      url: 'https://github.com/darwin-test/projectflow',
      branch: 'main',
      baseSha: 'a'.repeat(40),
      sourceHash: 'b'.repeat(64),
      capturedAt: timestamp,
      mutablePaths: ['apps/projectflow/src/App.tsx'],
      protectedPaths: ['.github/**'],
      contextPaths: ['apps/projectflow/src/App.tsx'],
      validationCommands: ['npm run verify'],
      maximumChangedFiles: 4,
      maximumChangedLines: 1200,
      productionUrl: 'https://projectflow.example.com/',
      studyUrl: 'https://projectflow.example.com/?study=true',
    },
    status: 'released',
    branch: `darwin/evolution-${index}`,
    baseSha: 'a'.repeat(40),
    headSha: 'c'.repeat(40),
    workflowRunId: index + 1,
    workflowUrl: `https://github.com/darwin-test/projectflow/actions/runs/${index + 1}`,
    pullRequestNumber: index + 1,
    pullRequestUrl: `https://github.com/darwin-test/projectflow/pull/${index + 1}`,
    previewUrl: `https://preview-${index}.projectflow.example.com/`,
    patch: largePatch,
    changedFiles: ['apps/projectflow/src/App.tsx'],
    checks: [
      {
        name: 'npm run verify',
        status: 'passed',
        durationMs: 2_000,
        output: 'v'.repeat(20_000),
      },
    ],
    codex: {
      threadId: `thread-${index}`,
      finalMessage: 'c'.repeat(100_000),
      inputTokens: 10_000,
      cachedInputTokens: 8_000,
      outputTokens: 1_000,
    },
    rollback: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
  });

describe('archive pagination', () => {
  beforeEach(resetInMemoryTelemetry);
  afterEach(resetInMemoryTelemetry);

  it('keeps multi-cycle genome pages bounded and defers heavy records', async () => {
    const repository = getTelemetryRepository();
    await Promise.all(
      Array.from({ length: 31 }, (_, index) =>
        repository.saveRepositoryExecution(makeExecution(index), null),
      ),
    );
    const activeCandidate = RepositoryMutationExecutionSchema.parse({
      ...makeExecution(99),
      executionId: 'execution-active-candidate',
      manifestId: 'manifest-active-candidate',
      analysisId: 'analysis-active-candidate',
      status: 'codex_running',
      updatedAt: '2026-07-19T09:00:00.000Z',
      completedAt: null,
    });
    await repository.saveRepositoryExecution(activeCandidate, null);

    const firstResponse = await handleRequest(
      new Request('http://localhost/api/genome?limit=10'),
    );
    const firstBody = await firstResponse.text();
    const first = GenomeHistoryResponseSchema.parse(JSON.parse(firstBody));
    expect(first.executions).toHaveLength(10);
    expect(first.page.nextCursor).not.toBeNull();
    expect(firstBody.length).toBeLessThan(20_000);
    expect(firstBody).not.toContain('@@ -1 +1 @@');
    expect(first.executions[0]?.executionId).toBe('execution-cycle-30');
    expect(
      first.executions.some(
        (execution) => execution.executionId === activeCandidate.executionId,
      ),
    ).toBe(false);

    const activeDetailResponse = await handleRequest(
      new Request(`http://localhost/api/genome/${activeCandidate.executionId}`),
    );
    expect(activeDetailResponse.status).toBe(404);

    const secondResponse = await handleRequest(
      new Request(
        `http://localhost/api/genome?limit=10&cursor=${encodeURIComponent(first.page.nextCursor!)}`,
      ),
    );
    const second = GenomeHistoryResponseSchema.parse(
      await secondResponse.json(),
    );
    expect(second.executions).toHaveLength(10);
    expect(second.page.nextCursor).not.toBeNull();
    expect(
      new Set(
        [...first.executions, ...second.executions].map(
          (execution) => execution.executionId,
        ),
      ).size,
    ).toBe(20);

    const detailResponse = await handleRequest(
      new Request('http://localhost/api/genome/execution-cycle-30'),
    );
    const detailBody = await detailResponse.text();
    const detail = GenomeExecutionDetailResponseSchema.parse(
      JSON.parse(detailBody),
    );
    expect(detail.execution.patch).toBe(largePatch);
    expect(detailBody.length).toBeGreaterThan(300_000);
  });
});

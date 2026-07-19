import {
  LegacyProvenance,
  type CodexImplementationManifest,
} from '@darwin/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRepositoryExecution } from '../repository/execution';
import { InMemoryTelemetryRepository } from './telemetry-repository';

const manifest = {
  provenance: LegacyProvenance,
  manifestId: 'manifest-pagination',
  manifestHash: 'a'.repeat(64),
  analysisId: 'analysis-pagination',
  mutationId: 'mutation-pagination',
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
  brief: 'Implement the selected mutation.',
  evidenceCitations: ['EV-001'],
  allowedPaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  acceptanceCriteria: ['The behavior is implemented.'],
  validationCommands: ['npm run verify'],
} satisfies CodexImplementationManifest;

describe('artifact cursor pagination', () => {
  const repository = new InMemoryTelemetryRepository();

  beforeEach(async () => repository.reset());

  it('returns bounded stable pages across many evolution cycles', async () => {
    const base = createRepositoryExecution(manifest);
    for (let index = 0; index < 45; index += 1) {
      await repository.saveRepositoryExecution({
        ...base,
        executionId: `execution-page-${String(index).padStart(3, '0')}`,
        updatedAt: new Date(Date.UTC(2026, 6, 19, 8, 0, index)).toISOString(),
      });
    }

    const first = await repository.listRepositoryExecutionsPage(20);
    const second = await repository.listRepositoryExecutionsPage(
      20,
      first.cursor,
    );
    const third = await repository.listRepositoryExecutionsPage(
      20,
      second.cursor,
    );

    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(20);
    expect(third.items).toHaveLength(5);
    expect(first.hasMore).toBe(true);
    expect(third.hasMore).toBe(false);
    expect(
      new Set(
        [...first.items, ...second.items, ...third.items].map(
          (item) => item.executionId,
        ),
      ).size,
    ).toBe(45);
  });
});

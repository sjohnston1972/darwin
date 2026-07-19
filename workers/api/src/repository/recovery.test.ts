import type { CodexImplementationManifest } from '@darwin/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryTelemetryRepository } from '../persistence/telemetry-repository';
import {
  createRepositoryExecution,
  updateRepositoryExecution,
} from './execution';
import { forceFailStrandedExecution } from './recovery';

const manifest = {
  manifestId: 'manifest-recovery-test',
  manifestHash: 'a'.repeat(64),
  analysisId: 'analysis-recovery-test',
  mutationId: 'mutation-recovery-test',
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
    capturedAt: '2026-07-19T08:00:00.000Z',
    mutablePaths: ['apps/projectflow/src/**'],
    protectedPaths: ['.github/**'],
    contextPaths: ['apps/projectflow/src/App.tsx'],
    validationCommands: ['npm run verify'],
    maximumChangedFiles: 8,
    maximumChangedLines: 700,
    productionUrl: 'https://darwin-projectflow.pages.dev/',
    studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
  },
  createdAt: '2026-07-19T08:01:00.000Z',
  brief: 'Implement the selected mutation.',
  evidenceCitations: ['EV-001'],
  allowedPaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  acceptanceCriteria: ['The behavior is implemented.'],
  validationCommands: ['npm run verify'],
} satisfies CodexImplementationManifest;

describe('stranded execution recovery', () => {
  const repository = new InMemoryTelemetryRepository();
  beforeEach(async () => repository.reset());

  it('waits for the recovery window and atomically force-fails one queued run', async () => {
    const prepared = createRepositoryExecution(
      manifest,
      '2026-07-19T08:02:00.000Z',
    );
    const queued = updateRepositoryExecution(
      prepared,
      { status: 'queued' },
      '2026-07-19T08:02:00.000Z',
    );
    await repository.saveRepositoryExecution(prepared, null);
    await repository.saveRepositoryExecution(queued, prepared);
    await expect(
      forceFailStrandedExecution(
        repository,
        queued.executionId,
        new Date('2026-07-19T08:10:00.000Z'),
      ),
    ).resolves.toMatchObject({
      outcome: 'too_recent',
      eligibleAt: '2026-07-19T08:17:00.000Z',
    });
    await expect(
      forceFailStrandedExecution(
        repository,
        queued.executionId,
        new Date('2026-07-19T08:18:00.000Z'),
      ),
    ).resolves.toMatchObject({
      outcome: 'recovered',
      execution: { status: 'failed', revision: 2 },
    });
  });
});

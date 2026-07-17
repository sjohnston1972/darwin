import { describe, expect, it } from 'vitest';

import type { CodexImplementationManifest } from '@darwin/shared';
import {
  createRepositoryExecution,
  updateRepositoryExecution,
} from './execution';

const manifest = {
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
  brief: 'Implement the selected mutation.',
  evidenceCitations: ['EV-001'],
  allowedPaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  acceptanceCriteria: ['The behavior is implemented.'],
  validationCommands: ['npm run verify'],
} satisfies CodexImplementationManifest;

describe('repository execution state', () => {
  it('creates an execution pinned to the manifest repository', () => {
    const execution = createRepositoryExecution(
      manifest,
      '2026-07-17T10:02:00.000Z',
    );
    expect(execution.status).toBe('prepared');
    expect(execution.baseSha).toBe(manifest.repository.baseSha);
    expect(execution.branch).toBe('darwin/evolution-aaaaaaaaaaaa');
    expect(execution.checks.map((check) => check.name)).toEqual([
      'Codex patch generation',
      'npm run verify',
    ]);
  });

  it('enforces forward-only workflow transitions', () => {
    const prepared = createRepositoryExecution(manifest);
    const queued = updateRepositoryExecution(prepared, { status: 'queued' });
    const running = updateRepositoryExecution(queued, {
      status: 'codex_running',
      workflowRunId: 123,
      workflowUrl:
        'https://github.com/sjohnston1972/projectflow/actions/runs/123',
    });
    expect(running.workflowRunId).toBe(123);
    expect(() =>
      updateRepositoryExecution(running, { status: 'preview_ready' }),
    ).toThrow('codex_running -> preview_ready');
  });
});

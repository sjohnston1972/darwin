import { describe, expect, it } from 'vitest';

import type { CodexImplementationManifest } from '@darwin/shared';
import {
  createRepositoryRollback,
  createRepositoryExecution,
  retryRepositoryExecution,
  updateRepositoryRollback,
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

describe('repository execution state', () => {
  it('creates an execution pinned to the manifest repository', () => {
    const execution = createRepositoryExecution(
      manifest,
      '2026-07-17T10:02:00.000Z',
    );
    expect(execution.status).toBe('prepared');
    expect(execution.revision).toBe(0);
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
    expect(queued.revision).toBe(1);
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
    expect(() =>
      updateRepositoryExecution(running, {
        status: 'codex_running',
        headSha: 'f'.repeat(40),
      }),
    ).toThrow('immutable once recorded');
  });

  it('retries a failed workflow as a monotonic revision', () => {
    const prepared = createRepositoryExecution(manifest);
    const failed = updateRepositoryExecution(prepared, {
      status: 'failed',
      error: 'Transient workflow failure.',
    });
    const retry = retryRepositoryExecution(
      failed,
      manifest,
      '2026-07-17T10:03:00.000Z',
    );

    expect(retry).toMatchObject({
      executionId: failed.executionId,
      status: 'prepared',
      revision: failed.revision + 1,
      error: null,
      createdAt: '2026-07-17T10:03:00.000Z',
    });
    expect(() => retryRepositoryExecution(prepared, manifest)).toThrow(
      'Only a failed repository execution can be retried.',
    );
  });

  it('prepares a rollback only from a retained commit and enforces its review path', () => {
    const prepared = createRepositoryExecution(manifest);
    const queued = updateRepositoryExecution(prepared, { status: 'queued' });
    const running = updateRepositoryExecution(queued, {
      status: 'codex_running',
    });
    const validating = updateRepositoryExecution(running, {
      status: 'validating',
    });
    const review = updateRepositoryExecution(validating, {
      status: 'pull_request_open',
      headSha: 'e'.repeat(40),
      pullRequestNumber: 7,
      pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/7',
    });
    const preview = updateRepositoryExecution(review, {
      status: 'preview_ready',
      previewUrl: 'https://darwin-projectflow.pages.dev/?study=true',
    });
    const releasing = updateRepositoryExecution(preview, {
      status: 'releasing',
    });
    const released = updateRepositoryExecution(releasing, {
      status: 'released',
      headSha: 'f'.repeat(40),
    });

    const rollback = createRepositoryRollback(
      released,
      '2026-07-17T10:02:00.000Z',
    );
    expect(rollback).toMatchObject({
      status: 'prepared',
      branch: 'darwin/rollback-ffffffffffff',
      revertedSha: 'f'.repeat(40),
    });

    const preparedRollback = { ...released, rollback };
    const queuedRollback = updateRepositoryRollback(preparedRollback, {
      status: 'queued',
    });
    const validatingRollback = updateRepositoryRollback(queuedRollback, {
      status: 'validating',
    });
    expect(validatingRollback.rollback?.status).toBe('validating');
    expect(() =>
      updateRepositoryRollback(validatingRollback, { status: 'released' }),
    ).toThrow('validating -> released');
    expect(() =>
      updateRepositoryRollback(validatingRollback, {
        status: 'validating',
        headSha: 'e'.repeat(40),
      }),
    ).toThrow('immutable once recorded');
  });
});

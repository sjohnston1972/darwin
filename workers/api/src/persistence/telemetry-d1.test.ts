import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare } from 'miniflare';
import type { CodexImplementationManifest } from '@darwin/shared';

import {
  createRepositoryExecution,
  updateRepositoryExecution,
} from '../repository/execution';
import { D1TelemetryRepository } from './telemetry-repository';

const schema = `
  CREATE TABLE telemetry_events (
    event_id TEXT PRIMARY KEY, study_id TEXT NOT NULL, participant_id TEXT NOT NULL,
    session_id TEXT NOT NULL, task_attempt_id TEXT, app_version TEXT NOT NULL,
    source TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
    sequence INTEGER NOT NULL, event_type TEXT NOT NULL, route TEXT NOT NULL,
    target_id TEXT, event_json TEXT NOT NULL, expires_at TEXT
  );
  CREATE TABLE repository_executions (
    execution_id TEXT PRIMARY KEY, manifest_id TEXT NOT NULL UNIQUE,
    analysis_id TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL,
    execution_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
    created_at TEXT, artifact_expires_at TEXT, record_expires_at TEXT,
    study_id TEXT
  );
  CREATE TABLE evidence_analyses (
    analysis_id TEXT PRIMARY KEY, study_id TEXT NOT NULL
  );
`;

const manifest = {
  manifestId: 'manifest-d1-test',
  manifestHash: 'a'.repeat(64),
  analysisId: 'analysis-d1-test',
  mutationId: 'mutation-d1-test',
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
  brief: 'Implement mutation.',
  evidenceCitations: ['EV-001'],
  allowedPaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  acceptanceCriteria: ['Implemented.'],
  validationCommands: ['npm run verify'],
} satisfies CodexImplementationManifest;

describe('D1 telemetry repository boundaries', () => {
  let miniflare: Miniflare;
  let database: D1Database;
  let repository: D1TelemetryRepository;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: `export default { fetch() { return new Response('ok') } }`,
      d1Databases: { DB: crypto.randomUUID() },
    });
    database = (await miniflare.getD1Database('DB')) as unknown as D1Database;
    await database.exec(schema.replace(/\s*\n\s*/g, ' '));
    repository = new D1TelemetryRepository(database);
  });

  afterEach(async () => miniflare.dispose());

  it('permits exactly one compare-and-swap execution transition', async () => {
    const prepared = createRepositoryExecution(
      manifest,
      '2026-07-19T08:02:00.000Z',
    );
    expect(await repository.saveRepositoryExecution(prepared, null)).toBe(true);
    const queued = updateRepositoryExecution(prepared, { status: 'queued' });
    const failed = updateRepositoryExecution(prepared, {
      status: 'failed',
      error: 'dispatch failed',
    });
    const results = await Promise.all([
      repository.saveRepositoryExecution(queued, prepared),
      repository.saveRepositoryExecution(failed, prepared),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await repository.getRepositoryExecution(prepared.executionId))?.revision,
    ).toBe(1);
  });

  it('fails closed with the poisoned record identity but not its JSON contents', async () => {
    const recordId = '00000000-0000-4000-a000-000000000001';
    await database
      .prepare(
        `INSERT INTO telemetry_events VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
      )
      .bind(
        recordId,
        'study-d1-test',
        'participant-d1-test',
        'session-d1-test',
        '1.0.0',
        'real_user',
        '2026-07-19T08:00:00.000Z',
        '2026-07-19T08:00:01.000Z',
        0,
        'page_view',
        '/dashboard',
        '{"private":"must-not-leak"}',
      )
      .run();
    await expect(repository.listEvents('study-d1-test', 10)).rejects.toThrow(
      recordId,
    );
    await expect(
      repository.listEvents('study-d1-test', 10),
    ).rejects.not.toThrow('must-not-leak');
  });
});

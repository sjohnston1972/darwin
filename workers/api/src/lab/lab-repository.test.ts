import {
  LabAgentActionRecordSchema,
  LabAgentRunSchema,
  LabExperimentSchema,
  type DarwinProvenance,
  type LabAgentRun,
} from '@darwin/shared';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { D1LabRepository } from './lab-repository';

const now = '2026-07-19T08:00:00.000Z';
const taskHash = 'a'.repeat(64);
const experimentId = 'lab-exp-atomic-test';
const provenance: DarwinProvenance = {
  evidenceClass: 'darwin_lab',
  label: 'Darwin Lab',
  labExperimentId: experimentId,
  taskDefinitionId: 'lab-task-atomic-test',
  taskDefinitionHash: taskHash,
  evidencePackId: null,
  evidenceHash: null,
  runIds: [],
};

const schema = `
CREATE TABLE lab_experiments (
  experiment_id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL
);
CREATE TABLE lab_agent_runs (
  run_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
  population_ordinal INTEGER NOT NULL, status TEXT NOT NULL, persona TEXT NOT NULL,
  participant_id TEXT NOT NULL, session_id TEXT NOT NULL, started_at TEXT NOT NULL,
  finished_at TEXT, payload_json TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_lab_run_population_slot
  ON lab_agent_runs(experiment_id, population_ordinal);
CREATE TABLE lab_agent_actions (
  action_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, experiment_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL, occurred_at TEXT NOT NULL, action_type TEXT NOT NULL,
  outcome TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_lab_action_ordinal ON lab_agent_actions(run_id, ordinal);
CREATE TABLE lab_evidence_records (
  evidence_pack_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL, generated_at TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE TABLE lab_analyses (
  analysis_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
  evidence_pack_id TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE lab_selection_results (
  selection_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL, selected_at TEXT NOT NULL, payload_json TEXT NOT NULL
);`;

const experiment = LabExperimentSchema.parse({
  experimentId,
  studyId: 'projectflow-darwin-lab-atomic',
  name: 'Atomic Lab persistence',
  targetUrl: 'http://localhost:5174/',
  targetAppVersion: '1.0.0',
  task: {
    taskDefinitionId: 'lab-task-atomic-test',
    definitionVersion: 1,
    definitionHash: taskHash,
    taskId: 'open-projects',
    name: 'Open projects',
    instruction: 'Open the projects directory.',
    successDescription: 'The projects route is reached.',
    startRoute: '/study/dashboard',
    successCriterion: { type: 'route_reached', route: '/study/projects' },
  },
  populationSize: 8,
  personaAllocation: [{ persona: 'novice', count: 8 }],
  maxActions: 12,
  maxDurationMs: 180_000,
  seed: 1859,
  status: 'running',
  runnerId: 'runner-one',
  createdAt: now,
  startedAt: now,
  completedAt: null,
  runs: [],
  evidence: null,
  analysis: null,
  selection: null,
  error: null,
  evidenceError: null,
  archivedAt: null,
  version: 0,
  provenance,
});

const makeRun = (runId: string, populationOrdinal: number): LabAgentRun =>
  LabAgentRunSchema.parse({
    runId,
    experimentId,
    participantId: `participant-${populationOrdinal}`,
    sessionId: `session-${populationOrdinal}`,
    persona: 'novice',
    viewport: { class: 'desktop', width: 1440, height: 960 },
    agentModel: 'gpt-5.6-luna',
    status: 'running',
    startedAt: now,
    finishedAt: null,
    durationMs: null,
    taskOutcome: 'open',
    frictionLabels: [],
    telemetryEventIds: [],
    actions: [],
    error: null,
    populationOrdinal,
    studyId: experiment.studyId,
    taskDefinitionId: experiment.task.taskDefinitionId,
    taskDefinitionHash: taskHash,
    appVersion: experiment.targetAppVersion,
    provenance: { ...provenance, runIds: [runId] },
  });

describe('D1 Darwin Lab atomic persistence', () => {
  let miniflare: Miniflare;
  let repository: D1LabRepository;
  let database: D1Database;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: `export default { fetch() { return new Response('ok') } }`,
      d1Databases: { DB: crypto.randomUUID() },
    });
    database = (await miniflare.getD1Database('DB')) as unknown as D1Database;
    await database.exec(schema.replace(/\s*\n\s*/g, ' '));
    repository = new D1LabRepository(database);
    await repository.saveExperiment(experiment);
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it('allows only one concurrent experiment transition', async () => {
    const first = LabExperimentSchema.parse({
      ...experiment,
      status: 'completed',
      completedAt: now,
    });
    const second = LabExperimentSchema.parse({
      ...experiment,
      status: 'failed',
      completedAt: now,
      error: 'runner failed',
    });

    const outcomes = await Promise.all([
      repository.compareAndSwapExperiment(experiment, first),
      repository.compareAndSwapExperiment(experiment, second),
    ]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect((await repository.getExperiment(experimentId))?.version).toBe(1);
  });

  it('enforces unique population slots and idempotent action appends', async () => {
    const runOne = makeRun('lab-run-one', 1);
    const runTwo = makeRun('lab-run-two', 1);
    const runResults = await Promise.all([
      repository.createRun(experiment, runOne),
      repository.createRun(experiment, runTwo),
    ]);
    const winner = runResults.find((run): run is LabAgentRun => Boolean(run))!;
    const action = LabAgentActionRecordSchema.parse({
      actionId: 'lab-action-one',
      ordinal: 1,
      occurredAt: now,
      action: 'click',
      targetId: 'nav-projects',
      targetRole: 'button',
      inputLength: null,
      key: null,
      expectation: 'Projects should open.',
      fromUrl: 'http://localhost:5174/study/dashboard',
      toUrl: 'http://localhost:5174/study/projects',
      durationMs: 120,
      outcome: 'changed',
      accessibilityNodeCount: 20,
      telemetryEventIds: [],
      error: null,
      provenance: { ...provenance, runIds: [winner.runId] },
    });

    expect(runResults.filter(Boolean)).toHaveLength(1);
    expect(
      await repository.appendAction(experimentId, winner.runId, action),
    ).toBe('created');
    expect(
      await repository.appendAction(experimentId, winner.runId, action),
    ).toBe('existing');
    expect(
      await repository.appendAction(experimentId, winner.runId, {
        ...action,
        actionId: 'lab-action-conflict',
      }),
    ).toBe('conflict');
  });

  it('makes terminal run retries safe without overwriting the winner', async () => {
    const running = makeRun('lab-run-finish', 2);
    await repository.createRun(experiment, running);
    const succeeded = LabAgentRunSchema.parse({
      ...running,
      status: 'succeeded',
      finishedAt: now,
      durationMs: 1_000,
      taskOutcome: 'success',
    });
    const failed = LabAgentRunSchema.parse({
      ...running,
      status: 'failed',
      finishedAt: now,
      durationMs: 1_000,
      taskOutcome: 'failed',
      error: 'different result',
    });

    const results = await Promise.all([
      repository.finishRun(experimentId, running, succeeded),
      repository.finishRun(experimentId, running, failed),
    ]);
    const winner = results.find((run): run is LabAgentRun => Boolean(run))!;

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await repository.finishRun(experimentId, running, winner),
    ).toMatchObject({ runId: running.runId, status: winner.status });
    expect(
      (await repository.getExperiment(experimentId))?.runs[0]?.status,
    ).toBe(winner.status);
  });

  it('fails closed on poisoned persisted JSON without echoing row contents', async () => {
    await database
      .prepare(
        'UPDATE lab_experiments SET payload_json = ? WHERE experiment_id = ?',
      )
      .bind('{"secret":"do-not-reflect"}', experimentId)
      .run();

    await expect(repository.getExperiment(experimentId)).rejects.toThrow(
      `Stored Lab experiment record ${experimentId} is corrupt.`,
    );
    await expect(repository.getExperiment(experimentId)).rejects.not.toThrow(
      'do-not-reflect',
    );
  });
});

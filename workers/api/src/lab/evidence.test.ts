import { LabExperimentSchema, type LabAgentRun } from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { buildLabEvidence } from './evidence';

const timestamp = '2026-07-18T10:00:00.000Z';

const makeRun = (index: number): LabAgentRun => ({
  runId: `lab-run-${index}`,
  experimentId: 'lab-exp-test',
  participantId: `lab-agent-${index}`,
  sessionId: `lab-session-${index}`,
  persona: index % 2 ? 'novice' : 'search_first',
  viewport: { class: 'desktop', width: 1440, height: 960 },
  agentModel: 'gpt-5.6-luna',
  status: index === 8 ? 'abandoned' : 'failed',
  startedAt: timestamp,
  finishedAt: '2026-07-18T10:01:00.000Z',
  durationMs: 60_000,
  taskOutcome: index === 8 ? 'abandoned' : 'failed',
  frictionLabels: [],
  telemetryEventIds: [],
  actions: [
    {
      actionId: `lab-action-${index}`,
      ordinal: 1,
      occurredAt: timestamp,
      action: 'click',
      targetId: 'nav-projects',
      targetRole: 'button',
      inputLength: null,
      key: null,
      expectation: 'The projects directory should open.',
      fromUrl: 'http://localhost:5174/?lab=true',
      toUrl: 'http://localhost:5174/?lab=true',
      durationMs: 250,
      outcome: 'unchanged',
      accessibilityNodeCount: 80,
      telemetryEventIds: [],
      error: null,
    },
  ],
  error: null,
});

const experiment = LabExperimentSchema.parse({
  experimentId: 'lab-exp-test',
  studyId: 'projectflow-darwin-lab-test',
  name: 'Evidence test',
  targetUrl: 'http://localhost:5174/',
  task: {
    taskId: 'find-apollo-assignees',
    name: 'Find Project Apollo assignees',
    instruction: 'Find everyone assigned to Project Apollo.',
    successDescription:
      'The agent identifies the complete Project Apollo assignment set.',
  },
  populationSize: 8,
  maxActions: 12,
  maxDurationMs: 180_000,
  seed: 1859,
  status: 'completed',
  runnerId: 'lab-runner-test',
  createdAt: timestamp,
  startedAt: timestamp,
  completedAt: '2026-07-18T10:02:00.000Z',
  runs: Array.from({ length: 8 }, (_, index) => makeRun(index + 1)),
  evidence: null,
  analysis: null,
  selection: null,
  error: null,
});

describe('Darwin Lab deterministic evidence', () => {
  it('builds a reproducible synthetic-only evidence pack', async () => {
    const first = await buildLabEvidence(experiment, timestamp);
    const second = await buildLabEvidence(
      experiment,
      '2026-07-18T11:00:00.000Z',
    );

    expect(first.evidenceClass).toBe('synthetic');
    expect(first.evidenceHash).toBe(second.evidenceHash);
    expect(first.population).toMatchObject({ completed: 8, abandoned: 1 });
    expect(first.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detector: 'dead_click', severity: 'high' }),
        expect.objectContaining({ detector: 'false_affordance' }),
        expect.objectContaining({ detector: 'abandonment' }),
      ]),
    );
    expect(first.limitations.join(' ')).toContain('not human participants');
  });
});

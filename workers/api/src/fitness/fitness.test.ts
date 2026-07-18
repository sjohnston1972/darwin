import type { EvidencePack, RepositoryMutationExecution } from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { calculateFitnessOutcome, invalidateFitnessOutcome } from './fitness';

const baselineCommit = 'a'.repeat(40);
const evolvedCommit = 'b'.repeat(40);
const taskIds = [
  'create-project',
  'create-assigned-task',
  'find-assigned-task',
];

const pack = ({
  evolved = false,
  sessions = 3,
  appVersion = evolved
    ? evolvedCommit.slice(0, 12)
    : baselineCommit.slice(0, 12),
}: {
  evolved?: boolean;
  sessions?: number;
  appVersion?: string;
} = {}) =>
  ({
    evidenceId: evolved ? 'evidence-evolved' : 'evidence-baseline',
    evidenceHash: (evolved ? 'e' : 'd').repeat(64),
    evidenceClass: 'measured',
    study: {
      studyId: 'projectflow-baseline-study',
      appVersion,
      measuredCommit: evolved ? evolvedCommit : baselineCommit,
      participants: sessions,
      sessions,
    },
    taskAttempts: taskIds.map((taskId, index) => ({
      taskId,
      participantId: `participant-${index}`,
      sessionId: `session-${index}`,
      outcome: evolved || index < 2 ? 'success' : 'failed',
      interactionCount: evolved ? [3, 5, 3][index] : [7, 9, 6][index],
    })),
    tasks: taskIds.map((taskId, index) => ({
      taskId,
      optimalInteractions: [3, 5, 3][index],
      medianDurationMs: evolved
        ? [25_000, 28_000, 12_000][index]
        : [55_000, 60_000, 32_000][index],
    })),
    journeys: [
      {
        events: evolved
          ? []
          : [
              { eventType: 'validation_error' },
              { eventType: 'validation_error' },
            ],
      },
    ],
  }) as unknown as EvidencePack;

const execution = {
  executionId: 'execution-fitness-test',
  status: 'released',
  baseSha: baselineCommit,
  headSha: evolvedCommit,
  deploymentVerification: {
    observedCommit: evolvedCommit,
    observedAppVersion: evolvedCommit.slice(0, 12),
  },
  rollback: null,
} as RepositoryMutationExecution;

describe('versioned fitness model', () => {
  it('calculates a deterministic weighted 0-100 outcome', () => {
    const outcome = calculateFitnessOutcome({
      execution,
      baselinePack: pack(),
      evolvedPack: pack({ evolved: true }),
      generatedAt: '2026-07-18T12:00:00.000Z',
    });

    expect(outcome).toMatchObject({
      executionId: execution.executionId,
      formulaVersion: '1.0.0',
      status: 'measured',
      limitations: [],
    });
    expect(outcome.components).toHaveLength(5);
    expect(
      outcome.components.reduce(
        (total, component) => total + component.weight,
        0,
      ),
    ).toBe(100);
    expect(outcome.evolvedScore).toBeGreaterThan(outcome.baselineScore!);
    expect(outcome.delta).toBe(outcome.evolvedScore! - outcome.baselineScore!);
  });

  it('persists gates instead of scoring incompatible or undersized cohorts', () => {
    const outcome = calculateFitnessOutcome({
      execution,
      baselinePack: pack(),
      evolvedPack: pack({
        evolved: true,
        sessions: 1,
        appVersion: baselineCommit.slice(0, 12),
      }),
    });

    expect(outcome.status).toBe('insufficient');
    expect(outcome.components).toEqual([]);
    expect(outcome.delta).toBeNull();
    expect(outcome.limitations).toEqual(
      expect.arrayContaining([
        'Baseline and evolved application versions must differ.',
        'Evolved requires at least 3 sessions.',
        'Evolved requires at least 3 participants.',
      ]),
    );
  });

  it('stops a retained comparison after rollback', () => {
    const measured = calculateFitnessOutcome({
      execution,
      baselinePack: pack(),
      evolvedPack: pack({ evolved: true }),
    });
    const invalidated = invalidateFitnessOutcome(
      measured,
      '2026-07-18T13:00:00.000Z',
    );

    expect(invalidated).toMatchObject({
      status: 'rolled_back',
      baselineScore: null,
      evolvedScore: null,
      delta: null,
      components: [],
      invalidatedAt: '2026-07-18T13:00:00.000Z',
    });
  });
});

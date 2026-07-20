import { describe, expect, it, vi } from 'vitest';

import {
  boundLabRunnerError,
  deriveFrictionLabels,
  labActionTimeoutMs,
  labTargetUrl,
  reconcileSessionEventIds,
  retryFinishOperation,
  seededPersonas,
} from './runner';
import type { LabAgentActionRecord, LabExperiment } from '@darwin/shared';

const experiment = {
  seed: 1859,
  populationSize: 4,
  personaAllocation: [
    { persona: 'novice', count: 2 },
    { persona: 'keyboard_first', count: 2 },
  ],
  targetUrl: 'https://projectflow.example/dashboard',
  studyId: 'projectflow-darwin-lab',
  experimentId: 'lab-experiment-test',
  targetAppVersion: '0123456789abcdef0123456789abcdef01234567',
  task: {
    taskId: 'task-find-work',
    taskDefinitionId: 'task-definition-find-work',
    definitionHash: 'a'.repeat(64),
    startRoute: '/tasks',
  },
} as LabExperiment;

describe('Darwin Lab runner', () => {
  it('bounds stale browser targets well below the experiment duration budget', () => {
    expect(labActionTimeoutMs).toBe(5_000);
    expect(labActionTimeoutMs).toBeLessThan(30_000);
  });

  it('keeps runner failures distinct and safe for the Lab record', () => {
    expect(boundLabRunnerError(new Error('x'.repeat(700)), 'fallback')).toBe(
      'x'.repeat(500),
    );
    expect(boundLabRunnerError('unknown failure', 'fallback')).toBe('fallback');
  });

  it('preserves the telemetry high-water mark across a transient read failure', () => {
    const known = new Set(['event-1', 'event-2']);
    const failed = reconcileSessionEventIds(known, null);
    expect([...failed.knownEventIds]).toEqual(['event-1', 'event-2']);
    expect(failed.newEventIds).toEqual([]);

    const recovered = reconcileSessionEventIds(failed.knownEventIds, [
      'event-1',
      'event-2',
      'event-3',
    ]);
    expect(recovered.newEventIds).toEqual(['event-3']);
  });

  it('creates a deterministic allocated population and a provenance-bound target URL', () => {
    expect(seededPersonas(experiment)).toEqual(seededPersonas(experiment));
    expect(seededPersonas(experiment).sort()).toEqual([
      'keyboard_first',
      'keyboard_first',
      'novice',
      'novice',
    ]);

    const url = new URL(
      labTargetUrl(
        experiment,
        'lab-run-test',
        'lab-agent-01',
        'lab-session-test',
      ),
    );
    expect(url.origin + url.pathname).toBe('https://projectflow.example/tasks');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      lab: 'true',
      source: 'automated',
      experimentId: 'lab-experiment-test',
      runId: 'lab-run-test',
      taskDefinitionHash: 'a'.repeat(64),
      appVersion: experiment.targetAppVersion,
    });
  });

  it('retries terminal persistence without losing the eventual acknowledgement', async () => {
    const operation = vi
      .fn<() => Promise<{ status: string }>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('provider'))
      .mockResolvedValue({ status: 'stored' });
    const wait = vi.fn(async () => undefined);

    await expect(
      retryFinishOperation(operation, [0, 10, 20], wait),
    ).resolves.toEqual({ status: 'stored' });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('derives bounded friction labels from semantic action outcomes', () => {
    const action = (overrides: Partial<LabAgentActionRecord>) =>
      ({
        action: 'click',
        targetId: 'global-search',
        outcome: 'unchanged',
        toUrl: 'https://projectflow.example/tasks',
        ...overrides,
      }) as LabAgentActionRecord;
    const actions = [
      action({}),
      action({ toUrl: 'https://projectflow.example/projects' }),
      action({ toUrl: 'https://projectflow.example/tasks' }),
    ];

    expect(deriveFrictionLabels({ actions }, 'abandoned').sort()).toEqual([
      'abandonment',
      'dead_click',
      'navigation_loop',
      'search_failure',
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  freeformLabTask,
  isExecutableLabTask,
  isSupportedProjectFlowLabTask,
  LabExperimentCreateRequestSchema,
  LabTaskInputSchema,
  PROJECTFLOW_LAB_TASKS,
} from './lab-contracts';

describe('ProjectFlow Lab tasks', () => {
  it('exposes exactly three executable tasks with deterministic workflow oracles', () => {
    expect(PROJECTFLOW_LAB_TASKS).toHaveLength(3);
    expect(new Set(PROJECTFLOW_LAB_TASKS.map((task) => task.taskId)).size).toBe(
      3,
    );
    for (const task of PROJECTFLOW_LAB_TASKS) {
      const parsed = LabTaskInputSchema.parse(task);
      expect(parsed.successCriterion).toMatchObject({
        type: 'workflow_outcome',
        outcome: 'success',
      });
      expect(isSupportedProjectFlowLabTask(parsed)).toBe(true);
      expect(isExecutableLabTask(parsed)).toBe(true);
    }
  });

  it('rejects a preset whose oracle has been altered', () => {
    expect(
      isSupportedProjectFlowLabTask({
        ...PROJECTFLOW_LAB_TASKS[0],
        successCriterion: {
          type: 'route_reached',
          route: '/study/my-work',
        },
      }),
    ).toBe(false);
  });
});

describe('free-text goals', () => {
  it('accepts a bare goal and leaves task/target for the server to resolve', () => {
    const parsed = LabExperimentCreateRequestSchema.parse({
      goal: 'Find the task assigned to me and open it',
    });
    expect(parsed.goal).toBe('Find the task assigned to me and open it');
    expect(parsed.task).toBeUndefined();
    expect(parsed.targetUrl).toBeUndefined();
  });

  it('builds a best-effort task that is executable but not a verified preset', () => {
    const task = LabTaskInputSchema.parse(
      freeformLabTask('Create a project called Polaris Launch'),
    );
    expect(task.successCriterion).toEqual({ type: 'best_effort' });
    expect(task.startRoute).toBe('/');
    expect(task.instruction).toBe('Create a project called Polaris Launch');
    expect(isExecutableLabTask(task)).toBe(true);
    expect(isSupportedProjectFlowLabTask(task)).toBe(false);
  });
});

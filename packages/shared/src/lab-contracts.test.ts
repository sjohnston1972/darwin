import { describe, expect, it } from 'vitest';

import {
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
    }
  });

  it('defaults new experiments to a supported task and rejects altered oracles', () => {
    expect(
      isSupportedProjectFlowLabTask(
        LabExperimentCreateRequestSchema.parse({
          targetUrl: 'https://projectflow.example/',
        }).task,
      ),
    ).toBe(true);
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

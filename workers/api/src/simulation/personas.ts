import type { Persona, WorkflowGoal } from '@darwin/shared';

import type { WeightedOption } from './prng';
import { SeededRandom } from './prng';

export interface PersonaDefinition {
  id: Persona;
  label: string;
  weight: number;
  goals: readonly WeightedOption<WorkflowGoal>[];
}

export const personaDefinitions: readonly PersonaDefinition[] = [
  {
    id: 'project_manager',
    label: 'Project manager',
    weight: 30,
    goals: [
      { value: 'find_assigned_tasks', weight: 28 },
      { value: 'create_task', weight: 27 },
      { value: 'review_project_health', weight: 30 },
      { value: 'review_reports', weight: 15 },
    ],
  },
  {
    id: 'developer',
    label: 'Developer',
    weight: 45,
    goals: [
      { value: 'find_assigned_tasks', weight: 44 },
      { value: 'update_task', weight: 42 },
      { value: 'review_project_health', weight: 14 },
    ],
  },
  {
    id: 'executive',
    label: 'Executive',
    weight: 15,
    goals: [
      { value: 'review_reports', weight: 62 },
      { value: 'review_project_health', weight: 30 },
      { value: 'find_assigned_tasks', weight: 8 },
    ],
  },
  {
    id: 'administrator',
    label: 'Administrator',
    weight: 10,
    goals: [
      { value: 'manage_members', weight: 52 },
      { value: 'configure_workspace', weight: 38 },
      { value: 'review_reports', weight: 10 },
    ],
  },
];

export const choosePersonaAndGoal = (random: SeededRandom) => {
  const persona = random.weighted(
    personaDefinitions.map((definition) => ({
      value: definition,
      weight: definition.weight,
    })),
  );

  return {
    persona: persona.id,
    goal: random.weighted(persona.goals),
  };
};

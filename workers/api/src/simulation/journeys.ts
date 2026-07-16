import type {
  OrganismVariant,
  Persona,
  TelemetryEvent,
  WorkflowGoal,
} from '@darwin/shared';

import { SeededRandom } from './prng';

type EventDraft = Omit<TelemetryEvent, 'id' | 'runId' | 'timestamp'>;

interface JourneyProfile {
  routes: readonly string[];
  completionProbability: number;
  backtrackProbability: number;
  secondBacktrackProbability: number;
  searchProbability: number;
  validationProbability: number;
}

const baselineProfiles: Record<WorkflowGoal, JourneyProfile> = {
  find_assigned_tasks: {
    routes: [
      '/dashboard',
      '/projects',
      '/projects/atlas',
      '/projects',
      '/tasks',
    ],
    completionProbability: 0.64,
    backtrackProbability: 0.76,
    secondBacktrackProbability: 0.34,
    searchProbability: 0.84,
    validationProbability: 0.03,
  },
  create_task: {
    routes: [
      '/dashboard',
      '/projects',
      '/projects/atlas',
      '/projects/atlas/tasks',
      '/projects/atlas/tasks/new',
    ],
    completionProbability: 0.72,
    backtrackProbability: 0.42,
    secondBacktrackProbability: 0.15,
    searchProbability: 0.1,
    validationProbability: 0.25,
  },
  update_task: {
    routes: [
      '/dashboard',
      '/projects',
      '/projects/atlas',
      '/tasks',
      '/tasks/ATL-142',
    ],
    completionProbability: 0.76,
    backtrackProbability: 0.58,
    secondBacktrackProbability: 0.2,
    searchProbability: 0.71,
    validationProbability: 0.14,
  },
  review_project_health: {
    routes: ['/dashboard', '/projects', '/projects/atlas'],
    completionProbability: 0.88,
    backtrackProbability: 0.18,
    secondBacktrackProbability: 0.03,
    searchProbability: 0.03,
    validationProbability: 0.01,
  },
  review_reports: {
    routes: ['/dashboard', '/reports'],
    completionProbability: 0.91,
    backtrackProbability: 0.08,
    secondBacktrackProbability: 0,
    searchProbability: 0.01,
    validationProbability: 0,
  },
  manage_members: {
    routes: ['/dashboard', '/settings', '/settings/members'],
    completionProbability: 0.86,
    backtrackProbability: 0.16,
    secondBacktrackProbability: 0.03,
    searchProbability: 0.02,
    validationProbability: 0.08,
  },
  configure_workspace: {
    routes: ['/dashboard', '/settings', '/settings/workspace'],
    completionProbability: 0.82,
    backtrackProbability: 0.19,
    secondBacktrackProbability: 0.04,
    searchProbability: 0.02,
    validationProbability: 0.12,
  },
};

const evolvedProfiles: Record<WorkflowGoal, JourneyProfile> = {
  find_assigned_tasks: {
    routes: ['/my-work'],
    completionProbability: 0.94,
    backtrackProbability: 0.03,
    secondBacktrackProbability: 0,
    searchProbability: 0.27,
    validationProbability: 0.01,
  },
  create_task: {
    routes: ['/my-work', '/quick-task'],
    completionProbability: 0.93,
    backtrackProbability: 0.05,
    secondBacktrackProbability: 0,
    searchProbability: 0.04,
    validationProbability: 0.06,
  },
  update_task: {
    routes: ['/my-work', '/tasks/ATL-142'],
    completionProbability: 0.94,
    backtrackProbability: 0.05,
    secondBacktrackProbability: 0,
    searchProbability: 0.21,
    validationProbability: 0.04,
  },
  review_project_health: {
    routes: ['/my-work', '/projects', '/projects/atlas'],
    completionProbability: 0.95,
    backtrackProbability: 0.06,
    secondBacktrackProbability: 0.01,
    searchProbability: 0.03,
    validationProbability: 0.01,
  },
  review_reports: {
    routes: ['/my-work', '/insights'],
    completionProbability: 0.96,
    backtrackProbability: 0.02,
    secondBacktrackProbability: 0,
    searchProbability: 0.01,
    validationProbability: 0,
  },
  manage_members: {
    routes: ['/my-work', '/settings', '/settings/members'],
    completionProbability: 0.92,
    backtrackProbability: 0.07,
    secondBacktrackProbability: 0.01,
    searchProbability: 0.02,
    validationProbability: 0.05,
  },
  configure_workspace: {
    routes: ['/my-work', '/settings', '/settings/workspace'],
    completionProbability: 0.93,
    backtrackProbability: 0.07,
    secondBacktrackProbability: 0.01,
    searchProbability: 0.02,
    validationProbability: 0.06,
  },
};

const draft = (
  sessionId: string,
  persona: Persona,
  variant: OrganismVariant,
  goal: WorkflowGoal,
  type: TelemetryEvent['type'],
  route: string,
  target?: string,
  durationMs?: number,
): EventDraft => ({
  sessionId,
  persona,
  variant,
  goal,
  type,
  route,
  ...(target ? { target } : {}),
  ...(durationMs === undefined ? {} : { durationMs }),
});

export const generateJourney = (
  sessionId: string,
  persona: Persona,
  goal: WorkflowGoal,
  variant: OrganismVariant,
  random: SeededRandom,
): EventDraft[] => {
  const profile =
    variant === 'baseline' ? baselineProfiles[goal] : evolvedProfiles[goal];
  const events: EventDraft[] = [];
  const firstRoute = profile.routes[0]!;

  events.push(
    draft(
      sessionId,
      persona,
      variant,
      goal,
      'workflow_started',
      firstRoute,
      goal,
    ),
  );
  events.push(
    draft(sessionId, persona, variant, goal, 'page_view', firstRoute),
  );

  for (let index = 1; index < profile.routes.length; index += 1) {
    const previousRoute = profile.routes[index - 1]!;
    const route = profile.routes[index]!;
    events.push(
      draft(sessionId, persona, variant, goal, 'click', previousRoute, route),
    );
    events.push(draft(sessionId, persona, variant, goal, 'page_view', route));
  }

  const terminalRoute = profile.routes[profile.routes.length - 1]!;
  const previousRoute = profile.routes[Math.max(0, profile.routes.length - 2)]!;
  let backtrackCount = 0;

  if (random.chance(profile.backtrackProbability)) backtrackCount += 1;
  if (random.chance(profile.secondBacktrackProbability)) backtrackCount += 1;

  for (let index = 0; index < backtrackCount; index += 1) {
    events.push(
      draft(
        sessionId,
        persona,
        variant,
        goal,
        'backtrack',
        terminalRoute,
        previousRoute,
      ),
    );
    events.push(
      draft(sessionId, persona, variant, goal, 'page_view', previousRoute),
    );
    events.push(
      draft(
        sessionId,
        persona,
        variant,
        goal,
        'click',
        previousRoute,
        terminalRoute,
      ),
    );
    events.push(
      draft(sessionId, persona, variant, goal, 'page_view', terminalRoute),
    );
  }

  const usedSearch = random.chance(profile.searchProbability);
  if (usedSearch) {
    events.push(
      draft(sessionId, persona, variant, goal, 'search', terminalRoute, 'task'),
    );
  }

  const validationErrors = random.chance(profile.validationProbability) ? 1 : 0;
  if (validationErrors > 0) {
    events.push(
      draft(
        sessionId,
        persona,
        variant,
        goal,
        'validation_error',
        terminalRoute,
        'task_form',
      ),
    );
  }

  const durationMs =
    profile.routes.length * (variant === 'baseline' ? 11_000 : 7_000) +
    backtrackCount * 14_000 +
    (usedSearch ? 8_000 : 0) +
    validationErrors * 16_000 +
    random.integer(5_000, 24_000);
  const completed = random.chance(profile.completionProbability);

  events.push(
    draft(
      sessionId,
      persona,
      variant,
      goal,
      completed ? 'workflow_completed' : 'workflow_abandoned',
      terminalRoute,
      goal,
      durationMs,
    ),
  );

  return events;
};

export type { EventDraft };

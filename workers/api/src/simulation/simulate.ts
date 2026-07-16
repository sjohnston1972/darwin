import type {
  OrganismVariant,
  SimulationResult,
  SimulationRun,
  TelemetryEvent,
} from '@darwin/shared';

import { aggregateSimulation } from './aggregate';
import { generateJourney, type EventDraft } from './journeys';
import { choosePersonaAndGoal } from './personas';
import { SeededRandom } from './prng';

const START_TIME = Date.parse('2026-01-01T00:00:00.000Z');
const OBSERVATION_WINDOW_MS = 180 * 24 * 60 * 60 * 1_000;

export interface SimulationOptions {
  seed?: number;
  variant?: OrganismVariant;
  eventCount?: number;
}

const ambientRoutes: Record<OrganismVariant, readonly string[]> = {
  baseline: ['/dashboard', '/projects', '/tasks', '/reports'],
  evolved: ['/my-work', '/projects', '/insights'],
};

export const simulate = (options: SimulationOptions = {}): SimulationResult => {
  const seed = options.seed ?? 1859;
  const variant = options.variant ?? 'baseline';
  const eventCount = options.eventCount ?? 10_000;

  if (!Number.isInteger(seed))
    throw new Error('Simulation seed must be an integer.');
  if (!Number.isInteger(eventCount) || eventCount <= 0) {
    throw new Error('Simulation event count must be a positive integer.');
  }

  const random = new SeededRandom(seed);
  const drafts: EventDraft[] = [];
  let sessionNumber = 1;

  while (drafts.length < eventCount) {
    const sessionId = `session-${String(sessionNumber).padStart(5, '0')}`;
    const { persona, goal } = choosePersonaAndGoal(random);
    const journey = generateJourney(sessionId, persona, goal, variant, random);

    if (drafts.length + journey.length > eventCount) break;
    drafts.push(...journey);
    sessionNumber += 1;
  }

  while (drafts.length < eventCount) {
    const { persona, goal } = choosePersonaAndGoal(random);
    const route = random.pick(ambientRoutes[variant]);
    const type = drafts.length % 3 === 0 ? 'click' : 'page_view';
    drafts.push({
      sessionId: `ambient-${String(drafts.length + 1).padStart(5, '0')}`,
      persona,
      variant,
      goal,
      type,
      route,
      ...(type === 'click' ? { target: route } : {}),
    });
  }

  const runId = `sim-${variant}-${seed}`;
  const interval = OBSERVATION_WINDOW_MS / eventCount;
  const events: TelemetryEvent[] = drafts.map((event, index) => ({
    ...event,
    id: `evt-${String(index + 1).padStart(5, '0')}`,
    runId,
    timestamp: new Date(
      START_TIME + Math.floor(index * interval),
    ).toISOString(),
  }));
  const run: SimulationRun = {
    id: runId,
    seed,
    variant,
    eventCount: events.length,
    startedAt: events[0]!.timestamp,
    completedAt: events[events.length - 1]!.timestamp,
  };

  return {
    run,
    events,
    summary: aggregateSimulation(run, events),
  };
};

import { EvidencePackSchema } from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { OutcomeValidationError, compareAutomatedOutcomes } from '.';

const pack = (
  variant: 'baseline' | 'evolved',
  evidenceClass: 'automated' | 'measured' = 'automated',
) =>
  EvidencePackSchema.parse({
    evidenceId: `evidence-${variant}`,
    evidenceHash: (variant === 'baseline' ? 'a' : 'b').repeat(64),
    generatedAt: '2026-07-16T12:00:00.000Z',
    parserVersion: '1.0.0',
    evidenceClass,
    study: {
      studyId: `projectflow-${variant}-study`,
      appVersion: variant === 'baseline' ? '1.0.0' : '1.1.0',
      sourceEventCount: 10,
      participants: 1,
      sessions: 1,
      attempts: 1,
    },
    quality: {
      score: 32,
      strength: 'directional',
      eventCount: 10,
      sessionCount: 1,
      participantCount: 1,
      completedAttemptCount: 1,
      limitations: ['Single-session cohort.'],
    },
    journeys: [
      {
        journeyId: 'J-001',
        appVersion: variant === 'baseline' ? '1.0.0' : '1.1.0',
        source: evidenceClass === 'automated' ? 'automated' : 'real_user',
        viewport: 'desktop',
        eventCount: 1,
        routes: ['/study/dashboard'],
        events: [
          {
            eventRef: 'E-001',
            eventType: 'page_view',
            sequence: 0,
            offsetMs: 0,
            route: '/study/dashboard',
            attributes: {},
          },
        ],
      },
    ],
    taskAttempts: [],
    tasks: [
      {
        taskId: 'find-assigned-task',
        attempts: 1,
        successes: 1,
        completionRate: 1,
        medianDurationMs: variant === 'baseline' ? 8_000 : 3_000,
        medianInteractions: variant === 'baseline' ? 7 : 3,
        optimalInteractions: 3,
        topPaths: [],
      },
    ],
    frictionSignals: [],
    applicationMap: {
      product: {
        name: 'ProjectFlow',
        purpose: 'Project management workspace.',
        primaryUser: 'Knowledge worker.',
        domainEntities: ['project', 'task', 'user'],
        primaryGoals: ['find assigned work'],
      },
      activeVariant: {
        name: variant,
        version: variant === 'baseline' ? '1.0.0' : '1.1.0',
        navigation:
          variant === 'baseline'
            ? ['Dashboard', 'Projects', 'Reports', 'Settings']
            : ['Dashboard', 'My Work', 'Projects', 'Insights', 'Settings'],
        capabilities:
          variant === 'baseline'
            ? ['project-scoped task search']
            : ['global task search', 'direct My Work route'],
      },
      interfaceInventory: [
        {
          area: 'task-discovery',
          purpose: 'Find assigned work.',
          primaryActions: ['open task'],
        },
      ],
      routes: ['/study/dashboard'],
      mutableAreas: ['navigation'],
      protectedAreas: ['telemetry-history'],
    },
  });

describe('automated outcome validation', () => {
  it('compares versioned cohorts with an honest source label', () => {
    const result = compareAutomatedOutcomes(
      pack('baseline'),
      pack('evolved'),
      'find-assigned-task',
      '2026-07-16T12:10:00.000Z',
    );

    expect(result.evidenceClass).toBe('automated');
    expect(result.provenance).toBe('live_automated_run');
    expect(result.delta).toEqual({
      interactions: -4,
      durationMs: -5_000,
      completionRate: 0,
    });
    expect(result.baseline.appVersion).toBe('1.0.0');
    expect(result.evolved.appVersion).toBe('1.1.0');
  });

  it('refuses to compare measured evidence as automation', () => {
    expect(() =>
      compareAutomatedOutcomes(pack('baseline', 'measured'), pack('evolved')),
    ).toThrow(OutcomeValidationError);
  });
});

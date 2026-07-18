import { expect, test, type Page, type Route } from '@playwright/test';

const timestamp = '2026-07-16T12:00:00.000Z';
const rules = [
  'task_abandonment',
  'navigation_loop',
  'hover_hesitation',
  'drag_expectation',
] as const;

const frictionSignals = Array.from({ length: 10 }, (_, index) => {
  const sequence = index + 1;
  const eventId = `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
  const ruleId = rules[index % rules.length]!;
  const targetId = index % 2 === 0 ? 'nav-projects' : 'capacity-member-1';
  return {
    evidenceId: `EV-${sequence.toString().padStart(3, '0')}`,
    ruleId,
    ruleVersion: '1.2.0',
    severity: index < 3 ? 'high' : index < 7 ? 'medium' : 'low',
    taskId: 'find-assigned-task',
    summary: `${ruleId.replaceAll('_', ' ')} recurred on ${targetId}.`,
    affectedAttemptIds: ['attempt-observation-test'],
    supportingEventIds: [eventId],
    trace: [
      {
        eventId,
        sequence,
        eventType: index % 2 === 0 ? 'element_clicked' : 'hover_ended',
        route: '/study/dashboard',
        targetId,
      },
    ],
    support: {
      events: 8 - (index % 4),
      attempts: 1,
      sessions: 1,
      participants: 1,
    },
  };
});

const evidence = {
  evidenceId: 'evidence-observation-visual',
  evidenceHash: 'a'.repeat(64),
  generatedAt: timestamp,
  parserVersion: '1.2.0',
  evidenceClass: 'measured',
  study: {
    studyId: 'projectflow-baseline-study',
    appVersion: '1.0.0',
    sourceEventCount: 84,
    participants: 4,
    sessions: 6,
    attempts: 1,
  },
  taskAttempts: [
    {
      attemptId: 'attempt-observation-test',
      taskId: 'find-assigned-task',
      participantId: 'participant-observation-test',
      sessionId: 'session-observation-test',
      appVersion: '1.0.0',
      source: 'real_user',
      outcome: 'abandoned',
      startedAt: timestamp,
      endedAt: timestamp,
      durationMs: 42_000,
      interactionCount: 9,
      routePath: ['/study/dashboard', '/study/projects'],
      eventIds: ['00000000-0000-4000-8000-000000000001'],
    },
  ],
  tasks: [],
  quality: {
    strength: 'substantial',
    score: 84,
    eventCount: 84,
    sessionCount: 6,
    participantCount: 4,
    completedAttemptCount: 3,
    terminalAttemptCount: 4,
    dimensions: {
      volume: { score: 100, observedEvents: 84, minimumEvents: 20 },
      diversity: {
        score: 100,
        observedParticipants: 4,
        minimumParticipants: 3,
        observedSessions: 6,
        minimumSessions: 3,
      },
      completion: {
        score: 80,
        terminalAttempts: 4,
        minimumTerminalAttempts: 5,
      },
      recency: {
        score: 100,
        latestEventAt: timestamp,
        maximumAgeDays: 30,
      },
      weakestScore: 80,
    },
    limitations: ['One task has fewer than five completed attempts.'],
  },
  journeys: [
    {
      journeyId: 'J-001',
      appVersion: '1.0.0',
      source: 'real_user',
      viewport: 'desktop',
      eventCount: 1,
      events: [
        {
          eventRef: 'E-001',
          sequence: 1,
          offsetMs: 0,
          eventType: 'element_clicked',
          route: '/study/dashboard',
          targetId: 'nav-projects',
          attributes: { pointerType: 'mouse' },
        },
      ],
    },
  ],
  frictionSignals,
  applicationMap: {
    source: {
      repositorySha: 'a'.repeat(40),
      sourceHash: 'b'.repeat(64),
    },
    product: {
      name: 'ProjectFlow',
      purpose: 'Project management workspace.',
      primaryUser: 'Knowledge worker.',
      domainEntities: ['project', 'task', 'user'],
      primaryGoals: ['find assigned work'],
    },
    activeGenome: {
      version: '1.0.0',
      navigation: ['Dashboard', 'Projects', 'Reports', 'Settings'],
      capabilities: ['project-scoped task search'],
    },
    interfaceInventory: [
      {
        area: 'dashboard-capacity',
        purpose: 'Inspect workload allocation.',
        primaryActions: ['open capacity report'],
      },
    ],
    routes: ['/study/dashboard', '/study/projects'],
    mutableAreas: ['navigation', 'dashboard-capacity'],
    protectedAreas: ['telemetry-history'],
  },
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: status === 204 ? '' : JSON.stringify(body),
  });

const installApi = async (page: Page) => {
  await page.route('http://localhost:8787/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/api/auth/session')) {
      return json(route, {
        actor: 'playwright-operator',
        capabilities: [
          'observe',
          'inspect_evidence',
          'reason',
          'execute',
          'release',
          'reset',
          'connect',
          'simulate',
        ],
      });
    }
    if (path.endsWith('/api/health')) {
      return json(route, {
        status: 'ok',
        service: 'darwin-api',
        version: '0.23.0',
        commitSha: 'a'.repeat(40),
        buildId: 'observation-visual-test',
        retention: {
          status: 'healthy',
          policy: {
            version: '1.0.0',
            rawTelemetryDays: 30,
            workspaceDays: 30,
            derivedEvidenceDays: 90,
            executionArtifactDays: 30,
            fossilRecordDays: 365,
            operationalAuditDays: 90,
            maxEventsPerStudy: 10_000,
            maxEventsPerTarget: 100_000,
          },
          eventCount: 84,
          studyCount: 1,
          largestStudyEventCount: 84,
          expiredRecordCount: 0,
          lastSweepAt: null,
        },
        analysis: {
          mode: 'live',
          model: 'gpt-5.6',
          liveModelAvailable: true,
        },
        timestamp,
      });
    }
    if (path.endsWith('/events/raw')) {
      return json(route, {
        studyId: 'projectflow-baseline-study',
        events: [],
        cursor: null,
        hasMore: false,
        count: 84,
        sessionCounts: {
          'session-observation-test': 24,
          'session-observation-two': 18,
          'session-observation-three': 14,
          'session-observation-four': 12,
          'session-observation-five': 9,
          'session-observation-six': 7,
        },
        participantCount: 4,
        behaviorSignalCount: 33,
      });
    }
    if (path.endsWith('/evidence/latest')) return json(route, evidence);
    if (path.endsWith('/evidence-analysis/latest')) {
      return json(route, null, 204);
    }
    if (path.endsWith('/api/genome')) {
      return json(route, {
        evolutionCycle: {
          studyId: 'projectflow-baseline-study',
          startedAt: null,
          genomeEvolutionCount: 0,
        },
        executions: [],
        fitnessOutcomes: [],
        page: { limit: 10, nextCursor: null },
      });
    }
    if (path.endsWith('/api/observations/archives')) {
      return json(route, {
        archives: [],
        page: { limit: 10, nextCursor: null },
      });
    }
    if (path.endsWith('/api/target-connection')) return json(route, null, 204);
    if (path.endsWith('/api/demo/reset')) return json(route, null, 204);
    return json(route, { error: 'unexpected_visual_test_route', path }, 404);
  });
};

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 1100 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const) {
  test(`Observations ranked pressure layout · ${scenario.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(scenario.viewport);
    await installApi(page);
    await page.goto('/?view=observations');
    await expect(
      page.getByRole('heading', {
        name: 'Ranked by severity and independent support',
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Signal filters').locator('select'),
    ).toHaveCount(5);
    await page.evaluate(() => document.fonts.ready);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    await expect(page).toHaveScreenshot(`observations-${scenario.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
}

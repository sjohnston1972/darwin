import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }, testInfo) => {
  const reset = await request.post('http://127.0.0.1:8787/api/demo/reset', {
    headers: { Authorization: 'Bearer e2e-token' },
    data: {
      confirmation: 'RESET DARWIN DEMO',
      exportAcknowledged: true,
    },
  });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  const theme = testInfo.project.name === 'mobile-390' ? 'light' : 'dark';
  await page.addInitScript((selectedTheme) => {
    sessionStorage.setItem('darwin:operator-token', 'e2e-token');
    localStorage.setItem('darwin-theme', selectedTheme);
  }, theme);
});

test('@smoke opens the real measured target and receives semantic telemetry', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one functional desktop path');
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Rosalind — Helping your software adapt.',
    }),
  ).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open measured study' }).click();
  const target = await popupPromise;
  await expect(target).toHaveURL(/(?:localhost|127\.0\.0\.1):5174/);
  await expect(target.getByText('ProjectFlow').first()).toBeVisible();
  await expect(target.getByLabel('Captured events')).not.toHaveText('0 events');
  await target.getByRole('button', { name: /Projects 4/i }).click();
  await expect(target.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await target.locator('[data-darwin-id="project-open-apollo"]').click();
  await target.locator('[data-darwin-id="project-tasks-open"]').click();
  await target.locator('[data-darwin-id="task-open-apl-241"]').click();
  await target.waitForTimeout(1_800);
  await page.goto('/?view=observations');
  await expect(
    page.getByRole('button', { name: /All captured events [1-9]/ }),
  ).toBeVisible();
});

test('@smoke completes the controlled evolution, archive, and rollback path', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one functional desktop path');
  test.setTimeout(90_000);

  await page.goto('/?view=target');
  await page.getByRole('button', { name: 'Connect ProjectFlow' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();

  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open measured study' }).click();
  const target = await popupPromise;
  await expect(target.getByLabel('Captured events')).not.toHaveText('0 events');
  await target.getByRole('button', { name: /Projects 4/i }).click();
  await target.locator('[data-darwin-id="project-open-apollo"]').click();
  await target.locator('[data-darwin-id="project-tasks-open"]').click();
  await target.locator('[data-darwin-id="task-open-apl-241"]').click();

  await expect
    .poll(async () => {
      const response = await request.get(
        'http://127.0.0.1:8787/api/studies/projectflow-baseline-study/events?limit=50',
        { headers: { Authorization: 'Bearer e2e-token' } },
      );
      return ((await response.json()) as { count: number }).count;
    })
    .toBeGreaterThanOrEqual(8);

  await page.goto('/?view=observations');
  await page.getByRole('button', { name: 'Generate evidence' }).click();
  await expect(page.getByText(/Evidence pack evidence-/)).toBeVisible();
  await expect(page.locator('.evidence-signal-id').first()).toHaveText(
    /^EV-[a-f0-9]{12}$/,
  );

  await page.goto('/?view=mutations');
  await page
    .getByText('Evidence and mutation reasoning', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Ask gpt-5.6' }).click();
  const preferredMutation = page.getByRole('checkbox', {
    name: 'Implement Direct My Work navigation',
  });
  await expect(preferredMutation).toBeVisible();
  await expect(preferredMutation).toBeChecked();
  await page
    .getByRole('button', { name: 'Start controlled evolution' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Codex execution' }),
  ).toBeVisible();

  await expect(page.getByLabel('ProjectFlow repository diff')).toContainText(
    'evidence-led task discovery',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Release reviewed mutation' }).click();
  await expect
    .poll(async () => {
      const response = await request.get('http://127.0.0.1:8787/api/genome', {
        headers: { Authorization: 'Bearer e2e-token' },
      });
      return (
        (await response.json()) as {
          evolutionCycle: { genomeEvolutionCount: number };
        }
      ).evolutionCycle.genomeEvolutionCount;
    })
    .toBe(1);

  await page.goto('/?view=observations');
  await expect(
    page.getByText('Direct My Work navigation', { exact: true }),
  ).toBeVisible();
  await page.goto('/?view=genome');
  const retainedMutation = page.getByText('Direct My Work navigation', {
    exact: true,
  });
  await expect(retainedMutation).toBeVisible();
  await retainedMutation.click();
  await page
    .getByRole('button', { name: 'Prepare controlled rollback' })
    .click();
  const releaseRollback = page.getByRole('button', {
    name: 'Release reviewed rollback',
  });
  await expect(releaseRollback).toBeVisible({ timeout: 30_000 });
  await releaseRollback.click();
  await expect
    .poll(async () => {
      const response = await request.get('http://127.0.0.1:8787/api/genome', {
        headers: { Authorization: 'Bearer e2e-token' },
      });
      return (
        (await response.json()) as {
          executions: Array<{ rollback: { status: string } | null }>;
        }
      ).executions[0]?.rollback?.status;
    })
    .toBe('released');
  await page.reload();
  await page.getByText('Direct My Work navigation', { exact: true }).click();
  await expect(page.getByText(/ProjectFlow returned to/)).toBeVisible();
});

test('@smoke defines and completes a non-Apollo Darwin Lab population', async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one real population path');
  test.setTimeout(300_000);
  const apiBase = 'http://127.0.0.1:8787';
  const operatorHeaders = { Authorization: 'Bearer e2e-token' };

  const goal = 'Find the task assigned to me and open it';
  await page.goto('/?view=lab');
  await page.getByPlaceholder(/Find the task assigned to me/i).fill(goal);
  // Sending agents creates and starts the population in one action.
  await page.getByRole('button', { name: /Send agents/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: goal })).toBeVisible();
  await expect(
    page.locator('.lab-status.status-awaiting_runner'),
  ).toBeVisible();

  const listResponse = await request.get(`${apiBase}/api/lab/experiments`, {
    headers: operatorHeaders,
  });
  const experiment = (
    (await listResponse.json()) as {
      experiments: Array<{
        experimentId: string;
        studyId: string;
        targetAppVersion: string;
        populationSize: number;
        task: {
          taskId: string;
          taskDefinitionId: string;
          definitionHash: string;
        };
        provenance: Record<string, unknown>;
      }>;
    }
  ).experiments[0]!;
  const claimed = await request.post(
    `${apiBase}/api/lab/experiments/${experiment.experimentId}/claim`,
    {
      headers: operatorHeaders,
      data: { runnerId: 'e2e-real-browser-population' },
    },
  );
  expect(claimed.ok(), await claimed.text()).toBeTruthy();

  const runs = Array.from(
    { length: experiment.populationSize },
    (_, index) => ({
      ordinal: index + 1,
      runId: `lab-run-assigned-${index + 1}`,
      participantId: `lab-agent-assigned-${index + 1}`,
      sessionId: `lab-session-assigned-${index + 1}`,
    }),
  );
  for (const run of runs) {
    const started = await request.post(
      `${apiBase}/api/lab/experiments/${experiment.experimentId}/runs`,
      {
        headers: operatorHeaders,
        data: {
          runId: run.runId,
          participantId: run.participantId,
          sessionId: run.sessionId,
          persona: 'novice',
          viewport: { class: 'desktop', width: 1280, height: 800 },
          agentModel: 'gpt-5.6-luna',
          startedAt: new Date().toISOString(),
          populationOrdinal: run.ordinal,
          studyId: experiment.studyId,
          taskDefinitionId: experiment.task.taskDefinitionId,
          taskDefinitionHash: experiment.task.definitionHash,
          appVersion: experiment.targetAppVersion,
        },
      },
    );
    expect(started.ok(), await started.text()).toBeTruthy();
  }
  let labWriteChain = Promise.resolve();
  const persistCompletedRun = async (
    run: (typeof runs)[number],
    telemetryEventIds: string[],
  ) => {
    expect(telemetryEventIds.length).toBeGreaterThan(0);
    const actionInputs = [
      {
        targetId: 'nav-projects',
        expectation: 'The projects list should open.',
        fromUrl: 'http://127.0.0.1:5174/study/dashboard',
        toUrl: 'http://127.0.0.1:5174/study/projects',
      },
      {
        targetId: 'project-open-apollo',
        expectation: 'The Apollo Release project should open.',
        fromUrl: 'http://127.0.0.1:5174/study/projects',
        toUrl: 'http://127.0.0.1:5174/study/projects/apollo',
      },
      {
        targetId: 'project-tasks-open',
        expectation: 'The Apollo Release task list should open.',
        fromUrl: 'http://127.0.0.1:5174/study/projects/apollo',
        toUrl: 'http://127.0.0.1:5174/study/projects/apollo/tasks',
      },
      {
        targetId: 'task-open-apl-241',
        expectation: 'The assigned task should open and satisfy the task.',
        fromUrl: 'http://127.0.0.1:5174/study/projects/apollo/tasks',
        toUrl: 'http://127.0.0.1:5174/study/projects/apollo/tasks',
      },
    ];
    for (const [actionIndex, actionInput] of actionInputs.entries()) {
      const action = await request.post(
        `${apiBase}/api/lab/experiments/${experiment.experimentId}/runs/${run.runId}/actions`,
        {
          headers: operatorHeaders,
          data: {
            action: {
              actionId: `lab-action-assigned-${run.ordinal}-${actionIndex + 1}`,
              ordinal: actionIndex + 1,
              occurredAt: new Date().toISOString(),
              action: 'click',
              ...actionInput,
              targetRole: 'button',
              inputLength: null,
              key: null,
              durationMs: 500,
              outcome: 'changed',
              accessibilityNodeCount: 80,
              telemetryEventIds:
                actionIndex === 0
                  ? telemetryEventIds.slice(0, 1)
                  : telemetryEventIds.slice(1),
              error: null,
              provenance: {
                ...experiment.provenance,
                runIds: [run.runId],
              },
            },
          },
        },
      );
      expect(action.ok(), await action.text()).toBeTruthy();
    }
    const finished = await request.post(
      `${apiBase}/api/lab/experiments/${experiment.experimentId}/runs/${run.runId}/finish`,
      {
        headers: operatorHeaders,
        data: {
          status: 'succeeded',
          finishedAt: new Date().toISOString(),
          durationMs: 2_000,
          taskOutcome: 'success',
          frictionLabels: [],
          telemetryEventIds,
          error: null,
        },
      },
    );
    expect(finished.ok(), await finished.text()).toBeTruthy();
  };

  for (const run of runs) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const target = await context.newPage();
    const parameters = new URLSearchParams({
      study: 'true',
      lab: 'true',
      source: 'automated',
      studyId: experiment.studyId,
      experimentId: experiment.experimentId,
      runId: run.runId,
      participantId: run.participantId,
      sessionId: run.sessionId,
      taskId: experiment.task.taskId,
      taskDefinitionId: experiment.task.taskDefinitionId,
      taskDefinitionHash: experiment.task.definitionHash,
      appVersion: experiment.targetAppVersion,
    });
    const sessionResponse = target.waitForResponse((response) =>
      response.url().endsWith('/api/study-sessions'),
    );
    const initialIngestion = target.waitForResponse((response) =>
      response.url().endsWith('/api/telemetry/events'),
    );
    await target.goto(`http://localhost:5174/study/dashboard?${parameters}`);
    expect((await sessionResponse).status()).toBe(201);
    await expect(
      target.locator('[data-darwin-lab-ready="true"]'),
    ).toBeAttached();
    await expect(target.getByLabel('Captured events')).not.toHaveText(
      '0 events',
    );
    await target.getByRole('button', { name: /Projects/ }).click();
    await expect(
      target.getByRole('heading', { name: 'Projects' }),
    ).toBeVisible();
    await target.getByRole('button', { name: /Apollo Release/ }).click();
    await target.getByRole('button', { name: /Tasks/ }).click();
    await target
      .getByRole('button', { name: /Confirm launch checklist/ })
      .click();
    await expect(
      target.locator(
        '[data-darwin-workflow-outcome="find-assigned-task:success"]',
      ),
    ).toBeAttached();
    const interaction = await initialIngestion;
    expect(interaction.status()).toBe(202);
    const interactionReceipt = (await interaction.json()) as {
      accepted: number;
    };
    expect(
      interactionReceipt.accepted,
      JSON.stringify(interactionReceipt),
    ).toBeGreaterThan(0);

    const stored = await request.get(
      `${apiBase}/api/studies/${experiment.studyId}/sessions/${run.sessionId}`,
      { headers: operatorHeaders },
    );
    const trace = (await stored.json()) as {
      events: Array<{ eventId: string; targetId?: string }>;
    };
    expect(trace.events.some((event) => event.targetId === 'nav-projects')).toBe(
      true,
    );
    const write = labWriteChain.then(() =>
      persistCompletedRun(
        run,
        trace.events.map((event) => event.eventId),
      ),
    );
    labWriteChain = write;
    await write;
    await context.close();
  }

  const completedResponse = await request.get(
    `${apiBase}/api/lab/experiments/${experiment.experimentId}`,
    { headers: operatorHeaders },
  );
  const completed = (await completedResponse.json()) as {
    status: string;
    evidence: {
      evidenceClass: string;
      provenance: { evidenceClass: string };
      population: { completed: number };
    };
  };
  expect(completed).toMatchObject({
    status: 'completed',
    evidence: {
      evidenceClass: 'automated',
      provenance: { evidenceClass: 'darwin_lab' },
      population: { completed: 8 },
    },
  });
  await page.goto('/?view=lab');
  await expect(page.getByText('8/8', { exact: true })).toBeVisible();
  await expect(page.locator('.lab-status.status-completed')).toBeVisible();
});

for (const [name, path] of Object.entries({
  'control-room': '/',
  target: '/?view=target',
  observations: '/?view=observations',
  lab: '/?view=lab',
  mutations: '/?view=mutations',
  genome: '/?view=genome',
  status: '/?view=status',
})) {
  test(`visual ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(
      page.getByText('v0.25.0-e2e · 0123456 · online').first(),
    ).toBeVisible();
    if (name === 'observations' || name === 'mutations') {
      await expect(page.getByText('incremental updates')).toBeVisible();
    }
    if (name === 'status') {
      await expect(
        page.getByRole('heading', { name: 'Operational diagnostics' }),
      ).toBeVisible();
      await page.addStyleTag({
        content:
          'aside[aria-labelledby="operational-diagnostics-title"] { display: none !important; }',
      });
    }
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator('time')],
    });
  });
}

test('keeps keyboard tooltip inside the 390px viewport', async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) !== 390,
    'mobile-only edge assertion',
  );
  await page.goto('/');
  const tip = page.locator('.info-tip').first();
  await tip.focus();
  const tooltip = page.locator('.global-explain-tooltip');
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

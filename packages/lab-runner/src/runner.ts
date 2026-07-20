import {
  LabAgentDecisionResponseSchema,
  LabAgentRunSchema,
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  StudySessionResponseSchema,
  type LabAgentActionRecord,
  type LabAgentDecision,
  type LabAgentRun,
  type LabExperiment,
  type LabFrictionLabel,
  type LabPersona,
} from '@darwin/shared';
import { chromium, type Locator, type Page } from '@playwright/test';

const apiBaseUrl = process.env.DARWIN_API_BASE_URL ?? 'http://localhost:8787';
const operatorToken = process.env.DARWIN_OPERATOR_TOKEN?.trim();
const requestedExperimentId = process.env.DARWIN_LAB_EXPERIMENT_ID?.trim();
const runnerId =
  process.env.DARWIN_LAB_RUNNER_ID?.trim() ??
  `lab-runner-${crypto.randomUUID().slice(0, 12)}`;
const headless = process.env.DARWIN_LAB_HEADLESS !== 'false';

const personas: LabPersona[] = [
  'novice',
  'experienced_pm',
  'executive',
  'keyboard_first',
  'mobile',
  'cautious',
  'impatient',
  'search_first',
];

const apiRequest = async (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (operatorToken) headers.set('Authorization', `Bearer ${operatorToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      payload?.message ??
        `${init?.method ?? 'GET'} ${path} returned ${response.status}.`,
    );
  }
  return response.json() as Promise<unknown>;
};

export const retryFinishOperation = async <T>(
  operation: () => Promise<T>,
  delays = [0, 150, 500],
  wait: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
) => {
  let lastError: unknown;
  for (const delayMs of delays) {
    if (delayMs) {
      await wait(delayMs);
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const persistRunFinish = async (path: string, body: string) =>
  retryFinishOperation(() => apiRequest(path, { method: 'POST', body }));

export const seededPersonas = (experiment: LabExperiment) => {
  let state = experiment.seed >>> 0;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const population = experiment.personaAllocation.length
    ? experiment.personaAllocation.flatMap(({ persona, count }) =>
        Array.from({ length: count }, () => persona),
      )
    : Array.from(
        { length: experiment.populationSize },
        (_, index) => personas[index % personas.length]!,
      );
  for (let index = population.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [population[index], population[swap]] = [
      population[swap]!,
      population[index]!,
    ];
  }
  return population;
};

const claimExperiment = async () => {
  let experimentId = requestedExperimentId;
  if (!experimentId) {
    const payload = LabExperimentsResponseSchema.parse(
      await apiRequest('/api/lab/experiments?status=awaiting_runner'),
    );
    experimentId = payload.experiments.at(-1)?.experimentId;
  }
  if (!experimentId) {
    throw new Error('No Darwin Lab experiment is awaiting a runner.');
  }
  return LabExperimentSchema.parse(
    await apiRequest(
      `/api/lab/experiments/${encodeURIComponent(experimentId)}/claim`,
      {
        method: 'POST',
        body: JSON.stringify({ runnerId }),
      },
    ),
  );
};

export const labTargetUrl = (
  experiment: LabExperiment,
  runId: string,
  participantId: string,
  sessionId: string,
) => {
  const url = new URL(experiment.targetUrl);
  url.pathname = experiment.task.startRoute;
  url.searchParams.set('study', 'true');
  url.searchParams.set('lab', 'true');
  url.searchParams.set('source', 'automated');
  url.searchParams.set('studyId', experiment.studyId);
  url.searchParams.set('participantId', participantId);
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('experimentId', experiment.experimentId);
  url.searchParams.set('runId', runId);
  url.searchParams.set('appVersion', experiment.targetAppVersion);
  url.searchParams.set('taskId', experiment.task.taskId);
  url.searchParams.set('taskDefinitionId', experiment.task.taskDefinitionId);
  url.searchParams.set('taskDefinitionHash', experiment.task.definitionHash);
  return url.toString();
};

const taskSucceeded = async (page: Page, experiment: LabExperiment) => {
  const criterion = experiment.task.successCriterion;
  if (criterion.type === 'route_reached') {
    return new URL(page.url()).pathname === criterion.route;
  }
  if (criterion.type === 'semantic_marker') {
    return (
      (await page
        .locator(`[data-darwin-id=${JSON.stringify(criterion.markerId)}]`)
        .count()) > 0
    );
  }
  return (
    (await page
      .locator(
        `[data-darwin-workflow-outcome=${JSON.stringify(`${criterion.workflowId}:${criterion.outcome}`)}]`,
      )
      .count()) > 0
  );
};

const semanticId = async (locator: Locator) =>
  locator
    .evaluate(
      (element) =>
        element.closest<HTMLElement>('[data-darwin-id]')?.dataset.darwinId ??
        null,
    )
    .catch(() => null);

export const boundLabRunnerError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return message.slice(0, 500);
};

// A missing or stale accessibility target is an observation for the agent, not
// a reason to spend Playwright's full 30-second default timeout on one action.
export const labActionTimeoutMs = 5_000;

const resolveTarget = async (page: Page, decision: LabAgentDecision) => {
  if (!decision.target) throw new Error('Action target is missing.');
  if (decision.target.semanticId) {
    return page.locator(
      `[data-darwin-id=${JSON.stringify(decision.target.semanticId)}]`,
    );
  }
  if (!decision.target.role)
    throw new Error('Accessible target role is missing.');
  const exact = page.getByRole(
    decision.target.role as Parameters<Page['getByRole']>[0],
    decision.target.name ? { name: decision.target.name, exact: true } : {},
  );
  if (!decision.target.name || (await exact.count()) > 0) return exact;
  return page.getByRole(
    decision.target.role as Parameters<Page['getByRole']>[0],
    { name: decision.target.name, exact: false },
  );
};

const executeDecision = async (
  page: Page,
  decision: LabAgentDecision,
  targetOrigin: string,
) => {
  let locator: Locator | null = null;
  if (decision.target) locator = (await resolveTarget(page, decision)).first();
  switch (decision.action) {
    case 'navigate': {
      if (!decision.destination)
        throw new Error('Navigation destination is missing.');
      const destination = new URL(decision.destination, page.url());
      if (destination.origin !== targetOrigin) {
        throw new Error(
          'Agent attempted to leave the configured target origin.',
        );
      }
      await page.goto(destination.toString());
      break;
    }
    case 'click':
    case 'submit':
      await locator!.click({ timeout: labActionTimeoutMs });
      break;
    case 'hover':
      await locator!.hover({ timeout: labActionTimeoutMs });
      break;
    case 'type':
      await locator!.fill(decision.value ?? '', {
        timeout: labActionTimeoutMs,
      });
      break;
    case 'clear':
      await locator!.fill('', { timeout: labActionTimeoutMs });
      break;
    case 'key':
      await page.keyboard.press(decision.key ?? 'Enter');
      break;
    case 'select':
      await locator!.selectOption(decision.value ?? '', {
        timeout: labActionTimeoutMs,
      });
      break;
    case 'scroll':
      await page.mouse.wheel(0, 650);
      break;
    case 'back':
      await page.goBack();
      break;
    case 'forward':
      await page.goForward();
      break;
    case 'abandon':
      break;
  }
  return locator
    ? await semanticId(locator)
    : (decision.target?.semanticId ?? null);
};

const getSnapshot = async (page: Page) => {
  const snapshot = await page.locator('body').ariaSnapshot();
  return {
    snapshot,
    nodeCount: snapshot.split('\n').filter((line) => line.trim()).length,
  };
};

const listSessionEventIds = async (
  experiment: LabExperiment,
  sessionId: string,
): Promise<string[] | null> => {
  try {
    const response = StudySessionResponseSchema.parse(
      await apiRequest(
        `/api/studies/${encodeURIComponent(experiment.studyId)}/sessions/${encodeURIComponent(sessionId)}`,
      ),
    );
    return response.events.map((event) => event.eventId);
  } catch {
    return null;
  }
};

export const reconcileSessionEventIds = (
  knownEventIds: ReadonlySet<string>,
  currentEventIds: string[] | null,
) => {
  if (currentEventIds === null) {
    return { knownEventIds: new Set(knownEventIds), newEventIds: [] };
  }
  return {
    knownEventIds: new Set(currentEventIds),
    newEventIds: currentEventIds.filter((id) => !knownEventIds.has(id)),
  };
};

export const deriveFrictionLabels = (
  run: Pick<LabAgentRun, 'actions'>,
  outcome: 'success' | 'failed' | 'abandoned',
) => {
  const labels = new Set<LabFrictionLabel>();
  if (run.actions.length > 8) labels.add('excess_path_length');
  if (outcome === 'abandoned') labels.add('abandonment');
  if (
    run.actions.some(
      (action) => action.action === 'click' && action.outcome === 'unchanged',
    )
  ) {
    labels.add('dead_click');
  }
  if (
    run.actions.some(
      (action) =>
        action.targetId?.includes('search') && action.outcome !== 'changed',
    )
  ) {
    labels.add('search_failure');
  }
  const routes = run.actions.map((action) => new URL(action.toUrl).pathname);
  if (new Set(routes).size < routes.length) labels.add('navigation_loop');
  return [...labels];
};

const runAgent = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  experiment: LabExperiment,
  persona: LabPersona,
  index: number,
) => {
  const runId = `lab-run-${crypto.randomUUID()}`;
  const participantId = `lab-agent-${String(index + 1).padStart(2, '0')}`;
  const sessionId = `lab-session-${crypto.randomUUID()}`;
  const mobile = persona === 'mobile';
  const viewport = mobile
    ? { class: 'mobile' as const, width: 390, height: 844 }
    : { class: 'desktop' as const, width: 1440, height: 960 };
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let model = 'gpt-5.6-luna';
  let taskOutcome: 'success' | 'failed' | 'abandoned' = 'failed';
  let terminalStatus: 'succeeded' | 'failed' | 'abandoned' | 'blocked' =
    'failed';
  let terminalError: string | null = null;
  let finishFailure: Error | null = null;
  const actions: LabAgentActionRecord[] = [];
  let knownEventIds = new Set<string>();

  await apiRequest(
    `/api/lab/experiments/${encodeURIComponent(experiment.experimentId)}/runs`,
    {
      method: 'POST',
      body: JSON.stringify({
        runId,
        participantId,
        sessionId,
        persona,
        viewport,
        agentModel: model,
        startedAt,
        populationOrdinal: index + 1,
        studyId: experiment.studyId,
        taskDefinitionId: experiment.task.taskDefinitionId,
        taskDefinitionHash: experiment.task.definitionHash,
        appVersion: experiment.targetAppVersion,
      }),
    },
  );

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const targetUrl = labTargetUrl(experiment, runId, participantId, sessionId);

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-darwin-lab-ready="true"]').waitFor({
      state: 'attached',
      timeout: 15_000,
    });
    knownEventIds = new Set(
      (await listSessionEventIds(experiment, sessionId)) ?? [],
    );

    for (let ordinal = 1; ordinal <= experiment.maxActions; ordinal += 1) {
      if (Date.now() - startedMs >= experiment.maxDurationMs) break;
      if (await taskSucceeded(page, experiment)) {
        taskOutcome = 'success';
        terminalStatus = 'succeeded';
        break;
      }
      const beforeUrl = page.url();
      const before = await getSnapshot(page);
      const response = LabAgentDecisionResponseSchema.parse(
        await apiRequest('/api/lab/agent-decision', {
          method: 'POST',
          body: JSON.stringify({
            experimentId: experiment.experimentId,
            runId,
            persona,
            taskInstruction: experiment.task.instruction,
            currentUrl: beforeUrl,
            pageTitle: await page.title(),
            accessibilitySnapshot: before.snapshot,
            history: actions.map((action) => ({
              ordinal: action.ordinal,
              action: action.action,
              targetId: action.targetId,
              route: action.toUrl,
              outcome: action.outcome,
            })),
            remainingActions: experiment.maxActions - ordinal + 1,
            elapsedMs: Date.now() - startedMs,
            viewport: viewport.class,
          }),
        }),
      );
      model = response.model;
      const actionStarted = Date.now();
      let actionError: string | null = null;
      let targetId: string | null =
        response.decision.target?.semanticId ?? null;
      try {
        targetId = await executeDecision(
          page,
          response.decision,
          new URL(experiment.targetUrl).origin,
        );
        await page.waitForTimeout(350);
      } catch (error) {
        actionError = boundLabRunnerError(error, 'Action failed.');
      }
      const after = await getSnapshot(page);
      const afterUrl = page.url();
      await page.waitForTimeout(800);
      const currentEventIds = await listSessionEventIds(experiment, sessionId);
      const reconciliation = reconcileSessionEventIds(
        knownEventIds,
        currentEventIds,
      );
      const newEventIds = reconciliation.newEventIds;
      knownEventIds = reconciliation.knownEventIds;
      const outcome = actionError
        ? 'error'
        : beforeUrl !== afterUrl || before.snapshot !== after.snapshot
          ? 'changed'
          : 'unchanged';
      const action = {
        actionId: `lab-action-${crypto.randomUUID()}`,
        ordinal,
        occurredAt: new Date(actionStarted).toISOString(),
        action: response.decision.action,
        targetId,
        targetRole: response.decision.target?.role ?? null,
        inputLength:
          response.decision.value === null
            ? null
            : response.decision.value.length,
        key: response.decision.key,
        expectation: response.decision.expectation,
        fromUrl: beforeUrl,
        toUrl: afterUrl,
        durationMs: Date.now() - actionStarted,
        outcome,
        accessibilityNodeCount: after.nodeCount,
        telemetryEventIds: newEventIds,
        error: actionError,
        provenance: {
          ...experiment.provenance,
          runIds: [runId],
        },
      } satisfies LabAgentActionRecord;
      actions.push(action);
      await apiRequest(
        `/api/lab/experiments/${encodeURIComponent(experiment.experimentId)}/runs/${encodeURIComponent(runId)}/actions`,
        { method: 'POST', body: JSON.stringify({ action }) },
      );

      if (response.decision.action === 'abandon') {
        taskOutcome = 'abandoned';
        terminalStatus = 'abandoned';
        break;
      }
      if (actionError && ordinal >= 3) {
        taskOutcome = 'failed';
        terminalStatus = 'blocked';
        terminalError = actionError;
        break;
      }
      if (await taskSucceeded(page, experiment)) {
        taskOutcome = 'success';
        terminalStatus = 'succeeded';
        break;
      }
    }
  } catch (error) {
    terminalError = boundLabRunnerError(error, 'Lab run failed.');
    terminalStatus = 'blocked';
  } finally {
    await page.waitForTimeout(1_100).catch(() => undefined);
    const telemetryEventIds = (await listSessionEventIds(
      experiment,
      sessionId,
    )) ?? [...knownEventIds];
    const finishPayload = {
      status: terminalStatus,
      finishedAt: new Date().toISOString(),
      durationMs: Math.min(Date.now() - startedMs, experiment.maxDurationMs),
      taskOutcome,
      frictionLabels: deriveFrictionLabels({ actions }, taskOutcome),
      telemetryEventIds,
      error: terminalError,
    };
    try {
      await persistRunFinish(
        `/api/lab/experiments/${encodeURIComponent(experiment.experimentId)}/runs/${encodeURIComponent(runId)}/finish`,
        JSON.stringify(finishPayload),
      );
    } catch (error) {
      const finishMessage =
        error instanceof Error ? error.message : 'Run finish request failed.';
      finishFailure = new Error(
        terminalError
          ? `${finishMessage} Original run error: ${terminalError}`
          : finishMessage,
        { cause: error },
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  if (finishFailure) throw finishFailure;

  return LabAgentRunSchema.parse({
    runId,
    experimentId: experiment.experimentId,
    participantId,
    sessionId,
    persona,
    viewport,
    agentModel: model,
    status: terminalStatus,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Math.min(Date.now() - startedMs, experiment.maxDurationMs),
    taskOutcome,
    frictionLabels: deriveFrictionLabels({ actions }, taskOutcome),
    telemetryEventIds: [],
    actions,
    error: terminalError,
    populationOrdinal: index + 1,
    studyId: experiment.studyId,
    taskDefinitionId: experiment.task.taskDefinitionId,
    taskDefinitionHash: experiment.task.definitionHash,
    appVersion: experiment.targetAppVersion,
    provenance: {
      ...experiment.provenance,
      runIds: [runId],
    },
  });
};

export async function main() {
  const experiment = await claimExperiment();
  const browser = await chromium.launch({ headless });
  try {
    const population = seededPersonas(experiment);
    for (let index = 0; index < population.length; index += 1) {
      const run = await runAgent(
        browser,
        experiment,
        population[index]!,
        index,
      );
      process.stdout.write(
        `${run.runId} ${run.persona} ${run.taskOutcome} ${run.actions.length} actions\n`,
      );
    }
  } catch (error) {
    await apiRequest(
      `/api/lab/experiments/${encodeURIComponent(experiment.experimentId)}/force-fail`,
      { method: 'POST', body: '{}' },
    ).catch(() => undefined);
    throw error;
  } finally {
    await browser.close().catch(() => undefined);
  }
  process.stdout.write(
    `Darwin Lab experiment ${experiment.experimentId} completed.\n`,
  );
}

if (process.env.VITEST !== 'true') {
  await main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Darwin Lab runner failed.'}\n`,
    );
    process.exitCode = 1;
  });
}

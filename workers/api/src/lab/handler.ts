import {
  CodexImplementationManifestSchema,
  BehaviouralEvalSchema,
  LabAgentActionAppendRequestSchema,
  LabAgentDecisionRequestSchema,
  LabAgentRunFinishRequestSchema,
  LabAgentRunSchema,
  LabAgentRunStartRequestSchema,
  LabExperimentCreateRequestSchema,
  LabExperimentStatusSchema,
  LabExperimentUpdateRequestSchema,
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  LabMutationSelectionRequestSchema,
  LabRunnerClaimRequestSchema,
  LabSelectionSchema,
  type LabExperiment,
  type LabTaskInput,
} from '@darwin/shared';

import { buildLabEvidence } from './evidence';
import { getLabRepository } from './lab-repository';
import { getTelemetryRepository } from '../persistence/telemetry-repository';
import { captureRepositorySnapshot } from '../repository/github-source';
import {
  LabReasoningError,
  analyseLabEvidence,
  decideLabAgentAction,
} from './reasoning';
import {
  PayloadTooLargeError,
  readBoundedBody,
} from '../security/bounded-body';

interface LabHandlerEnvironment {
  DB?: D1Database;
  DARWIN_AI_MODE?: string;
  DARWIN_LAB_ALLOWED_ORIGINS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API?: string;
  OPENAI_MODEL?: string;
  OPENAI_LAB_AGENT_MODEL?: string;
  OPENAI_TIMEOUT_MS?: string;
  GITHUB_TOKEN?: string;
  PROJECTFLOW_REPOSITORY?: string;
  PROJECTFLOW_BRANCH?: string;
  PROJECTFLOW_PRODUCTION_URL?: string;
  PROJECTFLOW_STUDY_URL?: string;
  DARWIN_GITHUB_REPOSITORY?: string;
  DARWIN_API_BASE_URL?: string;
}

interface LabOperatorIdentity {
  actor: 'operator' | 'viewer' | 'local-development';
}

type JsonResponder = (body: unknown, init?: ResponseInit) => Response;

const parseBody = async (request: Request) => {
  const body = await readBoundedBody(request, 256_000);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error('invalid_json');
  }
};

const parseTimeout = (value?: string) => {
  const parsed = Number(value ?? 90_000);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1_000), 120_000)
    : 90_000;
};

const dispatchManagedRunner = async (
  experimentId: string,
  env: LabHandlerEnvironment,
) => {
  if (!env.GITHUB_TOKEN) return;
  const repository = env.DARWIN_GITHUB_REPOSITORY ?? 'sjohnston1972/darwin';
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/darwin-lab-runner.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'darwin-lab',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { experiment_id: experimentId },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`managed_runner_dispatch_${response.status}`);
  }
};

const isTerminal = (status: LabExperiment['runs'][number]['status']) =>
  ['succeeded', 'failed', 'abandoned', 'blocked'].includes(status);

const allowedTargetOrigins = (env?: LabHandlerEnvironment) =>
  new Set(
    (
      env?.DARWIN_LAB_ALLOWED_ORIGINS ??
      'http://localhost:5174,http://127.0.0.1:5174'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

const targetAllowed = (targetUrl: string, env?: LabHandlerEnvironment) => {
  const target = new URL(targetUrl);
  return allowedTargetOrigins(env).has(target.origin);
};

const canonicalStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256 = async (value: unknown) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalStringify(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const createTaskDefinition = async (task: LabTaskInput) => {
  const definitionVersion = 1 as const;
  const definitionHash = await sha256({ definitionVersion, ...task });
  return {
    ...task,
    taskDefinitionId: `lab-task-${definitionHash.slice(0, 16)}`,
    definitionVersion,
    definitionHash,
  };
};

const labProvenance = (
  experimentId: string,
  task: { taskDefinitionId: string; definitionHash: string },
  runIds: string[] = [],
  evidence?: { evidencePackId: string; evidenceHash: string } | null,
) => ({
  evidenceClass: 'darwin_lab' as const,
  label: 'Darwin Lab',
  labExperimentId: experimentId,
  taskDefinitionId: task.taskDefinitionId,
  taskDefinitionHash: task.definitionHash,
  evidencePackId: evidence?.evidencePackId ?? null,
  evidenceHash: evidence?.evidenceHash ?? null,
  runIds,
});

const defaultPersonaAllocation = (populationSize: number) => {
  const personas = [
    'novice',
    'experienced_pm',
    'executive',
    'keyboard_first',
    'mobile',
    'cautious',
    'impatient',
    'search_first',
  ] as const;
  const counts = new Map<string, number>();
  for (let index = 0; index < populationSize; index += 1) {
    const persona = personas[index % personas.length]!;
    counts.set(persona, (counts.get(persona) ?? 0) + 1);
  }
  return [...counts].map(([persona, count]) => ({ persona, count }));
};

const errorResponse = (
  json: JsonResponder,
  error: unknown,
  fallback: string,
  status = 400,
) => {
  const message = error instanceof Error ? error.message : fallback;
  if (error instanceof PayloadTooLargeError) {
    return json(
      { error: 'payload_too_large', message: 'Request body is too large.' },
      { status: 413 },
    );
  }
  if (message === 'invalid_json') {
    return json(
      { error: 'invalid_request', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }
  return json({ error: 'lab_request_failed', message }, { status });
};

const missingExperiment = (json: JsonResponder) =>
  json(
    {
      error: 'lab_experiment_not_found',
      message: 'Lab experiment was not found.',
    },
    { status: 404 },
  );

export async function handleLabRequest(
  request: Request,
  env: LabHandlerEnvironment | undefined,
  json: JsonResponder,
  operatorIdentity: LabOperatorIdentity | null,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (
    !pathname.startsWith('/api/lab/') &&
    pathname !== '/api/behavioural-evals'
  )
    return null;
  const repository = getLabRepository(env?.DB);

  if (request.method === 'GET' && pathname === '/api/behavioural-evals') {
    const experiments = await repository.listExperiments();
    return json({
      evals: experiments
        .map((experiment) => experiment.behaviouralEval)
        .filter((evaluation): evaluation is NonNullable<typeof evaluation> =>
          Boolean(evaluation),
        ),
    });
  }

  if (request.method === 'GET' && pathname === '/api/lab/experiments') {
    const requestedStatus = url.searchParams.get('status');
    const status = requestedStatus
      ? LabExperimentStatusSchema.safeParse(requestedStatus)
      : null;
    if (status && !status.success) {
      return json(
        { error: 'invalid_request', message: 'Unsupported Lab status filter.' },
        { status: 400 },
      );
    }
    const experiments = await repository.listExperiments(status?.data);
    return json(LabExperimentsResponseSchema.parse({ experiments }));
  }

  if (request.method === 'POST' && pathname === '/api/lab/experiments') {
    try {
      const input = LabExperimentCreateRequestSchema.parse(
        await parseBody(request),
      );
      if (!targetAllowed(input.targetUrl, env)) {
        return json(
          {
            error: 'lab_target_forbidden',
            message:
              'Darwin Lab runs only against configured local, test, preview, or staging origins.',
          },
          { status: 403 },
        );
      }
      const experimentId = `lab-exp-${crypto.randomUUID()}`;
      const task = await createTaskDefinition(input.task);
      const personaAllocation = input.personaAllocation.length
        ? input.personaAllocation
        : defaultPersonaAllocation(input.populationSize);
      if (
        personaAllocation.reduce((total, item) => total + item.count, 0) !==
        input.populationSize
      ) {
        return json(
          {
            error: 'lab_population_invalid',
            message: 'Persona allocation must equal the population size.',
          },
          { status: 400 },
        );
      }
      const experiment = LabExperimentSchema.parse({
        experimentId,
        studyId: `projectflow-darwin-lab-${experimentId.slice(-12)}`,
        name: input.name,
        targetUrl: input.targetUrl,
        targetAppVersion: input.targetAppVersion,
        task,
        populationSize: input.populationSize,
        personaAllocation,
        maxActions: input.maxActions,
        maxDurationMs: input.maxDurationMs,
        seed: input.seed,
        status: 'draft',
        runnerId: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        runs: [],
        evidence: null,
        analysis: null,
        selection: null,
        behaviouralEval: null,
        error: null,
        evidenceError: null,
        archivedAt: null,
        version: 0,
        provenance: labProvenance(experimentId, task),
      });
      await repository.saveExperiment(experiment);
      return json(experiment, {
        status: 201,
        headers: { Location: `/api/lab/experiments/${experimentId}` },
      });
    } catch (error) {
      return errorResponse(json, error, 'Lab experiment was invalid.');
    }
  }

  if (request.method === 'POST' && pathname === '/api/lab/agent-decision') {
    try {
      if (env?.DARWIN_AI_MODE !== 'live') {
        throw new LabReasoningError('Live Lab reasoning is disabled.');
      }
      const input = LabAgentDecisionRequestSchema.parse(
        await parseBody(request),
      );
      const experiment = await repository.getExperiment(input.experimentId);
      if (!experiment) return missingExperiment(json);
      const run = experiment.runs.find(
        (candidate) => candidate.runId === input.runId,
      );
      if (experiment.status !== 'running' || run?.status !== 'running') {
        return json(
          {
            error: 'lab_run_not_active',
            message: 'The Lab run is not active for model decisions.',
          },
          { status: 409 },
        );
      }
      const response = await decideLabAgentAction(input, {
        apiKey: env?.OPENAI_API_KEY || env?.OPENAI_API,
        model: env?.OPENAI_LAB_AGENT_MODEL || 'gpt-5.6-luna',
        timeoutMs: Math.min(parseTimeout(env?.OPENAI_TIMEOUT_MS), 30_000),
      });
      return json(response);
    } catch (error) {
      return errorResponse(json, error, 'Lab agent reasoning failed.', 502);
    }
  }

  const experimentMatch = pathname.match(/^\/api\/lab\/experiments\/([^/]+)$/);
  if (request.method === 'GET' && experimentMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(experimentMatch[1]!),
    );
    return experiment ? json(experiment) : missingExperiment(json);
  }

  if (request.method === 'PUT' && experimentMatch) {
    try {
      const experiment = await repository.getExperiment(
        decodeURIComponent(experimentMatch[1]!),
      );
      if (!experiment) return missingExperiment(json);
      if (experiment.status !== 'draft') {
        return json(
          {
            error: 'lab_state_conflict',
            message: 'Only a draft Lab task can be edited.',
          },
          { status: 409 },
        );
      }
      const input = LabExperimentUpdateRequestSchema.parse(
        await parseBody(request),
      );
      const targetUrl = input.targetUrl ?? experiment.targetUrl;
      if (!targetAllowed(targetUrl, env)) {
        return json(
          {
            error: 'lab_target_forbidden',
            message: 'The edited target is outside the configured Lab origins.',
          },
          { status: 403 },
        );
      }
      const task = input.task
        ? await createTaskDefinition(input.task)
        : experiment.task;
      const populationSize = input.populationSize ?? experiment.populationSize;
      const personaAllocation = input.personaAllocation?.length
        ? input.personaAllocation
        : input.populationSize
          ? defaultPersonaAllocation(populationSize)
          : experiment.personaAllocation;
      if (
        personaAllocation.reduce((total, item) => total + item.count, 0) !==
        populationSize
      ) {
        return json(
          {
            error: 'lab_population_invalid',
            message: 'Persona allocation must equal the population size.',
          },
          { status: 400 },
        );
      }
      const updated = LabExperimentSchema.parse({
        ...experiment,
        ...input,
        targetUrl,
        task,
        populationSize,
        personaAllocation,
        provenance: labProvenance(experiment.experimentId, task),
      });
      const persisted = await repository.compareAndSwapExperiment(
        experiment,
        updated,
      );
      return persisted
        ? json(persisted)
        : json(
            {
              error: 'lab_state_conflict',
              message: 'Draft changed while it was being edited.',
            },
            { status: 409 },
          );
    } catch (error) {
      return errorResponse(json, error, 'Lab task update was invalid.');
    }
  }

  const duplicateMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/duplicate$/,
  );
  if (request.method === 'POST' && duplicateMatch) {
    const source = await repository.getExperiment(
      decodeURIComponent(duplicateMatch[1]!),
    );
    if (!source) return missingExperiment(json);
    const experimentId = `lab-exp-${crypto.randomUUID()}`;
    const duplicate = LabExperimentSchema.parse({
      ...source,
      experimentId,
      studyId: `projectflow-darwin-lab-${experimentId.slice(-12)}`,
      name: `${source.name} copy`.slice(0, 100),
      status: 'draft',
      runnerId: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      runs: [],
      evidence: null,
      analysis: null,
      selection: null,
      behaviouralEval: null,
      error: null,
      evidenceError: null,
      archivedAt: null,
      version: 0,
      provenance: labProvenance(experimentId, source.task),
    });
    await repository.saveExperiment(duplicate);
    return json(duplicate, { status: 201 });
  }

  const lifecycleMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/(cancel|retry|force-fail|archive)$/,
  );
  if (request.method === 'POST' && lifecycleMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(lifecycleMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    const action = lifecycleMatch[2]!;
    if (action === 'retry') {
      if (!['failed', 'cancelled'].includes(experiment.status)) {
        return json(
          {
            error: 'lab_state_conflict',
            message: 'Experiment is not retryable.',
          },
          { status: 409 },
        );
      }
      const experimentId = `lab-exp-${crypto.randomUUID()}`;
      const retry = LabExperimentSchema.parse({
        ...experiment,
        experimentId,
        studyId: `projectflow-darwin-lab-${experimentId.slice(-12)}`,
        name: `${experiment.name} retry`.slice(0, 100),
        status: 'awaiting_runner',
        runnerId: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        runs: [],
        evidence: null,
        analysis: null,
        selection: null,
        error: null,
        evidenceError: null,
        archivedAt: null,
        version: 0,
        provenance: labProvenance(experimentId, experiment.task),
      });
      await repository.saveExperiment(retry);
      try {
        await dispatchManagedRunner(retry.experimentId, env ?? {});
      } catch {
        // The local runner remains a supported fallback if GitHub dispatch is unavailable.
      }
      return json(retry, { status: 201 });
    }
    const allowed =
      action === 'archive'
        ? ['completed', 'analysed', 'failed', 'cancelled'].includes(
            experiment.status,
          )
        : ['draft', 'awaiting_runner', 'running'].includes(experiment.status);
    if (!allowed) {
      return json(
        {
          error: 'lab_state_conflict',
          message: `Experiment cannot ${action}.`,
        },
        { status: 409 },
      );
    }
    const updated = LabExperimentSchema.parse({
      ...experiment,
      status:
        action === 'archive'
          ? 'archived'
          : action === 'cancel'
            ? 'cancelled'
            : 'failed',
      completedAt:
        action === 'archive'
          ? experiment.completedAt
          : new Date().toISOString(),
      archivedAt: action === 'archive' ? new Date().toISOString() : null,
      error:
        action === 'force-fail'
          ? 'Operator force-failed a stranded Darwin Lab experiment.'
          : experiment.error,
    });
    const persisted = await repository.compareAndSwapExperiment(
      experiment,
      updated,
    );
    return persisted
      ? json(persisted)
      : json(
          { error: 'lab_state_conflict', message: 'Experiment changed.' },
          { status: 409 },
        );
  }

  const rebuildEvidenceMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/rebuild-evidence$/,
  );
  if (request.method === 'POST' && rebuildEvidenceMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(rebuildEvidenceMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    if (experiment.status !== 'completed' || experiment.evidence) {
      return json(
        {
          error: 'lab_state_conflict',
          message:
            'Only a completed experiment with missing evidence can retry.',
        },
        { status: 409 },
      );
    }
    try {
      const evidence = await buildLabEvidence(experiment);
      const updated = LabExperimentSchema.parse({
        ...experiment,
        evidence,
        evidenceError: null,
      });
      const persisted = await repository.compareAndSwapExperiment(
        experiment,
        updated,
      );
      return persisted
        ? json(persisted)
        : json(
            { error: 'lab_state_conflict', message: 'Experiment changed.' },
            { status: 409 },
          );
    } catch (error) {
      const failed = LabExperimentSchema.parse({
        ...experiment,
        evidenceError:
          error instanceof Error
            ? error.message
            : 'Lab evidence generation failed.',
      });
      await repository.compareAndSwapExperiment(experiment, failed);
      return errorResponse(json, error, 'Lab evidence generation failed.', 500);
    }
  }

  const startMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/start$/,
  );
  if (request.method === 'POST' && startMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(startMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    if (experiment.status !== 'draft') {
      return json(
        {
          error: 'lab_state_conflict',
          message: 'Experiment cannot be started.',
        },
        { status: 409 },
      );
    }
    const updated = LabExperimentSchema.parse({
      ...experiment,
      status: 'awaiting_runner',
      runnerId: null,
      startedAt: null,
      completedAt: null,
      runs: [],
      evidence: null,
      analysis: null,
      selection: null,
      behaviouralEval: null,
      error: null,
      evidenceError: null,
    });
    const persisted = await repository.compareAndSwapExperiment(
      experiment,
      updated,
    );
    if (persisted) {
      try {
        await dispatchManagedRunner(updated.experimentId, env ?? {});
      } catch {
        // The local runner remains a supported fallback if GitHub dispatch is unavailable.
      }
    }
    return persisted
      ? json(persisted)
      : json(
          {
            error: 'lab_state_conflict',
            message: 'Experiment changed while it was being queued.',
          },
          { status: 409 },
        );
  }

  const claimMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/claim$/,
  );
  if (request.method === 'POST' && claimMatch) {
    try {
      const input = LabRunnerClaimRequestSchema.parse(await parseBody(request));
      const experiment = await repository.getExperiment(
        decodeURIComponent(claimMatch[1]!),
      );
      if (!experiment) return missingExperiment(json);
      if (experiment.status !== 'awaiting_runner') {
        return json(
          {
            error: 'lab_state_conflict',
            message: 'Experiment is not awaiting a runner.',
          },
          { status: 409 },
        );
      }
      const updated = LabExperimentSchema.parse({
        ...experiment,
        status: 'running',
        runnerId: input.runnerId,
        startedAt: new Date().toISOString(),
      });
      const persisted = await repository.compareAndSwapExperiment(
        experiment,
        updated,
      );
      return persisted
        ? json(persisted)
        : json(
            {
              error: 'lab_state_conflict',
              message: 'Another runner already claimed this experiment.',
            },
            { status: 409 },
          );
    } catch (error) {
      return errorResponse(json, error, 'Lab runner claim was invalid.');
    }
  }

  const runsMatch = pathname.match(/^\/api\/lab\/experiments\/([^/]+)\/runs$/);
  if (request.method === 'POST' && runsMatch) {
    try {
      const input = LabAgentRunStartRequestSchema.parse(
        await parseBody(request),
      );
      const experiment = await repository.getExperiment(
        decodeURIComponent(runsMatch[1]!),
      );
      if (!experiment) return missingExperiment(json);
      if (experiment.status !== 'running') {
        return json(
          {
            error: 'lab_state_conflict',
            message: 'Experiment is not running.',
          },
          { status: 409 },
        );
      }
      if (
        input.studyId !== experiment.studyId ||
        input.taskDefinitionId !== experiment.task.taskDefinitionId ||
        input.taskDefinitionHash !== experiment.task.definitionHash ||
        input.appVersion !== experiment.targetAppVersion ||
        input.populationOrdinal > experiment.populationSize
      ) {
        return json(
          {
            error: 'lab_provenance_conflict',
            message:
              'Run identity does not match the immutable experiment target and task.',
          },
          { status: 409 },
        );
      }
      if (
        experiment.runs.length >= experiment.populationSize ||
        experiment.runs.some((run) => run.runId === input.runId)
      ) {
        return json(
          {
            error: 'lab_population_conflict',
            message: 'Run is duplicated or exceeds the population budget.',
          },
          { status: 409 },
        );
      }
      const run = LabAgentRunSchema.parse({
        ...input,
        experimentId: experiment.experimentId,
        provenance: labProvenance(experiment.experimentId, experiment.task, [
          input.runId,
        ]),
        status: 'running',
        finishedAt: null,
        durationMs: null,
        taskOutcome: 'open',
        frictionLabels: [],
        telemetryEventIds: [],
        actions: [],
        error: null,
      });
      const persisted = await repository.createRun(experiment, run);
      return persisted
        ? json(persisted, { status: 201 })
        : json(
            {
              error: 'lab_population_conflict',
              message: 'Run ID or population slot is already occupied.',
            },
            { status: 409 },
          );
    } catch (error) {
      return errorResponse(json, error, 'Lab run was invalid.');
    }
  }

  const actionMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/runs\/([^/]+)\/actions$/,
  );
  if (request.method === 'POST' && actionMatch) {
    try {
      const input = LabAgentActionAppendRequestSchema.parse(
        await parseBody(request),
      );
      const experiment = await repository.getExperiment(
        decodeURIComponent(actionMatch[1]!),
      );
      if (!experiment) return missingExperiment(json);
      const runId = decodeURIComponent(actionMatch[2]!);
      const run = experiment.runs.find(
        (candidate) => candidate.runId === runId,
      );
      if (!run || run.status !== 'running') {
        return json(
          { error: 'lab_run_not_active', message: 'Lab run is not active.' },
          { status: 409 },
        );
      }
      if (run.actions.length >= experiment.maxActions) {
        return json(
          {
            error: 'lab_action_budget_conflict',
            message:
              'Action is duplicated, out of order, or exceeds the budget.',
          },
          { status: 409 },
        );
      }
      if (
        input.action.provenance.evidenceClass !== 'darwin_lab' ||
        input.action.provenance.labExperimentId !== experiment.experimentId ||
        input.action.provenance.taskDefinitionHash !==
          experiment.task.definitionHash ||
        !input.action.provenance.runIds.includes(runId)
      ) {
        return json(
          {
            error: 'lab_provenance_conflict',
            message: 'Action provenance does not match its Lab run.',
          },
          { status: 409 },
        );
      }
      const outcome = await repository.appendAction(
        experiment.experimentId,
        runId,
        input.action,
      );
      if (outcome === 'conflict') {
        return json(
          {
            error: 'lab_action_budget_conflict',
            message:
              'Action conflicts with an existing action or inactive run.',
          },
          { status: 409 },
        );
      }
      const persisted = await repository.getExperiment(experiment.experimentId);
      const updatedRun = persisted?.runs.find(
        (candidate) => candidate.runId === runId,
      );
      return json(updatedRun, { status: outcome === 'created' ? 202 : 200 });
    } catch (error) {
      return errorResponse(json, error, 'Lab action was invalid.');
    }
  }

  const finishMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/runs\/([^/]+)\/finish$/,
  );
  if (request.method === 'POST' && finishMatch) {
    try {
      const input = LabAgentRunFinishRequestSchema.parse(
        await parseBody(request),
      );
      const experiment = await repository.getExperiment(
        decodeURIComponent(finishMatch[1]!),
      );
      if (!experiment) return missingExperiment(json);
      const runId = decodeURIComponent(finishMatch[2]!);
      const run = experiment.runs.find(
        (candidate) => candidate.runId === runId,
      );
      if (!run) {
        return json(
          { error: 'lab_run_not_found', message: 'Lab run was not found.' },
          { status: 404 },
        );
      }
      const updatedRun = LabAgentRunSchema.parse({ ...run, ...input });
      const persistedRun = await repository.finishRun(
        experiment.experimentId,
        run,
        updatedRun,
      );
      if (!persistedRun) {
        return json(
          {
            error: 'lab_run_finish_conflict',
            message: 'Run was already finished with a different result.',
          },
          { status: 409 },
        );
      }
      const latest = await repository.getExperiment(experiment.experimentId);
      if (!latest) return missingExperiment(json);
      const complete =
        latest.runs.length === latest.populationSize &&
        latest.runs.every((item) => isTerminal(item.status));
      if (!complete || latest.status !== 'running') return json(persistedRun);

      const completed = LabExperimentSchema.parse({
        ...latest,
        status: 'completed',
        completedAt: new Date().toISOString(),
        evidenceError: null,
      });
      const persistedCompleted = await repository.compareAndSwapExperiment(
        latest,
        completed,
      );
      if (!persistedCompleted) return json(persistedRun);

      try {
        const evidence = await buildLabEvidence(persistedCompleted);
        const behaviouralEval = persistedCompleted.behaviouralEval
          ? {
              ...persistedCompleted.behaviouralEval,
              status:
                evidence.metrics.completionRate >=
                  persistedCompleted.behaviouralEval.baseline.completionRate &&
                evidence.metrics.medianActions !== null &&
                evidence.metrics.medianActions <=
                  persistedCompleted.behaviouralEval.maxActions &&
                evidence.population.successful === evidence.population.completed
                  ? ('passed' as const)
                  : ('failed' as const),
              lastRun: {
                completionRate: evidence.metrics.completionRate,
                medianActions: evidence.metrics.medianActions,
                population: evidence.population.completed,
                completedAt: new Date().toISOString(),
              },
            }
          : null;
        const withEvidence = LabExperimentSchema.parse({
          ...persistedCompleted,
          evidence,
          behaviouralEval,
          evidenceError: null,
        });
        await repository.compareAndSwapExperiment(
          persistedCompleted,
          withEvidence,
        );
      } catch (error) {
        const failedEvidence = LabExperimentSchema.parse({
          ...persistedCompleted,
          evidenceError:
            error instanceof Error
              ? error.message
              : 'Lab evidence generation failed.',
        });
        await repository.compareAndSwapExperiment(
          persistedCompleted,
          failedEvidence,
        );
      }
      return json(persistedRun);
    } catch (error) {
      return errorResponse(json, error, 'Lab run result was invalid.');
    }
  }

  const analyseMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/analyse$/,
  );
  if (request.method === 'POST' && analyseMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(analyseMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    if (env?.DARWIN_AI_MODE !== 'live') {
      return json(
        {
          error: 'lab_reasoning_unavailable',
          message: 'Live Lab population analysis is disabled.',
        },
        { status: 503 },
      );
    }
    if (experiment.status !== 'completed' || !experiment.evidence) {
      return json(
        {
          error: 'lab_state_conflict',
          message: 'A completed Darwin Lab evidence pack is required.',
        },
        { status: 409 },
      );
    }
    const analysing = LabExperimentSchema.parse({
      ...experiment,
      status: 'analysing',
      error: null,
    });
    const persistedAnalysing = await repository.compareAndSwapExperiment(
      experiment,
      analysing,
    );
    if (!persistedAnalysing) {
      return json(
        {
          error: 'lab_state_conflict',
          message: 'Experiment changed while analysis was starting.',
        },
        { status: 409 },
      );
    }
    try {
      const analysis = await analyseLabEvidence(
        persistedAnalysing,
        persistedAnalysing.evidence!,
        {
          apiKey: env?.OPENAI_API_KEY || env?.OPENAI_API,
          model: env?.OPENAI_MODEL || 'gpt-5.6',
          timeoutMs: parseTimeout(env?.OPENAI_TIMEOUT_MS),
        },
      );
      const updated = LabExperimentSchema.parse({
        ...persistedAnalysing,
        status: 'analysed',
        analysis,
      });
      const persisted = await repository.compareAndSwapExperiment(
        persistedAnalysing,
        updated,
      );
      return persisted
        ? json(persisted)
        : json(
            {
              error: 'lab_state_conflict',
              message: 'Experiment changed while analysis was completing.',
            },
            { status: 409 },
          );
    } catch (error) {
      const failed = LabExperimentSchema.parse({
        ...persistedAnalysing,
        status: 'completed',
        error: error instanceof Error ? error.message : 'Lab analysis failed.',
      });
      await repository.compareAndSwapExperiment(persistedAnalysing, failed);
      return errorResponse(json, error, 'Lab analysis failed.', 502);
    }
  }

  const selectMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/mutations\/select$/,
  );
  if (request.method === 'POST' && selectMatch) {
    try {
      const input = LabMutationSelectionRequestSchema.parse(
        await parseBody(request),
      );
      const experiment = await repository.getExperiment(
        decodeURIComponent(selectMatch[1]!),
      );
      if (!experiment) return missingExperiment(json);
      if (
        experiment.status !== 'analysed' ||
        !experiment.analysis?.mutations.some(
          (mutation) => mutation.mutationId === input.mutationId,
        )
      ) {
        return json(
          {
            error: 'lab_selection_conflict',
            message: 'Mutation is not in the analysed Lab portfolio.',
          },
          { status: 409 },
        );
      }
      const selection = LabSelectionSchema.parse({
        provenance: labProvenance(
          experiment.experimentId,
          experiment.task,
          experiment.runs.map((run) => run.runId),
          experiment.evidence,
        ),
        selectionId: `lab-selection-${crypto.randomUUID()}`,
        experimentId: experiment.experimentId,
        mutationId: input.mutationId,
        selectedAt: new Date().toISOString(),
        selectedBy:
          operatorIdentity?.actor === 'local-development'
            ? 'local-development'
            : 'operator',
        status: 'approved_for_controlled_implementation',
        manifestId: null,
        executionId: null,
      });
      const updated = LabExperimentSchema.parse({ ...experiment, selection });
      const persisted = await repository.compareAndSwapExperiment(
        experiment,
        updated,
      );
      return persisted
        ? json(persisted)
        : json(
            {
              error: 'lab_state_conflict',
              message: 'Experiment changed while selection was recorded.',
            },
            { status: 409 },
          );
    } catch (error) {
      return errorResponse(json, error, 'Lab mutation selection failed.');
    }
  }

  const manifestMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/codex-manifest$/,
  );
  if (request.method === 'POST' && manifestMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(manifestMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    const mutation = experiment.analysis?.mutations.find(
      (candidate) => candidate.mutationId === experiment.selection?.mutationId,
    );
    if (
      !experiment.evidence ||
      !experiment.analysis ||
      !experiment.selection ||
      !mutation
    ) {
      return json(
        {
          error: 'lab_selection_conflict',
          message: 'Select an evidence-citing Darwin Lab mutation first.',
        },
        { status: 409 },
      );
    }
    try {
      const snapshot = await captureRepositorySnapshot({
        fullName: env?.PROJECTFLOW_REPOSITORY,
        branch: env?.PROJECTFLOW_BRANCH,
        githubToken: env?.GITHUB_TOKEN,
        productionUrl: env?.PROJECTFLOW_PRODUCTION_URL,
        studyUrl: env?.PROJECTFLOW_STUDY_URL,
      });
      const provenance = {
        ...experiment.evidence.provenance,
        evidencePackId: experiment.evidence.evidencePackId,
        evidenceHash: experiment.evidence.evidenceHash,
      };
      const payload = {
        provenance,
        analysisId: experiment.analysis.analysisId,
        mutationId: mutation.mutationId,
        mutationIds: [mutation.mutationId],
        evidenceHash: experiment.evidence.evidenceHash,
        promptVersion: '3.0.0' as const,
        repositoryCommit: snapshot.context.baseSha,
        repository: snapshot.context,
        brief: `[Darwin Lab] ${mutation.implementationBrief}`,
        evidenceCitations: mutation.evidenceIds,
        allowedPaths: snapshot.context.mutablePaths,
        protectedPaths: snapshot.context.protectedPaths,
        acceptanceCriteria: [
          experiment.task.successDescription,
          `Retest: ${mutation.validationPlan}`,
        ],
        validationCommands: snapshot.context.validationCommands,
      };
      const manifestHash = await sha256(payload);
      const manifest = CodexImplementationManifestSchema.parse({
        ...payload,
        manifestId: `manifest-${manifestHash.slice(0, 12)}`,
        manifestHash,
        createdAt: new Date().toISOString(),
      });
      const telemetryRepository = getTelemetryRepository(env?.DB);
      await telemetryRepository.saveCodexManifest(manifest);
      const persistedManifest =
        (await telemetryRepository.getCodexManifestById(manifest.manifestId)) ??
        manifest;
      const withManifest = LabExperimentSchema.parse({
        ...experiment,
        selection: {
          ...experiment.selection,
          manifestId: persistedManifest.manifestId,
        },
      });
      await repository.compareAndSwapExperiment(experiment, withManifest);
      return json(persistedManifest, { status: 201 });
    } catch (error) {
      return errorResponse(
        json,
        error,
        'Darwin Lab implementation manifest could not be prepared.',
        502,
      );
    }
  }

  const promoteMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/promote-eval$/,
  );
  if (request.method === 'POST' && promoteMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(promoteMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    if (
      !experiment.evidence ||
      !['completed', 'analysed'].includes(experiment.status) ||
      experiment.evidence.signals.length === 0
    ) {
      return json(
        {
          error: 'lab_state_conflict',
          message:
            'A completed Darwin Lab evidence pack is required to create an eval.',
        },
        { status: 409 },
      );
    }
    if (experiment.behaviouralEval) return json(experiment);
    const selectedMutation = experiment.analysis?.mutations.find(
      (mutation) => mutation.mutationId === experiment.selection?.mutationId,
    );
    const existingEvals = (await repository.listExperiments()).filter(
      (candidate) => candidate.behaviouralEval,
    ).length;
    const evaluation = BehaviouralEvalSchema.parse({
      evalId: `BE-${String(existingEvals + 1).padStart(3, '0')}`,
      goal: experiment.task.instruction,
      passCriteria: [
        experiment.task.successDescription,
        'The task completes within the behavioural action budget.',
        'No navigation loop or abandonment occurs.',
      ],
      forbiddenOutcomes: ['navigation loop', 'incorrect result', 'abandonment'],
      maxActions: Math.min(experiment.maxActions, 5),
      sourceExperimentId: experiment.experimentId,
      evidencePackId: experiment.evidence.evidencePackId,
      evidenceIds: experiment.evidence.signals.map(
        (signal) => signal.evidenceId,
      ),
      evidenceHash: experiment.evidence.evidenceHash,
      seed: experiment.seed,
      targetUrl: experiment.targetUrl,
      baseline: {
        completionRate: experiment.evidence.metrics.completionRate,
        medianActions: experiment.evidence.metrics.medianActions,
        population: experiment.evidence.population.completed,
      },
      status: 'active',
      codexBrief: [
        `Make behavioural eval pass: ${experiment.task.instruction}`,
        'Do not change the oracle, seed, thresholds, telemetry provenance, or protected paths.',
        selectedMutation
          ? `Use the selected evidence-led hypothesis as context: ${selectedMutation.implementationBrief}`
          : 'Choose the implementation; Darwin does not prescribe a UI click path.',
      ].join('\n'),
      createdAt: new Date().toISOString(),
    });
    const updated = LabExperimentSchema.parse({
      ...experiment,
      behaviouralEval: evaluation,
    });
    const persisted = await repository.compareAndSwapExperiment(
      experiment,
      updated,
    );
    return persisted
      ? json(persisted, { status: 201 })
      : json(
          { error: 'lab_state_conflict', message: 'Experiment changed.' },
          { status: 409 },
        );
  }

  const rerunMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/rerun-eval$/,
  );
  if (request.method === 'POST' && rerunMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(rerunMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    if (!experiment.behaviouralEval) {
      return json(
        {
          error: 'lab_state_conflict',
          message: 'Promote an eval before rerunning it.',
        },
        { status: 409 },
      );
    }
    const updated = LabExperimentSchema.parse({
      ...experiment,
      status: 'awaiting_runner',
      runnerId: null,
      startedAt: null,
      completedAt: null,
      runs: [],
      evidence: null,
      analysis: null,
      selection: null,
      error: null,
      evidenceError: null,
      behaviouralEval: { ...experiment.behaviouralEval, status: 'active' },
    });
    const persisted = await repository.compareAndSwapExperiment(
      experiment,
      updated,
    );
    return persisted
      ? json(persisted)
      : json(
          { error: 'lab_state_conflict', message: 'Experiment changed.' },
          { status: 409 },
        );
  }

  return null;
}

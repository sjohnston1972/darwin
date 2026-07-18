import {
  LabAgentActionAppendRequestSchema,
  LabAgentDecisionRequestSchema,
  LabAgentRunFinishRequestSchema,
  LabAgentRunSchema,
  LabAgentRunStartRequestSchema,
  LabExperimentCreateRequestSchema,
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  LabMutationSelectionRequestSchema,
  LabRunnerClaimRequestSchema,
  LabSelectionSchema,
  type LabExperiment,
} from '@darwin/shared';

import { buildLabEvidence } from './evidence';
import { getLabRepository } from './lab-repository';
import {
  LabReasoningError,
  analyseLabEvidence,
  decideLabAgentAction,
} from './reasoning';

interface LabHandlerEnvironment {
  DB?: D1Database;
  DARWIN_AI_MODE?: string;
  DARWIN_LAB_ALLOWED_ORIGINS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API?: string;
  OPENAI_MODEL?: string;
  OPENAI_LAB_AGENT_MODEL?: string;
  OPENAI_TIMEOUT_MS?: string;
}

interface LabOperatorIdentity {
  actor: 'operator' | 'viewer' | 'local-development';
}

type JsonResponder = (body: unknown, init?: ResponseInit) => Response;

const parseBody = async (request: Request) => {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > 256_000) throw new Error('payload_too_large');
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 256_000) {
    throw new Error('payload_too_large');
  }
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

const errorResponse = (
  json: JsonResponder,
  error: unknown,
  fallback: string,
  status = 400,
) => {
  const message = error instanceof Error ? error.message : fallback;
  if (message === 'payload_too_large') {
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
  if (!pathname.startsWith('/api/lab/')) return null;
  const repository = getLabRepository(env?.DB);

  if (request.method === 'GET' && pathname === '/api/lab/experiments') {
    const status = url.searchParams.get('status') ?? undefined;
    const experiments = await repository.listExperiments(
      status as Parameters<typeof repository.listExperiments>[0],
    );
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
      const experiment = LabExperimentSchema.parse({
        experimentId,
        studyId: `projectflow-darwin-lab-${experimentId.slice(-12)}`,
        name: input.name,
        targetUrl: input.targetUrl,
        task: {
          taskId: 'find-apollo-assignees',
          name: 'Find Project Apollo assignees',
          instruction: 'Find everyone assigned to Project Apollo.',
          successDescription:
            'The agent identifies the complete Project Apollo assignment set.',
        },
        populationSize: input.populationSize,
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
        error: null,
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

  const startMatch = pathname.match(
    /^\/api\/lab\/experiments\/([^/]+)\/start$/,
  );
  if (request.method === 'POST' && startMatch) {
    const experiment = await repository.getExperiment(
      decodeURIComponent(startMatch[1]!),
    );
    if (!experiment) return missingExperiment(json);
    if (!['draft', 'failed'].includes(experiment.status)) {
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
      error: null,
    });
    await repository.saveExperiment(updated);
    return json(updated);
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
      await repository.saveExperiment(updated);
      return json(updated);
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
        status: 'running',
        finishedAt: null,
        durationMs: null,
        taskOutcome: 'open',
        frictionLabels: [],
        telemetryEventIds: [],
        actions: [],
        error: null,
      });
      const updated = LabExperimentSchema.parse({
        ...experiment,
        runs: [...experiment.runs, run],
      });
      await repository.saveExperiment(updated);
      return json(run, { status: 201 });
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
      if (
        run.actions.length >= experiment.maxActions ||
        input.action.ordinal !== run.actions.length + 1 ||
        run.actions.some((action) => action.actionId === input.action.actionId)
      ) {
        return json(
          {
            error: 'lab_action_budget_conflict',
            message:
              'Action is duplicated, out of order, or exceeds the budget.',
          },
          { status: 409 },
        );
      }
      const updatedRun = LabAgentRunSchema.parse({
        ...run,
        actions: [...run.actions, input.action],
      });
      const updated = LabExperimentSchema.parse({
        ...experiment,
        runs: experiment.runs.map((candidate) =>
          candidate.runId === runId ? updatedRun : candidate,
        ),
      });
      await repository.saveExperiment(updated);
      return json(updatedRun, { status: 202 });
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
      if (!run || run.status !== 'running') {
        return json(
          { error: 'lab_run_not_active', message: 'Lab run is not active.' },
          { status: 409 },
        );
      }
      const updatedRun = LabAgentRunSchema.parse({ ...run, ...input });
      const runs = experiment.runs.map((candidate) =>
        candidate.runId === runId ? updatedRun : candidate,
      );
      const complete =
        runs.length === experiment.populationSize &&
        runs.every((item) => isTerminal(item.status));
      const intermediate = LabExperimentSchema.parse({
        ...experiment,
        runs,
        status: complete ? 'completed' : experiment.status,
        completedAt: complete ? new Date().toISOString() : null,
      });
      const evidence = complete ? await buildLabEvidence(intermediate) : null;
      const updated = LabExperimentSchema.parse({
        ...intermediate,
        evidence: evidence ?? intermediate.evidence,
      });
      await repository.saveExperiment(updated);
      return json(updatedRun);
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
          message: 'A completed synthetic evidence pack is required.',
        },
        { status: 409 },
      );
    }
    const analysing = LabExperimentSchema.parse({
      ...experiment,
      status: 'analysing',
      error: null,
    });
    await repository.saveExperiment(analysing);
    try {
      const analysis = await analyseLabEvidence(
        analysing,
        analysing.evidence!,
        {
          apiKey: env?.OPENAI_API_KEY || env?.OPENAI_API,
          model: env?.OPENAI_MODEL || 'gpt-5.6',
          timeoutMs: parseTimeout(env?.OPENAI_TIMEOUT_MS),
        },
      );
      const updated = LabExperimentSchema.parse({
        ...analysing,
        status: 'analysed',
        analysis,
      });
      await repository.saveExperiment(updated);
      return json(updated);
    } catch (error) {
      const failed = LabExperimentSchema.parse({
        ...analysing,
        status: 'completed',
        error: error instanceof Error ? error.message : 'Lab analysis failed.',
      });
      await repository.saveExperiment(failed);
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
        selectionId: `lab-selection-${crypto.randomUUID()}`,
        experimentId: experiment.experimentId,
        mutationId: input.mutationId,
        selectedAt: new Date().toISOString(),
        selectedBy:
          operatorIdentity?.actor === 'local-development'
            ? 'local-development'
            : 'operator',
        status: 'approved_for_controlled_implementation',
      });
      const updated = LabExperimentSchema.parse({ ...experiment, selection });
      await repository.saveExperiment(updated);
      return json(updated);
    } catch (error) {
      return errorResponse(json, error, 'Lab mutation selection failed.');
    }
  }

  return null;
}

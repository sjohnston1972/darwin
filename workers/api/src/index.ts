import {
  CodexImplementationManifestSchema,
  CodexManifestRequestSchema,
  DemoResetResponseSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  GenomeHistoryResponseSchema,
  ObservationArchivesResponseSchema,
  ParticipantWorkspaceResponseSchema,
  ProjectFlowWorkspaceSchema,
  RepositoryExecutionCallbackSchema,
  RepositoryMutationExecutionSchema,
  RepositoryRollbackCallbackSchema,
  SimulationRequestSchema,
  StudyEventsResponseSchema,
  StudySessionResponseSchema,
  StudyTelemetryEventSchema,
  TargetApplicationConnectionSchema,
  TargetConnectionRequestSchema,
  TelemetryReceiptSchema,
  type HealthResponse,
  type SimulationResult,
} from '@darwin/shared';

import { simulate } from './simulation';
import { getTelemetryRepository } from './persistence/telemetry-repository';
import { buildEvidencePack } from './evidence';
import {
  EvidenceReasoningError,
  analyseEvidence,
  analysisCacheKey,
  buildCodexManifest,
} from './reasoning';
import { captureRepositorySnapshot } from './repository/github-source';
import {
  attachRepositoryRollback,
  createRepositoryRollback,
  createRepositoryExecution,
  retryRepositoryExecution,
  updateRepositoryRollback,
  updateRepositoryExecution,
} from './repository/execution';
import {
  GitHubMergeStateUnknownError,
  dispatchRollbackWorkflow,
  dispatchEvolutionWorkflow,
  dispatchResetWorkflow,
  mergeRollbackPullRequest,
  mergeEvolutionPullRequest,
} from './repository/github-actions';
import {
  authorizeOperator,
  authorizeTargetRequest,
  type OperatorCapability,
  type OperatorIdentity,
} from './security/auth';
import {
  issueExecutionCallbackCredential,
  verifyExecutionCallback,
} from './security/callback';

export interface Env {
  DB?: D1Database;
  INGESTION_RATE_LIMITER?: RateLimit;
  SIMULATION_RATE_LIMITER?: RateLimit;
  ALLOWED_ORIGINS: string;
  DARWIN_AI_MODE: string;
  DARWIN_DEMO_SEED: string;
  DARWIN_EVENT_COUNT: string;
  OPENAI_API_KEY?: string;
  OPENAI_API?: string;
  OPENAI_MODEL: string;
  OPENAI_TIMEOUT_MS: string;
  PROJECTFLOW_REPOSITORY: string;
  PROJECTFLOW_BRANCH: string;
  PROJECTFLOW_PRODUCTION_URL: string;
  PROJECTFLOW_STUDY_URL: string;
  PROJECTFLOW_STUDY_ID?: string;
  PROJECTFLOW_AUTOMATED_STUDY_ID?: string;
  GITHUB_TOKEN?: string;
  DARWIN_CALLBACK_TOKEN?: string;
  DARWIN_OPERATOR_TOKEN?: string;
  DARWIN_VIEWER_TOKEN?: string;
  PROJECTFLOW_INGESTION_SECRET?: string;
}

const defaultCorsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

const openAIKey = (env?: Partial<Env>) =>
  env?.OPENAI_API_KEY || env?.OPENAI_API;

const jsonResponse = (
  body: unknown,
  init: ResponseInit = {},
  corsHeaders: Record<string, string> = {
    ...defaultCorsHeaders,
    'Access-Control-Allow-Origin': '*',
  },
) => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  Object.entries(corsHeaders).forEach(([name, value]) =>
    headers.set(name, value),
  );

  return new Response(JSON.stringify(body), { ...init, headers });
};

const requiredOperatorCapability = (
  method: string,
  pathname: string,
): OperatorCapability => {
  if (pathname === '/api/demo/reset') return 'reset';
  if (pathname.startsWith('/api/target-connection')) {
    return method === 'GET' ? 'observe' : 'connect';
  }
  if (pathname === '/api/simulations') return 'simulate';
  if (/\/release$/.test(pathname)) return 'release';
  if (method === 'POST' && pathname.includes('/analyse-evidence')) {
    return 'reason';
  }
  if (method === 'POST' && pathname.endsWith('/evidence')) return 'reason';
  if (
    method === 'POST' &&
    (pathname.includes('/codex-manifest') ||
      pathname.includes('/repository-executions'))
  ) {
    return 'execute';
  }
  if (
    pathname === '/api/genome' ||
    pathname === '/api/observations/archives' ||
    pathname.includes('/events') ||
    pathname.includes('/sessions/') ||
    pathname.includes('/evidence') ||
    pathname.includes('/repository-executions') ||
    pathname.startsWith('/api/simulations/')
  ) {
    return 'inspect_evidence';
  }
  return 'observe';
};

const isCallbackRoute = (pathname: string) =>
  /^\/api\/repository-executions\/[^/]+\/(?:manifest|callback|rollback\/callback)$/.test(
    pathname,
  );

const isTargetRoute = (pathname: string) =>
  pathname === '/api/telemetry/events' ||
  /^\/api\/studies\/[^/]+\/participants\/[^/]+\/workspace$/.test(pathname);

const corsForRequest = (request: Request, env?: Partial<Env>) => {
  const configuredOrigins = (env?.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get('Origin');
  const originAllowed =
    configuredOrigins.length === 0 ||
    requestOrigin === null ||
    configuredOrigins.includes(requestOrigin);
  const corsHeaders = {
    ...defaultCorsHeaders,
    ...(configuredOrigins.length === 0
      ? { 'Access-Control-Allow-Origin': '*' }
      : originAllowed && requestOrigin
        ? {
            'Access-Control-Allow-Origin': requestOrigin,
            Vary: 'Origin',
          }
        : {}),
  };
  return { corsHeaders, originAllowed };
};

interface StoredSimulation {
  run: SimulationResult['run'];
  summary: SimulationResult['summary'];
  expiresAt: number;
}

const simulationStore = new Map<string, StoredSimulation>();
const simulationTtlMs = 15 * 60 * 1_000;
const maximumStoredSimulations = 4;
let simulationInFlight = false;

const getStoredSimulation = (id: string) => {
  const now = Date.now();
  for (const [storedId, stored] of simulationStore) {
    if (stored.expiresAt <= now) simulationStore.delete(storedId);
  }
  const stored = simulationStore.get(id) ?? null;
  if (stored) {
    simulationStore.delete(id);
    simulationStore.set(id, stored);
  }
  return stored;
};

const storeSimulation = (result: SimulationResult) => {
  simulationStore.set(result.run.id, {
    run: result.run,
    summary: result.summary,
    expiresAt: Date.now() + simulationTtlMs,
  });
  while (simulationStore.size > maximumStoredSimulations) {
    const oldest = simulationStore.keys().next().value as string | undefined;
    if (!oldest) break;
    simulationStore.delete(oldest);
  }
};

const configuredTarget = (env?: Partial<Env>) =>
  TargetConnectionRequestSchema.parse({
    fullName: env?.PROJECTFLOW_REPOSITORY || 'sjohnston1972/projectflow',
    branch: env?.PROJECTFLOW_BRANCH || 'main',
    productionUrl:
      env?.PROJECTFLOW_PRODUCTION_URL ||
      'https://darwin-projectflow.pages.dev/',
    studyUrl:
      env?.PROJECTFLOW_STUDY_URL ||
      'https://darwin-projectflow.pages.dev/?study=true',
  });

const allowedTargetStudies = (env?: Partial<Env>) =>
  new Set([
    env?.PROJECTFLOW_STUDY_ID || 'projectflow-baseline-study',
    env?.PROJECTFLOW_AUTOMATED_STUDY_ID ||
      'projectflow-baseline-automated-study',
  ]);

const targetProvenanceAllowed = (
  event: { studyId: string; source: string },
  env?: Partial<Env>,
) => {
  const measuredStudy =
    env?.PROJECTFLOW_STUDY_ID || 'projectflow-baseline-study';
  const automatedStudy =
    env?.PROJECTFLOW_AUTOMATED_STUDY_ID ||
    'projectflow-baseline-automated-study';
  return (
    (event.studyId === measuredStudy && event.source === 'real_user') ||
    (event.studyId === automatedStudy && event.source === 'automated')
  );
};

const isAllowedTargetVersion = (appVersion: string) =>
  appVersion === 'baseline' ||
  /^\d+\.\d+\.\d+$/.test(appVersion) ||
  /^[a-f0-9]{7,40}(?:-candidate)?$/.test(appVersion);

export const resetSimulationStore = () => {
  simulationStore.clear();
};

export const handleRequest = async (
  request: Request,
  env?: Partial<Env>,
): Promise<Response> => {
  const url = new URL(request.url);
  const { pathname } = url;
  const { corsHeaders, originAllowed } = corsForRequest(request, env);
  const json = (body: unknown, init: ResponseInit = {}) =>
    jsonResponse(body, init, corsHeaders);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: originAllowed ? 204 : 403,
      headers: corsHeaders,
    });
  }

  if (!originAllowed) {
    return json(
      { error: 'origin_forbidden', message: 'Request origin is not allowed.' },
      { status: 403 },
    );
  }

  if (request.method === 'GET' && pathname === '/api/auth/session') {
    const authorization = await authorizeOperator(request, env, 'observe');
    return authorization.ok
      ? json({
          authenticated: true,
          actor: authorization.identity.actor,
          capabilities: authorization.identity.capabilities,
        })
      : json(
          {
            error: authorization.error,
            message: authorization.message,
          },
          { status: authorization.status },
        );
  }

  let operatorIdentity: OperatorIdentity | null = null;
  if (
    pathname !== '/api/health' &&
    !isTargetRoute(pathname) &&
    !isCallbackRoute(pathname)
  ) {
    const authorization = await authorizeOperator(
      request,
      env,
      requiredOperatorCapability(request.method, pathname),
    );
    if (!authorization.ok) {
      return json(
        { error: authorization.error, message: authorization.message },
        { status: authorization.status },
      );
    }
    operatorIdentity = authorization.identity;
    console.info(
      '[darwin:audit]',
      JSON.stringify({
        event: 'operator_request_authorized',
        actor: operatorIdentity.actor,
        action: `${request.method} ${pathname}`,
        target: pathname,
      }),
    );
  }

  const telemetryRepository = getTelemetryRepository(env?.DB);
  const currentExecutionAfterConflict = async (executionId: string) => {
    const current =
      await telemetryRepository.getRepositoryExecution(executionId);
    return current
      ? json(
          {
            error: 'concurrent_update',
            message:
              'Repository execution changed while this request was running.',
            execution: RepositoryMutationExecutionSchema.parse(current),
          },
          { status: 409 },
        )
      : json(
          {
            error: 'not_found',
            message: 'Repository execution no longer exists.',
          },
          { status: 404 },
        );
  };
  const currentReleaseAfterConflict = async (
    executionId: string,
    rollback = false,
  ) => {
    const current =
      await telemetryRepository.getRepositoryExecution(executionId);
    if (!current) {
      return json(
        {
          error: 'not_found',
          message: 'Repository execution no longer exists.',
        },
        { status: 404 },
      );
    }
    const released = rollback
      ? current.rollback?.status === 'released'
      : current.status === 'released';
    return json(RepositoryMutationExecutionSchema.parse(current), {
      status: released ? 200 : 202,
    });
  };
  const currentCycleStart = async (studyId: string) => {
    const cycle = await telemetryRepository.getEvolutionCycle();
    return cycle.studyId === studyId ? cycle.startedAt : null;
  };

  if (request.method === 'GET' && pathname === '/api/health') {
    const response: HealthResponse = {
      status: 'ok',
      service: 'darwin-api',
      version: '0.23.0',
      analysis: {
        mode: 'live',
        model: env?.OPENAI_MODEL || 'gpt-5.6',
        liveModelAvailable:
          env?.DARWIN_AI_MODE === 'live' && Boolean(openAIKey(env)),
      },
      timestamp: new Date().toISOString(),
    };

    return json(response);
  }

  if (request.method === 'GET' && pathname === '/api/genome') {
    return json(
      GenomeHistoryResponseSchema.parse({
        evolutionCycle: await telemetryRepository.getEvolutionCycle(),
        executions: await telemetryRepository.listRepositoryExecutions(),
      }),
    );
  }

  if (request.method === 'GET' && pathname === '/api/observations/archives') {
    const executions = (
      await telemetryRepository.listRepositoryExecutions()
    ).filter((execution) => ['released', 'failed'].includes(execution.status));
    const archives = (
      await Promise.all(
        executions.map(async (execution) => {
          const analysis = await telemetryRepository.getEvidenceAnalysis(
            execution.analysisId,
          );
          if (!analysis) return null;
          const evidence = await telemetryRepository.getEvidence(
            analysis.evidenceId,
          );
          if (!evidence) return null;
          return {
            archiveId: execution.executionId,
            evidence,
            analysis,
            execution: {
              executionId: execution.executionId,
              manifestId: execution.manifestId,
              status: execution.status,
              createdAt: execution.createdAt,
              completedAt: execution.completedAt,
            },
          };
        }),
      )
    ).filter((archive) => archive !== null);
    return json(ObservationArchivesResponseSchema.parse({ archives }));
  }

  if (request.method === 'GET' && pathname === '/api/target-connection') {
    const connection = await telemetryRepository.getTargetConnection();
    return connection
      ? json(TargetApplicationConnectionSchema.parse(connection))
      : new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'POST' && pathname === '/api/target-connection') {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return json(
        { error: 'invalid_request', message: 'Request body must be JSON.' },
        { status: 400 },
      );
    }
    const parsed = TargetConnectionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return json(
        {
          error: 'invalid_target',
          message: 'Repository, branch and deployment URLs are required.',
        },
        { status: 400 },
      );
    }
    const allowed = configuredTarget(env);
    const requested = parsed.data;
    if (
      requested.fullName !== allowed.fullName ||
      requested.branch !== allowed.branch ||
      new URL(requested.productionUrl).href !==
        new URL(allowed.productionUrl).href ||
      new URL(requested.studyUrl).href !== new URL(allowed.studyUrl).href
    ) {
      return json(
        {
          error: 'target_not_allowed',
          message:
            'This controlled Darwin environment accepts only its configured ProjectFlow target.',
        },
        { status: 403 },
      );
    }

    try {
      const snapshot = await captureRepositorySnapshot({
        ...requested,
        githubToken: env?.GITHUB_TOKEN,
      });
      const runtimeResponse = await fetch(requested.studyUrl, {
        headers: { Accept: 'text/html' },
      });
      if (!runtimeResponse.ok) {
        throw new Error(
          `Target deployment returned ${runtimeResponse.status}.`,
        );
      }
      const runtimeHtml = await runtimeResponse.text();
      if (!runtimeHtml.includes('<title>ProjectFlow</title>')) {
        throw new Error('Target deployment identity could not be verified.');
      }
      const timestamp = new Date().toISOString();
      const connection = TargetApplicationConnectionSchema.parse({
        connectionId: `target-${snapshot.context.baseSha.slice(0, 12)}`,
        status: 'connected',
        connectedAt: timestamp,
        verifiedAt: timestamp,
        target: snapshot.target,
        repository: snapshot.context,
        checks: [
          {
            id: 'repository',
            label: 'GitHub repository',
            status: 'passed',
            detail: `${snapshot.context.fullName} at ${snapshot.context.baseSha.slice(0, 12)}`,
          },
          {
            id: 'contract',
            label: 'Darwin target contract',
            status: 'passed',
            detail: `${snapshot.context.mutablePaths.length} mutable paths, ${snapshot.context.validationCommands.length} validation commands`,
          },
          {
            id: 'runtime',
            label: 'Cloudflare runtime',
            status: 'passed',
            detail: `${new URL(requested.productionUrl).host} returned ${runtimeResponse.status}`,
          },
          {
            id: 'telemetry',
            label: 'Measured study',
            status: 'passed',
            detail: 'Privacy-safe semantic telemetry endpoint configured',
          },
        ],
      });
      await telemetryRepository.saveTargetConnection(connection);
      return json(connection, { status: 201 });
    } catch (error) {
      return json(
        {
          error: 'target_verification_failed',
          message:
            error instanceof Error
              ? error.message
              : 'Target verification failed.',
        },
        { status: 502 },
      );
    }
  }

  if (
    request.method === 'POST' &&
    pathname === '/api/target-connection/disconnect'
  ) {
    await telemetryRepository.deleteTargetConnection();
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'POST' && pathname === '/api/demo/reset') {
    const targetConnection = await telemetryRepository.getTargetConnection();
    if (env?.GITHUB_TOKEN) {
      try {
        await dispatchResetWorkflow({
          token: env.GITHUB_TOKEN,
          fullName:
            targetConnection?.repository.fullName ||
            configuredTarget(env).fullName,
          branch:
            targetConnection?.repository.branch || configuredTarget(env).branch,
        });
      } catch (error) {
        return json(
          {
            error: 'repository_reset_failed',
            message:
              error instanceof Error
                ? error.message
                : 'ProjectFlow reset dispatch failed.',
          },
          { status: 502 },
        );
      }
    }
    resetSimulationStore();
    await telemetryRepository.reset();
    return json(
      DemoResetResponseSchema.parse({
        status: 'reset',
        repositoryResetDispatched: Boolean(env?.GITHUB_TOKEN),
      }),
    );
  }

  if (request.method === 'POST' && pathname === '/api/telemetry/events') {
    const contentLength = Number(request.headers.get('Content-Length') ?? 0);
    if (contentLength > 256_000) {
      return json(
        {
          error: 'payload_too_large',
          message: 'Telemetry batch is too large.',
        },
        { status: 413 },
      );
    }

    let input: unknown;
    let body: string;
    try {
      body = await request.text();
      if (new TextEncoder().encode(body).byteLength > 256_000) {
        return json(
          {
            error: 'payload_too_large',
            message: 'Telemetry batch is too large.',
          },
          { status: 413 },
        );
      }
      input = JSON.parse(body);
    } catch {
      return json(
        {
          error: 'invalid_request',
          message: 'Request body must be valid JSON.',
        },
        { status: 400 },
      );
    }

    const targetAuthorization = await authorizeTargetRequest(
      request,
      body,
      env,
    );
    if (!targetAuthorization.ok) {
      console.warn(
        '[darwin:security]',
        JSON.stringify({
          event: 'telemetry_authentication_rejected',
          reason: targetAuthorization.error,
          path: pathname,
        }),
      );
      return json(
        {
          error: targetAuthorization.error,
          message: targetAuthorization.message,
        },
        { status: targetAuthorization.status },
      );
    }

    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => key !== 'events') ||
      !Array.isArray((input as { events?: unknown }).events) ||
      (input as { events: unknown[] }).events.length < 1 ||
      (input as { events: unknown[] }).events.length > 50
    ) {
      return json(
        {
          error: 'invalid_request',
          message: 'Telemetry batches require between 1 and 50 events.',
        },
        { status: 400 },
      );
    }

    const candidates = (input as { events: unknown[] }).events;
    const parsedEvents = candidates.flatMap((candidate) => {
      const parsed = StudyTelemetryEventSchema.safeParse(candidate);
      if (!parsed.success) return [];
      return [parsed.data];
    });
    const events = parsedEvents.filter(
      (event) =>
        targetProvenanceAllowed(event, env) &&
        allowedTargetStudies(env).has(event.studyId) &&
        isAllowedTargetVersion(event.appVersion),
    );
    if (events.length !== parsedEvents.length) {
      return json(
        {
          error: 'target_context_forbidden',
          message:
            'Telemetry provenance, study, or application version is not configured.',
        },
        { status: 403 },
      );
    }
    if (env?.INGESTION_RATE_LIMITER) {
      const outcome = await env.INGESTION_RATE_LIMITER.limit({
        key: `${targetAuthorization.identity.targetId}:${targetAuthorization.identity.clientKey}`,
      });
      if (!outcome.success) {
        return json(
          {
            error: 'rate_limited',
            message: 'Telemetry ingestion rate exceeded. Retry shortly.',
          },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
    }
    const stored = await telemetryRepository.insertEvents(
      events,
      new Date().toISOString(),
    );
    return json(
      TelemetryReceiptSchema.parse({
        accepted: stored.accepted,
        rejected: candidates.length - events.length,
        duplicates: stored.duplicates,
      }),
      { status: 202 },
    );
  }

  const studyEventsMatch = pathname.match(/^\/api\/studies\/([^/]+)\/events$/);
  if (request.method === 'GET' && studyEventsMatch) {
    const studyId = decodeURIComponent(studyEventsMatch[1]!);
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(200, Math.max(1, Math.trunc(requestedLimit)))
      : 50;
    const receivedAfter = await currentCycleStart(studyId);
    const events = await telemetryRepository.listEvents(
      studyId,
      limit,
      receivedAfter,
    );
    const summary = await telemetryRepository.summarizeEvents(
      studyId,
      receivedAfter,
    );
    return json(
      StudyEventsResponseSchema.parse({
        studyId,
        events,
        ...summary,
      }),
    );
  }

  const studyEvidenceMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/evidence$/,
  );
  if (request.method === 'POST' && studyEvidenceMatch) {
    const studyId = decodeURIComponent(studyEvidenceMatch[1]!);
    const source = url.searchParams.get('source') ?? 'real_user';
    if (source !== 'real_user' && source !== 'automated') {
      return json(
        { error: 'invalid_request', message: 'Unsupported evidence source.' },
        { status: 400 },
      );
    }
    const events = (
      await telemetryRepository.listEvents(
        studyId,
        10_000,
        await currentCycleStart(studyId),
      )
    ).filter((event) => event.source === source);
    if (!events.length) {
      return json(
        {
          error: 'insufficient_evidence',
          message: 'At least one real telemetry event is required.',
        },
        { status: 409 },
      );
    }
    try {
      const pack = await buildEvidencePack(studyId, events);
      await telemetryRepository.saveEvidence(pack);
      return json(EvidencePackSchema.parse(pack), { status: 201 });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'issues' in error &&
        Array.isArray(error.issues)
      ) {
        return json(
          {
            error: 'evidence_validation_failed',
            message:
              'Stored telemetry could not be summarized into a valid evidence pack.',
          },
          { status: 422 },
        );
      }
      throw error;
    }
  }

  const latestEvidenceMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/evidence\/latest$/,
  );
  if (request.method === 'GET' && latestEvidenceMatch) {
    const studyId = decodeURIComponent(latestEvidenceMatch[1]!);
    const cycleStart = await currentCycleStart(studyId);
    const storedPack = await telemetryRepository.getLatestEvidence(studyId);
    const pack =
      storedPack && (!cycleStart || storedPack.generatedAt > cycleStart)
        ? storedPack
        : null;
    if (!pack) {
      if (url.searchParams.get('optional') === 'true') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      return json(
        {
          error: 'not_found',
          message: 'No evidence pack exists for this study.',
        },
        { status: 404 },
      );
    }
    return json(EvidencePackSchema.parse(pack));
  }

  const analyseEvidenceMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/analyse-evidence$/,
  );
  if (request.method === 'POST' && analyseEvidenceMatch) {
    const studyId = decodeURIComponent(analyseEvidenceMatch[1]!);
    const cycleStart = await currentCycleStart(studyId);
    const storedPack = await telemetryRepository.getLatestEvidence(studyId);
    const pack =
      storedPack && (!cycleStart || storedPack.generatedAt > cycleStart)
        ? storedPack
        : null;
    if (!pack || !pack.frictionSignals.length) {
      return json(
        {
          error: 'insufficient_evidence',
          message: 'A friction-bearing evidence pack is required.',
        },
        { status: 409 },
      );
    }
    const model = env?.OPENAI_MODEL || 'gpt-5.6';
    const targetConnection = await telemetryRepository.getTargetConnection();
    let repositorySnapshot: Awaited<
      ReturnType<typeof captureRepositorySnapshot>
    >;
    try {
      repositorySnapshot = await captureRepositorySnapshot({
        fullName:
          targetConnection?.repository.fullName ||
          configuredTarget(env).fullName,
        branch:
          targetConnection?.repository.branch || configuredTarget(env).branch,
        githubToken: env?.GITHUB_TOKEN,
        productionUrl:
          targetConnection?.repository.productionUrl ||
          configuredTarget(env).productionUrl,
        studyUrl:
          targetConnection?.repository.studyUrl ||
          configuredTarget(env).studyUrl,
      });
    } catch {
      return json(
        {
          error: 'repository_unavailable',
          message:
            'Darwin could not snapshot the current ProjectFlow repository.',
        },
        { status: 502 },
      );
    }
    const cacheKey = await analysisCacheKey(
      pack.evidenceHash,
      model,
      repositorySnapshot.context.sourceHash,
      repositorySnapshot.context.baseSha,
    );
    const cached =
      await telemetryRepository.getEvidenceAnalysisByCacheKey(cacheKey);
    if (cached) return json(EvidenceAnalysisSchema.parse(cached));

    try {
      const configuredTimeout = Number(env?.OPENAI_TIMEOUT_MS ?? 12_000);
      const analysis = await analyseEvidence(pack, {
        requestedMode: env?.DARWIN_AI_MODE,
        apiKey: openAIKey(env),
        model,
        timeoutMs: Number.isFinite(configuredTimeout)
          ? Math.min(90_000, Math.max(1_000, configuredTimeout))
          : 12_000,
        repositorySnapshot,
      });
      await telemetryRepository.saveEvidenceAnalysis(studyId, analysis);
      return json(EvidenceAnalysisSchema.parse(analysis), { status: 201 });
    } catch (error) {
      if (error instanceof EvidenceReasoningError) {
        return json(
          { error: 'analysis_failed', message: error.message },
          { status: 422 },
        );
      }
      throw error;
    }
  }

  const latestEvidenceAnalysisMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/evidence-analysis\/latest$/,
  );
  if (request.method === 'GET' && latestEvidenceAnalysisMatch) {
    const studyId = decodeURIComponent(latestEvidenceAnalysisMatch[1]!);
    const cycleStart = await currentCycleStart(studyId);
    const storedAnalysis =
      await telemetryRepository.getLatestEvidenceAnalysis(studyId);
    const analysis =
      storedAnalysis && (!cycleStart || storedAnalysis.createdAt > cycleStart)
        ? storedAnalysis
        : null;
    if (!analysis) {
      if (url.searchParams.get('optional') === 'true') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      return json(
        { error: 'not_found', message: 'No evidence analysis exists.' },
        { status: 404 },
      );
    }
    return json(EvidenceAnalysisSchema.parse(analysis));
  }

  const codexManifestMatch = pathname.match(
    /^\/api\/evidence-analyses\/([^/]+)\/codex-manifest$/,
  );
  if (codexManifestMatch) {
    const analysisId = decodeURIComponent(codexManifestMatch[1]!);
    const existing = await telemetryRepository.getCodexManifest(analysisId);
    if (request.method === 'GET') {
      if (!existing) {
        return json(
          { error: 'not_found', message: 'Codex manifest was not found.' },
          { status: 404 },
        );
      }
      return json(CodexImplementationManifestSchema.parse(existing));
    }
    if (request.method === 'POST') {
      const analysis =
        await telemetryRepository.getEvidenceAnalysis(analysisId);
      if (!analysis) {
        return json(
          { error: 'not_found', message: 'Evidence analysis was not found.' },
          { status: 404 },
        );
      }
      let input: unknown = {};
      try {
        const text = await request.text();
        input = text ? JSON.parse(text) : {};
      } catch {
        return json(
          { error: 'invalid_request', message: 'Manifest request is invalid.' },
          { status: 400 },
        );
      }
      const parsed = CodexManifestRequestSchema.safeParse(input);
      if (!parsed.success) {
        return json(
          { error: 'invalid_request', issues: parsed.error.issues },
          { status: 400 },
        );
      }
      const candidates = [analysis.selectedMutation, ...analysis.alternatives];
      const requestedMutationIds =
        parsed.data.mutationIds ??
        (parsed.data.mutationId
          ? [parsed.data.mutationId]
          : [analysis.selectedMutation.id]);
      const mutations = candidates.filter((candidate) =>
        requestedMutationIds.includes(candidate.id),
      );
      if (mutations.length !== requestedMutationIds.length) {
        return json(
          {
            error: 'invalid_mutation',
            message: 'The selected mutation is not part of this analysis.',
          },
          { status: 400 },
        );
      }
      const existingMutationIds = existing
        ? (existing.mutationIds ?? [existing.mutationId])
        : [];
      if (
        existing &&
        existingMutationIds.length === mutations.length &&
        mutations.every(
          (mutation, index) => mutation.id === existingMutationIds[index],
        )
      ) {
        return json(CodexImplementationManifestSchema.parse(existing));
      }
      const manifest = await buildCodexManifest(
        analysis,
        'repository-bound',
        undefined,
        mutations,
      );
      await telemetryRepository.saveCodexManifest(manifest);
      return json(CodexImplementationManifestSchema.parse(manifest), {
        status: 201,
      });
    }
  }

  const manifestExecutionMatch = pathname.match(
    /^\/api\/evidence-analyses\/([^/]+)\/codex-manifest\/execution$/,
  );
  if (
    manifestExecutionMatch &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const analysisId = decodeURIComponent(manifestExecutionMatch[1]!);
    const manifest = await telemetryRepository.getCodexManifest(analysisId);
    if (!manifest) {
      return json(
        {
          error: 'not_found',
          message: 'A prepared repository manifest is required.',
        },
        { status: 404 },
      );
    }
    const existing = await telemetryRepository.getRepositoryExecutionByManifest(
      manifest.manifestId,
    );
    if (request.method === 'GET') {
      return existing
        ? json(RepositoryMutationExecutionSchema.parse(existing))
        : new Response(null, { status: 204, headers: corsHeaders });
    }
    if (existing && existing.status !== 'failed') {
      return json(RepositoryMutationExecutionSchema.parse(existing));
    }
    if (!env?.GITHUB_TOKEN || !env.DARWIN_CALLBACK_TOKEN) {
      return json(
        {
          error: 'repository_execution_unavailable',
          message:
            'GitHub dispatch and callback credentials must be configured.',
        },
        { status: 503 },
      );
    }
    let execution;
    try {
      execution = existing
        ? retryRepositoryExecution(existing, manifest)
        : createRepositoryExecution(manifest);
    } catch (error) {
      return json(
        {
          error: 'repository_manifest_required',
          message:
            error instanceof Error
              ? error.message
              : 'The manifest is not repository-bound.',
        },
        { status: 409 },
      );
    }
    if (
      !(await telemetryRepository.saveRepositoryExecution(execution, existing))
    ) {
      return currentExecutionAfterConflict(execution.executionId);
    }
    try {
      const callbackCredential = await issueExecutionCallbackCredential(
        execution.executionId,
      );
      await telemetryRepository.saveExecutionCallbackCredential(
        callbackCredential.credential,
      );
      await dispatchEvolutionWorkflow({
        token: env.GITHUB_TOKEN,
        execution,
        callbackNonce: callbackCredential.nonce,
        manifestHash: manifest.manifestHash,
        callbackUrl: `${url.origin}/api/repository-executions/${execution.executionId}/callback`,
      });
      const queued = updateRepositoryExecution(execution, {
        status: 'queued',
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(queued, execution))
      ) {
        return currentExecutionAfterConflict(execution.executionId);
      }
      execution = queued;
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 201,
      });
    } catch (error) {
      const failed = updateRepositoryExecution(execution, {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'GitHub workflow dispatch failed.',
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(failed, execution))
      ) {
        return currentExecutionAfterConflict(execution.executionId);
      }
      execution = failed;
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 502,
      });
    }
  }

  const repositoryRollbackMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/rollback$/,
  );
  if (request.method === 'POST' && repositoryRollbackMatch) {
    const executionId = decodeURIComponent(repositoryRollbackMatch[1]!);
    let execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    if (!execution) {
      return json(
        { error: 'not_found', message: 'Repository execution not found.' },
        { status: 404 },
      );
    }
    if (execution.rollback && execution.rollback.status !== 'failed') {
      return json(RepositoryMutationExecutionSchema.parse(execution));
    }
    if (execution.status !== 'released') {
      return json(
        {
          error: 'not_rollbackable',
          message: 'Only a released mutation can be prepared for rollback.',
        },
        { status: 409 },
      );
    }
    if (!env?.GITHUB_TOKEN || !env.DARWIN_CALLBACK_TOKEN) {
      return json(
        {
          error: 'repository_rollback_unavailable',
          message:
            'GitHub dispatch and callback credentials must be configured.',
        },
        { status: 503 },
      );
    }
    try {
      const rollback = createRepositoryRollback(execution);
      const manifest = await telemetryRepository.getCodexManifest(
        execution.analysisId,
      );
      if (!manifest) {
        throw new Error('The retained execution manifest could not be loaded.');
      }
      const withRollback = attachRepositoryRollback(execution, rollback);
      if (
        !(await telemetryRepository.saveRepositoryExecution(
          withRollback,
          execution,
        ))
      ) {
        return currentExecutionAfterConflict(execution.executionId);
      }
      execution = withRollback;
      const callbackCredential = await issueExecutionCallbackCredential(
        execution.executionId,
      );
      await telemetryRepository.saveExecutionCallbackCredential(
        callbackCredential.credential,
      );
      await dispatchRollbackWorkflow({
        token: env.GITHUB_TOKEN,
        execution,
        rollback,
        callbackNonce: callbackCredential.nonce,
        manifestHash: manifest.manifestHash,
        callbackUrl: `${url.origin}/api/repository-executions/${execution.executionId}/rollback/callback`,
      });
      const queued = updateRepositoryRollback(execution, {
        status: 'queued',
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(queued, execution))
      ) {
        return currentExecutionAfterConflict(execution.executionId);
      }
      execution = queued;
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 201,
      });
    } catch (error) {
      if (execution.rollback && execution.rollback.status !== 'failed') {
        const failed = updateRepositoryRollback(execution, {
          status: 'failed',
          error:
            error instanceof Error
              ? error.message
              : 'GitHub rollback workflow dispatch failed.',
        });
        if (
          !(await telemetryRepository.saveRepositoryExecution(
            failed,
            execution,
          ))
        ) {
          return currentExecutionAfterConflict(execution.executionId);
        }
        execution = failed;
      }
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 502,
      });
    }
  }

  const repositoryExecutionMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)$/,
  );
  if (request.method === 'GET' && repositoryExecutionMatch) {
    const executionId = decodeURIComponent(repositoryExecutionMatch[1]!);
    const execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    return execution
      ? json(RepositoryMutationExecutionSchema.parse(execution))
      : json(
          { error: 'not_found', message: 'Repository execution not found.' },
          { status: 404 },
        );
  }

  const repositoryManifestMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/manifest$/,
  );
  if (request.method === 'GET' && repositoryManifestMatch) {
    const executionId = decodeURIComponent(repositoryManifestMatch[1]!);
    const execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    const manifest = execution
      ? await telemetryRepository.getCodexManifest(execution.analysisId)
      : null;
    if (!execution || !manifest) {
      return json(
        { error: 'not_found', message: 'Repository manifest not found.' },
        { status: 404 },
      );
    }
    const verification = await verifyExecutionCallback({
      request,
      body: '',
      callbackSecret: env?.DARWIN_CALLBACK_TOKEN,
      credential:
        await telemetryRepository.getExecutionCallbackCredential(executionId),
      executionId,
      repository: execution.repository.fullName,
      manifestHash: manifest.manifestHash,
    });
    if (!verification.ok) {
      return json(
        { error: verification.error, message: verification.message },
        { status: verification.status },
      );
    }
    return json({ execution, manifest });
  }

  const repositoryRollbackCallbackMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/rollback\/callback$/,
  );
  if (request.method === 'POST' && repositoryRollbackCallbackMatch) {
    const executionId = decodeURIComponent(repositoryRollbackCallbackMatch[1]!);
    const execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    if (!execution) {
      return json(
        { error: 'not_found', message: 'Repository execution not found.' },
        { status: 404 },
      );
    }
    const contentLength = Number(request.headers.get('Content-Length') ?? 0);
    if (contentLength > 750_000) {
      return json(
        { error: 'payload_too_large', message: 'Callback body is too large.' },
        { status: 413 },
      );
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 750_000) {
      return json(
        { error: 'payload_too_large', message: 'Callback body is too large.' },
        { status: 413 },
      );
    }
    const manifest = await telemetryRepository.getCodexManifest(
      execution.analysisId,
    );
    if (!manifest) {
      return json(
        { error: 'not_found', message: 'Repository manifest not found.' },
        { status: 404 },
      );
    }
    const verification = await verifyExecutionCallback({
      request,
      body,
      callbackSecret: env?.DARWIN_CALLBACK_TOKEN,
      credential:
        await telemetryRepository.getExecutionCallbackCredential(executionId),
      executionId,
      repository: execution.repository.fullName,
      manifestHash: manifest.manifestHash,
    });
    if (!verification.ok) {
      return json(
        { error: verification.error, message: verification.message },
        { status: verification.status },
      );
    }
    let callback;
    try {
      callback = RepositoryRollbackCallbackSchema.parse(JSON.parse(body));
    } catch {
      return json(
        { error: 'invalid_callback', message: 'Callback payload is invalid.' },
        { status: 400 },
      );
    }
    try {
      const signatureAccepted =
        await telemetryRepository.consumeExecutionCallbackSignature(
          executionId,
          verification.signature,
          new Date().toISOString(),
        );
      if (!signatureAccepted) {
        return json(
          { error: 'callback_replayed', message: 'Callback replay rejected.' },
          { status: 409 },
        );
      }
      const updated = updateRepositoryRollback(execution, callback);
      if (
        !(await telemetryRepository.saveRepositoryExecution(updated, execution))
      ) {
        return currentExecutionAfterConflict(executionId);
      }
      return json(RepositoryMutationExecutionSchema.parse(updated));
    } catch (error) {
      return json(
        {
          error: 'invalid_transition',
          message:
            error instanceof Error
              ? error.message
              : 'Repository rollback transition is invalid.',
        },
        { status: 409 },
      );
    }
  }

  const repositoryCallbackMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/callback$/,
  );
  if (request.method === 'POST' && repositoryCallbackMatch) {
    const executionId = decodeURIComponent(repositoryCallbackMatch[1]!);
    const execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    if (!execution) {
      return json(
        { error: 'not_found', message: 'Repository execution not found.' },
        { status: 404 },
      );
    }
    const contentLength = Number(request.headers.get('Content-Length') ?? 0);
    if (contentLength > 750_000) {
      return json(
        { error: 'payload_too_large', message: 'Callback body is too large.' },
        { status: 413 },
      );
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 750_000) {
      return json(
        { error: 'payload_too_large', message: 'Callback body is too large.' },
        { status: 413 },
      );
    }
    const manifest = await telemetryRepository.getCodexManifest(
      execution.analysisId,
    );
    if (!manifest) {
      return json(
        { error: 'not_found', message: 'Repository manifest not found.' },
        { status: 404 },
      );
    }
    const verification = await verifyExecutionCallback({
      request,
      body,
      callbackSecret: env?.DARWIN_CALLBACK_TOKEN,
      credential:
        await telemetryRepository.getExecutionCallbackCredential(executionId),
      executionId,
      repository: execution.repository.fullName,
      manifestHash: manifest.manifestHash,
    });
    if (!verification.ok) {
      return json(
        { error: verification.error, message: verification.message },
        { status: verification.status },
      );
    }
    let callback;
    try {
      callback = RepositoryExecutionCallbackSchema.parse(JSON.parse(body));
    } catch {
      return json(
        { error: 'invalid_callback', message: 'Callback payload is invalid.' },
        { status: 400 },
      );
    }
    try {
      const signatureAccepted =
        await telemetryRepository.consumeExecutionCallbackSignature(
          executionId,
          verification.signature,
          new Date().toISOString(),
        );
      if (!signatureAccepted) {
        return json(
          { error: 'callback_replayed', message: 'Callback replay rejected.' },
          { status: 409 },
        );
      }
      const updated = updateRepositoryExecution(execution, callback);
      if (
        !(await telemetryRepository.saveRepositoryExecution(updated, execution))
      ) {
        return currentExecutionAfterConflict(executionId);
      }
      return json(RepositoryMutationExecutionSchema.parse(updated));
    } catch (error) {
      return json(
        {
          error: 'invalid_transition',
          message:
            error instanceof Error
              ? error.message
              : 'Repository execution transition is invalid.',
        },
        { status: 409 },
      );
    }
  }

  const repositoryRollbackReleaseMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/rollback\/release$/,
  );
  if (request.method === 'POST' && repositoryRollbackReleaseMatch) {
    const executionId = decodeURIComponent(repositoryRollbackReleaseMatch[1]!);
    let execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    if (!execution) {
      return json(
        { error: 'not_found', message: 'Repository execution not found.' },
        { status: 404 },
      );
    }
    if (execution.rollback?.status === 'released') {
      return json(RepositoryMutationExecutionSchema.parse(execution));
    }
    if (
      execution.rollback?.status !== 'preview_ready' &&
      execution.rollback?.status !== 'releasing'
    ) {
      return json(
        {
          error: 'not_releasable',
          message: 'A validated rollback preview is required for release.',
        },
        { status: 409 },
      );
    }
    if (!env?.GITHUB_TOKEN) {
      return json(
        {
          error: 'repository_rollback_unavailable',
          message: 'GitHub release credentials are not configured.',
        },
        { status: 503 },
      );
    }
    if (execution.rollback.status === 'preview_ready') {
      const releasing = updateRepositoryRollback(execution, {
        status: 'releasing',
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(
          releasing,
          execution,
        ))
      ) {
        return currentReleaseAfterConflict(executionId, true);
      }
      execution = releasing;
    }
    try {
      const releasedSha = await mergeRollbackPullRequest({
        token: env.GITHUB_TOKEN,
        execution,
        rollback: execution.rollback!,
      });
      const released = updateRepositoryRollback(execution, {
        status: 'released',
        headSha: releasedSha,
        previewUrl: execution.repository.studyUrl,
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(
          released,
          execution,
        ))
      ) {
        return currentReleaseAfterConflict(executionId, true);
      }
      execution = released;
      return json(RepositoryMutationExecutionSchema.parse(execution));
    } catch (error) {
      return json(
        {
          error:
            error instanceof GitHubMergeStateUnknownError
              ? 'repository_rollback_merge_state_unknown'
              : 'repository_rollback_release_failed',
          message:
            error instanceof Error
              ? error.message
              : 'GitHub rollback pull request release failed.',
          execution: RepositoryMutationExecutionSchema.parse(execution),
        },
        { status: 502 },
      );
    }
  }

  const repositoryReleaseMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/release$/,
  );
  if (request.method === 'POST' && repositoryReleaseMatch) {
    const executionId = decodeURIComponent(repositoryReleaseMatch[1]!);
    let execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    if (!execution) {
      return json(
        { error: 'not_found', message: 'Repository execution not found.' },
        { status: 404 },
      );
    }
    if (execution.status === 'released') {
      return json(RepositoryMutationExecutionSchema.parse(execution));
    }
    if (
      execution.status !== 'preview_ready' &&
      execution.status !== 'releasing'
    ) {
      return json(
        {
          error: 'not_releasable',
          message: 'A validated pull request preview is required for release.',
        },
        { status: 409 },
      );
    }
    if (!env?.GITHUB_TOKEN) {
      return json(
        {
          error: 'repository_release_unavailable',
          message: 'GitHub release credentials are not configured.',
        },
        { status: 503 },
      );
    }
    if (execution.status === 'preview_ready') {
      const releasing = updateRepositoryExecution(execution, {
        status: 'releasing',
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(
          releasing,
          execution,
        ))
      ) {
        return currentReleaseAfterConflict(executionId);
      }
      execution = releasing;
    }
    try {
      const releasedSha = await mergeEvolutionPullRequest({
        token: env.GITHUB_TOKEN,
        execution,
      });
      const released = updateRepositoryExecution(execution, {
        status: 'released',
        headSha: releasedSha,
        previewUrl: execution.repository.studyUrl,
      });
      if (
        !(await telemetryRepository.saveRepositoryExecution(
          released,
          execution,
        ))
      ) {
        return currentReleaseAfterConflict(executionId);
      }
      execution = released;
      return json(RepositoryMutationExecutionSchema.parse(execution));
    } catch (error) {
      return json(
        {
          error:
            error instanceof GitHubMergeStateUnknownError
              ? 'repository_merge_state_unknown'
              : 'repository_release_failed',
          message:
            error instanceof Error
              ? error.message
              : 'GitHub pull request release failed.',
          execution: RepositoryMutationExecutionSchema.parse(execution),
        },
        { status: 502 },
      );
    }
  }

  const studySessionMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/sessions\/([^/]+)$/,
  );
  if (request.method === 'GET' && studySessionMatch) {
    const studyId = decodeURIComponent(studySessionMatch[1]!);
    const sessionId = decodeURIComponent(studySessionMatch[2]!);
    const events = await telemetryRepository.listSession(
      studyId,
      sessionId,
      await currentCycleStart(studyId),
    );
    return json(
      StudySessionResponseSchema.parse({ studyId, sessionId, events }),
    );
  }

  const participantWorkspaceMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/participants\/([^/]+)\/workspace$/,
  );
  if (participantWorkspaceMatch) {
    const studyId = decodeURIComponent(participantWorkspaceMatch[1]!);
    const participantId = decodeURIComponent(participantWorkspaceMatch[2]!);
    let workspaceBody = '';
    if (request.method === 'PUT') {
      const contentLength = Number(request.headers.get('Content-Length') ?? 0);
      if (contentLength > 256_000) {
        return json(
          {
            error: 'payload_too_large',
            message: 'Workspace body is too large.',
          },
          { status: 413 },
        );
      }
      workspaceBody = await request.text();
      if (new TextEncoder().encode(workspaceBody).byteLength > 256_000) {
        return json(
          {
            error: 'payload_too_large',
            message: 'Workspace body is too large.',
          },
          { status: 413 },
        );
      }
    }
    const targetAuthorization = await authorizeTargetRequest(
      request,
      workspaceBody,
      env,
    );
    if (!targetAuthorization.ok) {
      return json(
        {
          error: targetAuthorization.error,
          message: targetAuthorization.message,
        },
        { status: targetAuthorization.status },
      );
    }
    if (!allowedTargetStudies(env).has(studyId)) {
      return json(
        { error: 'study_forbidden', message: 'The study is not configured.' },
        { status: 403 },
      );
    }
    if (request.method === 'GET') {
      const workspace = await telemetryRepository.getWorkspace(
        studyId,
        participantId,
      );
      return json(
        ParticipantWorkspaceResponseSchema.parse({
          studyId,
          participantId,
          workspace,
        }),
      );
    }
    if (request.method === 'PUT') {
      let input: unknown;
      try {
        input = JSON.parse(workspaceBody);
      } catch {
        return json(
          {
            error: 'invalid_request',
            message: 'Workspace body must be valid JSON.',
          },
          { status: 400 },
        );
      }
      const workspace = ProjectFlowWorkspaceSchema.safeParse(input);
      if (!workspace.success) {
        return json(
          {
            error: 'invalid_request',
            message: 'Workspace failed validation.',
          },
          { status: 400 },
        );
      }
      await telemetryRepository.putWorkspace(
        studyId,
        participantId,
        workspace.data,
      );
      return json(
        ParticipantWorkspaceResponseSchema.parse({
          studyId,
          participantId,
          workspace: workspace.data,
        }),
      );
    }
  }

  if (request.method === 'POST' && pathname === '/api/simulations') {
    if (env?.SIMULATION_RATE_LIMITER) {
      const outcome = await env.SIMULATION_RATE_LIMITER.limit({
        key: operatorIdentity?.actor ?? 'operator',
      });
      if (!outcome.success) {
        return json(
          {
            error: 'rate_limited',
            message: 'Simulation rate exceeded. Retry shortly.',
          },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
    }
    if (simulationInFlight) {
      return json(
        {
          error: 'simulation_busy',
          message: 'A deterministic simulation is already running.',
        },
        { status: 503, headers: { 'Retry-After': '5' } },
      );
    }
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return json(
        {
          error: 'invalid_request',
          message: 'Request body must be valid JSON.',
        },
        { status: 400 },
      );
    }

    const parsed = SimulationRequestSchema.safeParse(input);
    if (!parsed.success) {
      return json(
        {
          error: 'invalid_request',
          message: 'Simulation input failed validation.',
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const configuredSeed = Number(env?.DARWIN_DEMO_SEED ?? 1859);
    if (parsed.data.seed !== configuredSeed) {
      return json(
        {
          error: 'simulation_not_allowed',
          message: 'Only the configured deterministic demo seed is allowed.',
        },
        { status: 403 },
      );
    }

    const configuredEventCount = Number(env?.DARWIN_EVENT_COUNT ?? 10_000);
    const eventCount =
      configuredEventCount === 10_000 ? configuredEventCount : 10_000;
    simulationInFlight = true;
    let result: SimulationResult;
    try {
      result = simulate({ ...parsed.data, eventCount });
    } finally {
      simulationInFlight = false;
    }
    storeSimulation(result);

    return json(
      { run: result.run, summary: result.summary },
      {
        status: 201,
        headers: { Location: `/api/simulations/${result.run.id}` },
      },
    );
  }

  const summaryMatch = pathname.match(/^\/api\/simulations\/([^/]+)\/summary$/);
  if (request.method === 'GET' && summaryMatch) {
    const id = decodeURIComponent(summaryMatch[1]!);
    const result = getStoredSimulation(id);
    if (!result) {
      return json(
        { error: 'not_found', message: 'Simulation run was not found.' },
        { status: 404 },
      );
    }

    return json(result.summary);
  }

  const simulationMatch = pathname.match(/^\/api\/simulations\/([^/]+)$/);
  if (request.method === 'GET' && simulationMatch) {
    const id = decodeURIComponent(simulationMatch[1]!);
    const result = getStoredSimulation(id);
    if (!result) {
      return json(
        { error: 'not_found', message: 'Simulation run was not found.' },
        { status: 404 },
      );
    }

    return json({ run: result.run });
  }

  return json(
    {
      error: 'not_found',
      message: 'The requested Darwin API route does not exist.',
    },
    { status: 404 },
  );
};

export const handleWorkerRequest = async (
  request: Request,
  env: Partial<Env>,
) => {
  try {
    return await handleRequest(request, env);
  } catch (error) {
    console.error(
      '[darwin:api]',
      JSON.stringify({
        event: 'unhandled_request_error',
        method: request.method,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return jsonResponse(
      {
        error: 'internal_error',
        message: 'Darwin API could not complete the request.',
      },
      { status: 500 },
      corsForRequest(request, env).corsHeaders,
    );
  }
};

const worker: ExportedHandler<Env> = {
  fetch: handleWorkerRequest,
};

export default worker;

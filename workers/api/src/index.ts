import {
  CodexImplementationManifestSchema,
  CodexManifestRequestSchema,
  DemoResetResponseSchema,
  DiagnosticsResponseSchema,
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
  type OperationalEvent,
  type OperationalProvider,
  type RepositoryMutationExecution,
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
  createRepositoryRollback,
  createRepositoryExecution,
  updateRepositoryRollback,
  updateRepositoryExecution,
} from './repository/execution';
import {
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
  'Access-Control-Expose-Headers': 'X-Request-ID',
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
  if (pathname === '/api/diagnostics') return 'inspect_evidence';
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

type OperationalActor = OperationalEvent['actor'];

interface ProviderTrace {
  provider: OperationalProvider;
  operation: string;
  durationMs: number;
  outcome: 'success' | 'failure';
  errorCode: string | null;
}

interface RequestTrace {
  requestId: string;
  startedAt: number;
  actor: OperationalActor;
  action: string;
  target: string;
  beforeState: string | null;
  afterState: string | null;
  metrics: ProviderTrace[];
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,80}$/;

const createRequestTrace = (request: Request): RequestTrace => {
  const supplied = request.headers.get('X-Request-ID');
  const pathname = new URL(request.url).pathname;
  return {
    requestId:
      supplied && requestIdPattern.test(supplied)
        ? supplied
        : crypto.randomUUID(),
    startedAt: performance.now(),
    actor: isCallbackRoute(pathname)
      ? 'repository-callback'
      : isTargetRoute(pathname)
        ? 'projectflow'
        : 'anonymous',
    action: `${request.method} ${pathname}`.slice(0, 120),
    target: pathname.slice(0, 240),
    beforeState: null,
    afterState: null,
    metrics: [],
  };
};

const providerErrorCode = (error: unknown) =>
  error instanceof Error ? error.name : 'UnknownError';

const logAuthorizationDecision = (
  trace: RequestTrace,
  boundary: 'operator' | 'target' | 'repository_callback',
  allowed: boolean,
  errorCode: string | null = null,
) => {
  const payload = JSON.stringify({
    event: `${boundary}_request_${allowed ? 'authorized' : 'rejected'}`,
    requestId: trace.requestId,
    actor: trace.actor,
    action: trace.action,
    target: trace.target,
    outcome: allowed ? 'success' : 'failure',
    errorCode,
  });
  if (allowed) console.info('[darwin:audit]', payload);
  else console.warn('[darwin:audit]', payload);
};

const observeProvider = async <Result>(
  trace: RequestTrace,
  provider: OperationalProvider,
  operation: string,
  perform: () => Promise<Result>,
): Promise<Result> => {
  const startedAt = performance.now();
  try {
    const result = await perform();
    trace.metrics.push({
      provider,
      operation,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outcome: 'success',
      errorCode: null,
    });
    return result;
  } catch (error) {
    trace.metrics.push({
      provider,
      operation,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outcome: 'failure',
      errorCode: providerErrorCode(error),
    });
    throw error;
  }
};

const auditedAction = (method: string, pathname: string) => {
  if (method !== 'POST') return null;
  if (pathname === '/api/target-connection') return 'target.connect';
  if (pathname === '/api/target-connection/disconnect') {
    return 'target.disconnect';
  }
  if (pathname === '/api/demo/reset') return 'demo.reset';
  if (/^\/api\/studies\/[^/]+\/evidence$/.test(pathname)) {
    return 'evidence.generate';
  }
  if (/^\/api\/studies\/[^/]+\/analyse-evidence$/.test(pathname)) {
    return 'gpt.analyse';
  }
  if (/^\/api\/evidence-analyses\/[^/]+\/codex-manifest$/.test(pathname)) {
    return 'manifest.create';
  }
  if (
    /^\/api\/evidence-analyses\/[^/]+\/codex-manifest\/execution$/.test(
      pathname,
    )
  ) {
    return 'workflow.dispatch';
  }
  if (/^\/api\/repository-executions\/[^/]+\/rollback$/.test(pathname)) {
    return 'rollback.dispatch';
  }
  if (/\/rollback\/callback$/.test(pathname)) return 'rollback.callback';
  if (/\/callback$/.test(pathname)) return 'repository.callback';
  if (/\/rollback\/release$/.test(pathname)) return 'rollback.release';
  if (/\/release$/.test(pathname)) return 'mutation.release';
  return null;
};

const responseState = async (response: Response) => {
  if (response.status === 204) return 'no_content';
  try {
    const payload = (await response.clone().json()) as Record<string, unknown>;
    if (typeof payload.status === 'string') return payload.status.slice(0, 120);
    if (payload.rollback && typeof payload.rollback === 'object') {
      const status = (payload.rollback as { status?: unknown }).status;
      if (typeof status === 'string') return `rollback:${status}`.slice(0, 120);
    }
    if (typeof payload.error === 'string') {
      return `error:${payload.error}`.slice(0, 120);
    }
  } catch {
    // Responses without JSON are represented only by their HTTP status.
  }
  return response.ok ? 'completed' : `http_${response.status}`;
};

export const resetSimulationStore = () => {
  simulationStore.clear();
};

export const handleRequest = async (
  request: Request,
  env?: Partial<Env>,
  suppliedTrace?: RequestTrace,
): Promise<Response> => {
  const trace = suppliedTrace ?? createRequestTrace(request);
  const url = new URL(request.url);
  const { pathname } = url;
  const requestCors = corsForRequest(request, env);
  const corsHeaders = {
    ...requestCors.corsHeaders,
    'X-Request-ID': trace.requestId,
  };
  const { originAllowed } = requestCors;
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
    trace.actor = authorization.ok ? authorization.identity.actor : 'anonymous';
    logAuthorizationDecision(
      trace,
      'operator',
      authorization.ok,
      authorization.ok ? null : authorization.error,
    );
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
      logAuthorizationDecision(trace, 'operator', false, authorization.error);
      return json(
        { error: authorization.error, message: authorization.message },
        { status: authorization.status },
      );
    }
    operatorIdentity = authorization.identity;
    trace.actor = operatorIdentity.actor;
    logAuthorizationDecision(trace, 'operator', true);
  }

  const telemetryRepository = getTelemetryRepository(env?.DB, (metric) => {
    trace.metrics.push({ provider: 'd1', ...metric });
  });
  const currentCycleStart = async (studyId: string) => {
    const cycle = await telemetryRepository.getEvolutionCycle();
    return cycle.studyId === studyId ? cycle.startedAt : null;
  };

  if (request.method === 'GET' && pathname === '/api/health') {
    const response: HealthResponse = {
      status: 'ok',
      service: 'darwin-api',
      version: '0.24.0',
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

  if (request.method === 'GET' && pathname === '/api/diagnostics') {
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.round(requestedLimit)))
      : 50;
    const [events, metrics] = await Promise.all([
      telemetryRepository.listOperationalAuditEvents(limit),
      telemetryRepository.summarizeOperationalMetrics(100),
    ]);
    return json(
      DiagnosticsResponseSchema.parse({
        requestId: trace.requestId,
        generatedAt: new Date().toISOString(),
        retentionDays: 30,
        events,
        metrics,
      }),
    );
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
    trace.beforeState = 'disconnected';
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
      const snapshot = await observeProvider(
        trace,
        'github',
        'capture_repository_snapshot',
        () =>
          captureRepositorySnapshot({
            ...requested,
            githubToken: env?.GITHUB_TOKEN,
          }),
      );
      const runtimeResponse = await observeProvider(
        trace,
        'target',
        'verify_study_runtime',
        async () => {
          const response = await fetch(requested.studyUrl, {
            headers: { Accept: 'text/html' },
          });
          if (!response.ok) {
            const error = new Error(
              `Target deployment returned ${response.status}.`,
            );
            error.name = `TargetHttp${response.status}`;
            throw error;
          }
          const runtimeHtml = await response.text();
          if (!runtimeHtml.includes('<title>ProjectFlow</title>')) {
            const error = new Error(
              'Target deployment identity could not be verified.',
            );
            error.name = 'TargetIdentityError';
            throw error;
          }
          return response;
        },
      );
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
    trace.beforeState = 'connected';
    await telemetryRepository.deleteTargetConnection();
    trace.afterState = 'disconnected';
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'POST' && pathname === '/api/demo/reset') {
    trace.beforeState = 'active_cycle';
    const targetConnection = await telemetryRepository.getTargetConnection();
    if (env?.GITHUB_TOKEN) {
      try {
        await observeProvider(trace, 'github', 'dispatch_reset_workflow', () =>
          dispatchResetWorkflow({
            token: env.GITHUB_TOKEN!,
            fullName:
              targetConnection?.repository.fullName ||
              configuredTarget(env).fullName,
            branch:
              targetConnection?.repository.branch ||
              configuredTarget(env).branch,
          }),
        );
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
      logAuthorizationDecision(
        trace,
        'target',
        false,
        targetAuthorization.error,
      );
      return json(
        {
          error: targetAuthorization.error,
          message: targetAuthorization.message,
        },
        { status: targetAuthorization.status },
      );
    }
    logAuthorizationDecision(trace, 'target', true);

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
    trace.beforeState = 'telemetry_ready';
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
      trace.afterState = 'evidence_ready';
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
    trace.beforeState = 'evidence_ready';
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
      repositorySnapshot = await observeProvider(
        trace,
        'github',
        'capture_reasoning_snapshot',
        () =>
          captureRepositorySnapshot({
            fullName:
              targetConnection?.repository.fullName ||
              configuredTarget(env).fullName,
            branch:
              targetConnection?.repository.branch ||
              configuredTarget(env).branch,
            githubToken: env?.GITHUB_TOKEN,
            productionUrl:
              targetConnection?.repository.productionUrl ||
              configuredTarget(env).productionUrl,
            studyUrl:
              targetConnection?.repository.studyUrl ||
              configuredTarget(env).studyUrl,
          }),
      );
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
    console.info(
      '[darwin:reasoning]',
      JSON.stringify({
        event: cached ? 'gpt_cache_hit' : 'gpt_cache_miss',
        requestId: trace.requestId,
        actor: trace.actor,
        action: 'gpt.analyse',
        target: studyId,
        outcome: 'success',
      }),
    );
    if (cached) {
      trace.afterState = 'analysis_cached';
      return json(EvidenceAnalysisSchema.parse(cached));
    }

    try {
      const configuredTimeout = Number(env?.OPENAI_TIMEOUT_MS ?? 12_000);
      const analysis = await observeProvider(
        trace,
        'openai',
        'analyse_evidence',
        () =>
          analyseEvidence(pack, {
            requestedMode: env?.DARWIN_AI_MODE,
            apiKey: openAIKey(env),
            model,
            timeoutMs: Number.isFinite(configuredTimeout)
              ? Math.min(90_000, Math.max(1_000, configuredTimeout))
              : 12_000,
            repositorySnapshot,
          }),
      );
      console.info(
        '[darwin:reasoning]',
        JSON.stringify({
          event: 'gpt_call_completed',
          requestId: trace.requestId,
          actor: trace.actor,
          action: 'gpt.analyse',
          target: studyId,
          outcome: 'success',
        }),
      );
      await telemetryRepository.saveEvidenceAnalysis(studyId, analysis);
      trace.afterState = 'analysis_ready';
      return json(EvidenceAnalysisSchema.parse(analysis), { status: 201 });
    } catch (error) {
      console.warn(
        '[darwin:reasoning]',
        JSON.stringify({
          event: 'gpt_call_completed',
          requestId: trace.requestId,
          actor: trace.actor,
          action: 'gpt.analyse',
          target: studyId,
          outcome: 'failure',
          errorCode: providerErrorCode(error),
        }),
      );
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
      trace.beforeState = 'analysis_ready';
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
      trace.afterState = 'manifest_created';
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
    trace.beforeState = existing?.status ?? 'not_started';
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
    let execution: RepositoryMutationExecution;
    try {
      execution = createRepositoryExecution(manifest);
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
    await telemetryRepository.saveRepositoryExecution(execution);
    try {
      const callbackCredential = await issueExecutionCallbackCredential(
        execution.executionId,
      );
      await telemetryRepository.saveExecutionCallbackCredential(
        callbackCredential.credential,
      );
      const dispatchExecution = execution;
      await observeProvider(
        trace,
        'github',
        'dispatch_evolution_workflow',
        () =>
          dispatchEvolutionWorkflow({
            token: env.GITHUB_TOKEN!,
            execution: dispatchExecution,
            callbackNonce: callbackCredential.nonce,
            manifestHash: manifest.manifestHash,
            callbackUrl: `${url.origin}/api/repository-executions/${dispatchExecution.executionId}/callback`,
          }),
      );
      execution = updateRepositoryExecution(execution, { status: 'queued' });
      await telemetryRepository.saveRepositoryExecution(execution);
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 201,
      });
    } catch (error) {
      execution = updateRepositoryExecution(execution, {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'GitHub workflow dispatch failed.',
      });
      await telemetryRepository.saveRepositoryExecution(execution);
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
    trace.beforeState = execution.rollback?.status ?? execution.status;
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
      execution = RepositoryMutationExecutionSchema.parse({
        ...execution,
        rollback,
      });
      await telemetryRepository.saveRepositoryExecution(execution);
      const callbackCredential = await issueExecutionCallbackCredential(
        execution.executionId,
      );
      await telemetryRepository.saveExecutionCallbackCredential(
        callbackCredential.credential,
      );
      const dispatchExecution = execution;
      await observeProvider(trace, 'github', 'dispatch_rollback_workflow', () =>
        dispatchRollbackWorkflow({
          token: env.GITHUB_TOKEN!,
          execution: dispatchExecution,
          rollback,
          callbackNonce: callbackCredential.nonce,
          manifestHash: manifest.manifestHash,
          callbackUrl: `${url.origin}/api/repository-executions/${dispatchExecution.executionId}/rollback/callback`,
        }),
      );
      execution = updateRepositoryRollback(execution, { status: 'queued' });
      await telemetryRepository.saveRepositoryExecution(execution);
      trace.afterState = 'rollback:queued';
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 201,
      });
    } catch (error) {
      if (execution.rollback) {
        execution = updateRepositoryRollback(execution, {
          status: 'failed',
          error:
            error instanceof Error
              ? error.message
              : 'GitHub rollback workflow dispatch failed.',
        });
        await telemetryRepository.saveRepositoryExecution(execution);
        trace.afterState = 'rollback:failed';
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
      logAuthorizationDecision(
        trace,
        'repository_callback',
        false,
        verification.error,
      );
      return json(
        { error: verification.error, message: verification.message },
        { status: verification.status },
      );
    }
    logAuthorizationDecision(trace, 'repository_callback', true);
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
    trace.beforeState = execution.rollback?.status ?? execution.status;
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
      logAuthorizationDecision(
        trace,
        'repository_callback',
        false,
        verification.error,
      );
      return json(
        { error: verification.error, message: verification.message },
        { status: verification.status },
      );
    }
    logAuthorizationDecision(trace, 'repository_callback', true);
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
      await telemetryRepository.saveRepositoryExecution(updated);
      trace.afterState = `rollback:${updated.rollback?.status ?? 'unknown'}`;
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
    trace.beforeState = execution.status;
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
      logAuthorizationDecision(
        trace,
        'repository_callback',
        false,
        verification.error,
      );
      return json(
        { error: verification.error, message: verification.message },
        { status: verification.status },
      );
    }
    logAuthorizationDecision(trace, 'repository_callback', true);
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
      await telemetryRepository.saveRepositoryExecution(updated);
      trace.afterState = updated.status;
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
    trace.beforeState = execution.rollback?.status ?? execution.status;
    if (execution.rollback?.status === 'released') {
      trace.afterState = 'rollback:released';
      return json(RepositoryMutationExecutionSchema.parse(execution));
    }
    if (execution.rollback?.status !== 'preview_ready') {
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
    execution = updateRepositoryRollback(execution, { status: 'releasing' });
    await telemetryRepository.saveRepositoryExecution(execution);
    try {
      const releasingExecution = execution;
      const releasedSha = await observeProvider(
        trace,
        'github',
        'merge_rollback_pull_request',
        () =>
          mergeRollbackPullRequest({
            token: env.GITHUB_TOKEN!,
            execution: releasingExecution,
            rollback: releasingExecution.rollback!,
          }),
      );
      execution = updateRepositoryRollback(execution, {
        status: 'released',
        headSha: releasedSha,
        previewUrl: execution.repository.studyUrl,
      });
      await telemetryRepository.saveRepositoryExecution(execution);
      trace.afterState = 'rollback:released';
      return json(RepositoryMutationExecutionSchema.parse(execution));
    } catch (error) {
      execution = updateRepositoryRollback(execution, {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'GitHub rollback pull request release failed.',
      });
      await telemetryRepository.saveRepositoryExecution(execution);
      trace.afterState = 'rollback:failed';
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 502,
      });
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
    trace.beforeState = execution.status;
    if (execution.status === 'released') {
      return json(RepositoryMutationExecutionSchema.parse(execution));
    }
    if (execution.status !== 'preview_ready') {
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
    execution = updateRepositoryExecution(execution, { status: 'releasing' });
    await telemetryRepository.saveRepositoryExecution(execution);
    try {
      const releasingExecution = execution;
      const releasedSha = await observeProvider(
        trace,
        'github',
        'merge_evolution_pull_request',
        () =>
          mergeEvolutionPullRequest({
            token: env.GITHUB_TOKEN!,
            execution: releasingExecution,
          }),
      );
      execution = updateRepositoryExecution(execution, {
        status: 'released',
        headSha: releasedSha,
        previewUrl: execution.repository.studyUrl,
      });
      await telemetryRepository.saveRepositoryExecution(execution);
      await telemetryRepository.advanceEvolutionCycle();
      return json(RepositoryMutationExecutionSchema.parse(execution));
    } catch (error) {
      execution = updateRepositoryExecution(execution, {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'GitHub pull request release failed.',
      });
      await telemetryRepository.saveRepositoryExecution(execution);
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 502,
      });
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
      logAuthorizationDecision(
        trace,
        'target',
        false,
        targetAuthorization.error,
      );
      return json(
        {
          error: targetAuthorization.error,
          message: targetAuthorization.message,
        },
        { status: targetAuthorization.status },
      );
    }
    logAuthorizationDecision(trace, 'target', true);
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

const recordOperationalTrace = async (
  request: Request,
  env: Partial<Env>,
  trace: RequestTrace,
  response: Response,
) => {
  trace.afterState = trace.afterState ?? (await responseState(response));
  const outcome = response.ok ? 'success' : 'failure';
  const errorCode = trace.afterState.startsWith('error:')
    ? trace.afterState.slice('error:'.length)
    : response.ok
      ? null
      : `http_${response.status}`;
  const durationMs = Math.max(
    0,
    Math.round(performance.now() - trace.startedAt),
  );
  const action = auditedAction(request.method, new URL(request.url).pathname);

  console.info(
    '[darwin:request]',
    JSON.stringify({
      event: 'request_completed',
      requestId: trace.requestId,
      actor: trace.actor,
      action: action ?? trace.action,
      target: trace.target,
      outcome,
      status: response.status,
      durationMs,
      beforeState: trace.beforeState,
      afterState: trace.afterState,
      errorCode,
    }),
  );
  for (const metric of trace.metrics) {
    console.info(
      '[darwin:metric]',
      JSON.stringify({
        event: 'provider_operation',
        requestId: trace.requestId,
        actor: trace.actor,
        action: `${metric.provider}.${metric.operation}`,
        target: trace.target,
        outcome: metric.outcome,
        provider: metric.provider,
        operation: metric.operation,
        durationMs: metric.durationMs,
        errorCode: metric.errorCode,
      }),
    );
  }

  if (!action && trace.metrics.length === 0) return;
  try {
    const repository = getTelemetryRepository(env.DB);
    const occurredAt = new Date().toISOString();
    const events: OperationalEvent[] = trace.metrics.map((metric) => ({
      eventId: crypto.randomUUID(),
      kind: 'metric',
      requestId: trace.requestId,
      occurredAt,
      actor: trace.actor,
      action: `${metric.provider}.${metric.operation}`,
      target: trace.target,
      outcome: metric.outcome,
      beforeState: null,
      afterState: null,
      provider: metric.provider,
      operation: metric.operation,
      durationMs: metric.durationMs,
      errorCode: metric.errorCode,
    }));
    if (action) {
      events.unshift({
        eventId: crypto.randomUUID(),
        kind: 'audit',
        requestId: trace.requestId,
        occurredAt,
        actor: trace.actor,
        action,
        target: trace.target,
        outcome,
        beforeState: trace.beforeState ?? 'requested',
        afterState: trace.afterState,
        provider: null,
        operation: null,
        durationMs,
        errorCode,
      });
    }
    await repository.saveOperationalEvents(events);
  } catch (error) {
    console.error(
      '[darwin:audit]',
      JSON.stringify({
        event: 'operational_trace_persistence_failed',
        requestId: trace.requestId,
        actor: 'system',
        action: 'audit.persist',
        target: 'operational_events',
        outcome: 'failure',
        errorCode: providerErrorCode(error),
      }),
    );
  }
};

export const handleWorkerRequest = async (
  request: Request,
  env: Partial<Env>,
) => {
  const trace = createRequestTrace(request);
  let response: Response;
  try {
    response = await handleRequest(request, env, trace);
  } catch (error) {
    console.error(
      '[darwin:api]',
      JSON.stringify({
        event: 'unhandled_request_error',
        requestId: trace.requestId,
        actor: trace.actor,
        action: trace.action,
        target: trace.target,
        outcome: 'failure',
        method: request.method,
        path: new URL(request.url).pathname,
        errorCode: providerErrorCode(error),
      }),
    );
    response = jsonResponse(
      {
        error: 'internal_error',
        message: 'Darwin API could not complete the request.',
      },
      {
        status: 500,
        headers: { 'X-Request-ID': trace.requestId },
      },
      corsForRequest(request, env).corsHeaders,
    );
  }
  await recordOperationalTrace(request, env, trace, response);
  return response;
};

const worker: ExportedHandler<Env> = {
  fetch: handleWorkerRequest,
};

export default worker;

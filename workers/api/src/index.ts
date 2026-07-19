import {
  CodexImplementationManifestSchema,
  CodexManifestRequestSchema,
  DemoResetRequestSchema,
  DemoResetResponseSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  GenomeHistoryResponseSchema,
  ObservationArchiveDetailResponseSchema,
  ObservationArchivesResponseSchema,
  OperationalAuditEventSchema,
  ParticipantWorkspaceResponseSchema,
  ProjectFlowWorkspaceSchema,
  RepositoryExecutionCallbackSchema,
  RepositoryExecutionSummarySchema,
  RepositoryMutationExecutionSchema,
  RepositoryRollbackCallbackSchema,
  SimulationRequestSchema,
  StudyEventsResponseSchema,
  StudySessionIssueRequestSchema,
  StudySessionResponseSchema,
  StudyTelemetryEventSchema,
  TargetApplicationConnectionSchema,
  TargetConnectionRequestSchema,
  TelemetryReceiptSchema,
  type SimulationResult,
} from '@darwin/shared';

import { simulate } from './simulation';
import { getTelemetryRepository } from './persistence/telemetry-repository';
import { EvidenceBoundaryError, buildEvidencePack } from './evidence';
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
import { forceFailStrandedExecution } from './repository/recovery';
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
import { handleLabRequest } from './lab/handler';
import { handleOperationalRoutes } from './routes/operations';
import { getLabRepository } from './lab/lab-repository';
import {
  anonymousStudyParticipantId,
  issueStudySession,
  verifyStudySessionToken,
} from './security/study-session';
import { PayloadTooLargeError, readBoundedBody } from './security/bounded-body';
import { operationalLog, requestIdFor, timeOperation } from './observability';

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
  OPENAI_LAB_AGENT_MODEL?: string;
  OPENAI_TIMEOUT_MS: string;
  PROJECTFLOW_REPOSITORY: string;
  PROJECTFLOW_BRANCH: string;
  PROJECTFLOW_PRODUCTION_URL: string;
  PROJECTFLOW_STUDY_URL: string;
  PROJECTFLOW_STUDY_ID?: string;
  PROJECTFLOW_AUTOMATED_STUDY_ID?: string;
  PROJECTFLOW_LAB_STUDY_ID?: string;
  DARWIN_LAB_ALLOWED_ORIGINS?: string;
  GITHUB_TOKEN?: string;
  DARWIN_CALLBACK_TOKEN?: string;
  DARWIN_OPERATOR_TOKEN?: string;
  DARWIN_VIEWER_TOKEN?: string;
  PROJECTFLOW_INGESTION_SECRET?: string;
  DARWIN_STUDY_EVENT_QUOTA?: string;
  DARWIN_TARGET_EVENT_QUOTA?: string;
  DARWIN_RELEASE_VERSION?: string;
  DARWIN_BUILD_SHA?: string;
}

const defaultCorsHeaders = {
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Darwin-Study-Session, X-Darwin-Request-ID',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Darwin-Request-ID',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; sandbox",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const openAIKey = (env?: Partial<Env>) =>
  env?.OPENAI_API_KEY || env?.OPENAI_API;

const studyEventQuota = (env?: Partial<Env>) => {
  const parsed = Number(env?.DARWIN_STUDY_EVENT_QUOTA ?? 100_000);
  return Number.isSafeInteger(parsed)
    ? Math.min(1_000_000, Math.max(1_000, parsed))
    : 100_000;
};

const targetEventQuota = (env?: Partial<Env>) => {
  const parsed = Number(env?.DARWIN_TARGET_EVENT_QUOTA ?? 1_000_000);
  return Number.isSafeInteger(parsed)
    ? Math.min(5_000_000, Math.max(10_000, parsed))
    : 1_000_000;
};

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
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; sandbox",
  );
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  Object.entries(corsHeaders).forEach(([name, value]) =>
    headers.set(name, value),
  );

  return new Response(JSON.stringify(body), { ...init, headers });
};

const requiredOperatorCapability = (
  method: string,
  pathname: string,
): OperatorCapability => {
  if (pathname.startsWith('/api/lab/')) {
    if (method === 'GET') return 'inspect_evidence';
    if (pathname.endsWith('/agent-decision') || pathname.endsWith('/analyse')) {
      return 'reason';
    }
    if (pathname.endsWith('/mutations/select')) return 'execute';
    return 'simulate';
  }
  if (pathname === '/api/demo/reset') return 'reset';
  if (pathname.startsWith('/api/retention/')) return 'delete_data';
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
    pathname.startsWith('/api/diagnostics') ||
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

const isCallbackRoute = (request: Request) => {
  const url = new URL(request.url);
  if (
    /^\/api\/repository-executions\/[^/]+\/manifest$/.test(url.pathname) &&
    url.searchParams.get('audience') === 'operator'
  ) {
    return false;
  }
  return /^\/api\/repository-executions\/[^/]+\/(?:manifest|callback|rollback\/callback)$/.test(
    url.pathname,
  );
};

const isTargetRoute = (pathname: string) =>
  pathname === '/api/study-sessions' ||
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
    env?.PROJECTFLOW_LAB_STUDY_ID || 'projectflow-darwin-lab',
  ]);

const targetStudyAllowed = (studyId: string, env?: Partial<Env>) => {
  return allowedTargetStudies(env).has(studyId);
};

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

const parsePageRequest = (url: URL) => {
  const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
  if (
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 50
  ) {
    throw new Error('invalid_page_limit');
  }
  const cursorValue = url.searchParams.get('cursor');
  if (!cursorValue) return { limit: requestedLimit, cursor: null };
  if (cursorValue.length > 300) throw new Error('invalid_page_cursor');
  const separator = cursorValue.lastIndexOf('|');
  const updatedAt = cursorValue.slice(0, separator);
  const executionId = cursorValue.slice(separator + 1);
  if (
    separator < 1 ||
    Number.isNaN(Date.parse(updatedAt)) ||
    !/^[a-zA-Z0-9._:-]{1,128}$/.test(executionId)
  ) {
    throw new Error('invalid_page_cursor');
  }
  return { limit: requestedLimit, cursor: { updatedAt, executionId } };
};

const encodePageCursor = (
  cursor: {
    updatedAt: string;
    executionId: string;
  } | null,
) => (cursor ? `${cursor.updatedAt}|${cursor.executionId}` : null);

export const resetSimulationStore = () => {
  simulationStore.clear();
};

export const handleRequest = async (
  request: Request,
  env?: Partial<Env>,
): Promise<Response> => {
  const url = new URL(request.url);
  const { pathname } = url;
  const requestId = requestIdFor(request);
  const { corsHeaders, originAllowed } = corsForRequest(request, env);
  const json = (body: unknown, init: ResponseInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('X-Darwin-Request-ID', requestId);
    return jsonResponse(body, { ...init, headers }, corsHeaders);
  };

  try {
    decodeURI(pathname);
  } catch {
    return json(
      { error: 'invalid_url', message: 'Request URL encoding is invalid.' },
      { status: 400 },
    );
  }

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
    !isCallbackRoute(request)
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
  const currentCycleStart = async (studyId: string) => {
    const cycle = await telemetryRepository.getEvolutionCycle();
    return cycle.studyId === studyId ? cycle.startedAt : null;
  };

  const operationalResponse = await handleOperationalRoutes({
    request,
    url,
    repository: telemetryRepository,
    json,
    requestId,
    operatorActor: operatorIdentity?.actor ?? null,
    eventQuotaPerStudy: studyEventQuota(env),
    eventQuotaPerTarget: targetEventQuota(env),
    build: {
      release: env?.DARWIN_RELEASE_VERSION || '0.25.0',
      commit: env?.DARWIN_BUILD_SHA || 'development',
    },
    analysis: {
      model: env?.OPENAI_MODEL || 'gpt-5.6',
      liveModelAvailable:
        env?.DARWIN_AI_MODE === 'live' && Boolean(openAIKey(env)),
    },
  });
  if (operationalResponse) return operationalResponse;

  const labResponse = await handleLabRequest(
    request,
    env,
    json,
    operatorIdentity,
  );
  if (labResponse) return labResponse;

  if (request.method === 'GET' && pathname === '/api/genome') {
    let pageRequest;
    try {
      pageRequest = parsePageRequest(url);
    } catch {
      return json(
        {
          error: 'invalid_request',
          message: 'Genome page cursor or limit is invalid.',
        },
        { status: 400 },
      );
    }
    const page = await telemetryRepository.listRepositoryExecutionsPage(
      pageRequest.limit,
      pageRequest.cursor,
    );
    return json(
      GenomeHistoryResponseSchema.parse({
        evolutionCycle: await telemetryRepository.getEvolutionCycle(),
        executions: page.items.map((execution) =>
          RepositoryExecutionSummarySchema.parse(execution),
        ),
        nextCursor: page.hasMore ? encodePageCursor(page.cursor) : null,
      }),
    );
  }

  const observationArchiveMatch = pathname.match(
    /^\/api\/observations\/archives\/([^/]+)$/,
  );
  if (request.method === 'GET' && observationArchiveMatch) {
    const archive = await telemetryRepository.getObservationArchive(
      decodeURIComponent(observationArchiveMatch[1]!),
    );
    return archive
      ? json(ObservationArchiveDetailResponseSchema.parse(archive))
      : json(
          { error: 'not_found', message: 'Observation archive was not found.' },
          { status: 404 },
        );
  }

  if (request.method === 'GET' && pathname === '/api/observations/archives') {
    let pageRequest;
    try {
      pageRequest = parsePageRequest(url);
    } catch {
      return json(
        {
          error: 'invalid_request',
          message: 'Archive page cursor or limit is invalid.',
        },
        { status: 400 },
      );
    }
    const page = await telemetryRepository.listObservationArchivesPage(
      pageRequest.limit,
      pageRequest.cursor,
    );
    const archives = page.items.map(
      ({ archiveId, evidence, analysis, execution }) => {
        const terminalAttempts = evidence.taskAttempts.filter((attempt) =>
          ['success', 'failed', 'abandoned'].includes(attempt.outcome),
        );
        const interactionCounts = terminalAttempts
          .map((attempt) => attempt.interactionCount)
          .sort((left, right) => left - right);
        const midpoint = Math.floor(interactionCounts.length / 2);
        return {
          archiveId,
          evidenceId: evidence.evidenceId,
          evidenceHash: evidence.evidenceHash,
          provenance: evidence.provenance,
          sourceEventCount: evidence.study.sourceEventCount,
          sessions: evidence.study.sessions,
          participants: evidence.study.participants,
          attempts: evidence.study.attempts,
          completionRate: terminalAttempts.length
            ? terminalAttempts.filter(
                (attempt) => attempt.outcome === 'success',
              ).length / terminalAttempts.length
            : null,
          medianInteractionCount: interactionCounts.length
            ? interactionCounts.length % 2
              ? interactionCounts[midpoint]!
              : (interactionCounts[midpoint - 1]! +
                  interactionCounts[midpoint]!) /
                2
            : null,
          qualityStrength: evidence.quality.strength,
          qualityScore: evidence.quality.score,
          frictionSignalCount: evidence.frictionSignals.length,
          mutationTitle: analysis.selectedMutation.title,
          model: analysis.model,
          execution,
        };
      },
    );
    return json(
      ObservationArchivesResponseSchema.parse({
        archives,
        nextCursor: page.hasMore ? encodePageCursor(page.cursor) : null,
      }),
    );
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
      input = JSON.parse(await readBoundedBody(request, 64_000));
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'invalid_request',
          message: 'Request body must be bounded valid JSON.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
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
      const runtimeResponse = await timeOperation(
        'target',
        'verify_deployment',
        () =>
          fetch(requested.studyUrl, {
            headers: { Accept: 'text/html' },
          }),
        requestId,
      );
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
    let resetInput: unknown;
    try {
      resetInput = JSON.parse(await readBoundedBody(request, 1_024));
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'confirmation_required',
          message:
            'Reset requires the exact confirmation and an acknowledgement that Darwin data has been exported.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
      );
    }
    const parsedReset = DemoResetRequestSchema.safeParse(resetInput);
    if (!parsedReset.success) {
      return json(
        {
          error: 'confirmation_required',
          message:
            'Reset requires confirmation “RESET DARWIN DEMO” and exportAcknowledged=true.',
        },
        { status: 400 },
      );
    }
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
    await getLabRepository(env?.DB).reset();
    return json(
      DemoResetResponseSchema.parse({
        status: 'reset',
        repositoryResetDispatched: Boolean(env?.GITHUB_TOKEN),
        recovery: {
          projectFlow: 'baseline-workflow-dispatched',
          darwinData: 'not-recoverable-after-reset',
        },
      }),
    );
  }

  if (request.method === 'POST' && pathname === '/api/study-sessions') {
    let body: string;
    try {
      body = await readBoundedBody(request, 8_192);
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'invalid_request',
          message:
            error instanceof PayloadTooLargeError
              ? 'Study session request is too large.'
              : 'Study session request encoding is invalid.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
      );
    }
    const targetAuthorization = await authorizeTargetRequest(
      request,
      body,
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
    const parsed = StudySessionIssueRequestSchema.safeParse(
      (() => {
        try {
          return JSON.parse(body);
        } catch {
          return null;
        }
      })(),
    );
    if (!parsed.success || !isAllowedTargetVersion(parsed.data.appVersion)) {
      return json(
        {
          error: 'invalid_request',
          message: 'Study session request is invalid.',
        },
        { status: 400 },
      );
    }
    const input = parsed.data;
    let participantId: string;
    let sessionId: string | undefined;
    if (input.evidenceClass === 'darwin_lab') {
      const experiment = input.labExperimentId
        ? await getLabRepository(env?.DB).getExperiment(input.labExperimentId)
        : null;
      const run = experiment?.runs.find(
        (candidate) => candidate.runId === input.runId,
      );
      if (
        !experiment ||
        !run ||
        experiment.studyId !== input.studyId ||
        experiment.targetAppVersion !== input.appVersion
      ) {
        return json(
          {
            error: 'study_session_context_forbidden',
            message: 'Darwin Lab run identity does not match the experiment.',
          },
          { status: 403 },
        );
      }
      participantId = run.participantId;
      sessionId = run.sessionId;
    } else {
      const expectedStudy =
        input.evidenceClass === 'human_study'
          ? env?.PROJECTFLOW_STUDY_ID || 'projectflow-baseline-study'
          : env?.PROJECTFLOW_AUTOMATED_STUDY_ID ||
            'projectflow-baseline-automated-study';
      if (input.studyId !== expectedStudy) {
        return json(
          {
            error: 'study_session_context_forbidden',
            message: 'Study and evidence class do not match.',
          },
          { status: 403 },
        );
      }
      participantId = await anonymousStudyParticipantId(
        targetAuthorization.identity.clientKey,
        input.studyId,
        input.appVersion,
        input.evidenceClass,
      );
    }
    const session = await issueStudySession(
      env?.PROJECTFLOW_INGESTION_SECRET || 'local-development-study-session',
      {
        studyId: input.studyId,
        participantId,
        ...(sessionId ? { sessionId } : {}),
        appVersion: input.appVersion,
        evidenceClass: input.evidenceClass,
        deploymentOrigin: targetAuthorization.identity.sourceOrigin,
        labExperimentId: input.labExperimentId,
        runId: input.runId,
      },
    );
    return json(session, { status: 201 });
  }

  if (request.method === 'POST' && pathname === '/api/telemetry/events') {
    let input: unknown;
    let body: string;
    try {
      body = await readBoundedBody(request, 256_000);
      input = JSON.parse(body);
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'invalid_request',
          message:
            error instanceof PayloadTooLargeError
              ? 'Telemetry batch is too large.'
              : 'Request body must be valid JSON.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
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
    const sessionToken = request.headers.get('X-Darwin-Study-Session');
    const sessionVerification =
      sessionToken || env?.PROJECTFLOW_INGESTION_SECRET
        ? await verifyStudySessionToken(
            sessionToken,
            env?.PROJECTFLOW_INGESTION_SECRET ||
              'local-development-study-session',
          )
        : null;
    if (sessionVerification && !sessionVerification.ok) {
      return json(
        {
          error: sessionVerification.error,
          message: sessionVerification.message,
        },
        { status: 401 },
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
    if (
      sessionVerification?.ok &&
      parsedEvents.some((event) => {
        const claims = sessionVerification.claims;
        const provenanceClass = event.provenance?.evidenceClass;
        return (
          event.studyId !== claims.studyId ||
          event.participantId !== claims.participantId ||
          event.sessionId !== claims.sessionId ||
          event.appVersion !== claims.appVersion ||
          event.source !== claims.source ||
          provenanceClass !== claims.evidenceClass ||
          (claims.evidenceClass === 'darwin_lab' &&
            (event.provenance?.labExperimentId !== claims.labExperimentId ||
              !claims.runId ||
              !event.provenance?.runIds.includes(claims.runId)))
        );
      })
    ) {
      return json(
        {
          error: 'study_session_subject_mismatch',
          message: 'Telemetry identifiers do not match the study session.',
        },
        { status: 403 },
      );
    }
    const labExperiments = new Map(
      (await getLabRepository(env?.DB).listExperiments()).map((experiment) => [
        experiment.experimentId,
        experiment,
      ]),
    );
    const events = parsedEvents.filter((event) => {
      if (event.provenance?.evidenceClass === 'darwin_lab') {
        const experiment = event.provenance.labExperimentId
          ? labExperiments.get(event.provenance.labExperimentId)
          : null;
        return Boolean(
          experiment &&
          event.source === 'automated' &&
          event.studyId === experiment.studyId &&
          event.appVersion === experiment.targetAppVersion &&
          event.provenance.taskDefinitionId ===
            experiment.task.taskDefinitionId &&
          event.provenance.taskDefinitionHash ===
            experiment.task.definitionHash,
        );
      }
      return (
        targetProvenanceAllowed(event, env) &&
        targetStudyAllowed(event.studyId, env) &&
        isAllowedTargetVersion(event.appVersion)
      );
    });
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
      studyEventQuota(env),
      targetEventQuota(env),
    );
    return json(
      TelemetryReceiptSchema.parse({
        accepted: stored.accepted,
        rejected: candidates.length - events.length + stored.quotaRejected,
        duplicates: stored.duplicates,
      }),
      { status: 202 },
    );
  }

  const studyEventsMatch = pathname.match(/^\/api\/studies\/([^/]+)\/events$/);
  if (request.method === 'GET' && studyEventsMatch) {
    const studyId = decodeURIComponent(studyEventsMatch[1]!);
    const limitQuery = url.searchParams.get('limit');
    const requestedLimit = Number(limitQuery ?? 50);
    if (
      limitQuery !== null &&
      (!/^\d+$/.test(limitQuery) ||
        !Number.isSafeInteger(requestedLimit) ||
        requestedLimit < 1 ||
        requestedLimit > 200)
    ) {
      return json(
        {
          error: 'invalid_request',
          message: 'Event limit must be from 1 to 200.',
        },
        { status: 400 },
      );
    }
    const limit = requestedLimit;
    const cursorQuery = url.searchParams.get('after');
    if (cursorQuery && Number.isNaN(Date.parse(cursorQuery))) {
      return json(
        {
          error: 'invalid_request',
          message: 'Event cursor must be an ISO timestamp.',
        },
        { status: 400 },
      );
    }
    const cycleStart = await currentCycleStart(studyId);
    const receivedAfter =
      cursorQuery && (!cycleStart || cursorQuery > cycleStart)
        ? cursorQuery
        : cycleStart;
    const events = await telemetryRepository.listEvents(
      studyId,
      limit,
      receivedAfter,
    );
    const summary = await telemetryRepository.summarizeEvents(
      studyId,
      cycleStart,
    );
    return json(
      StudyEventsResponseSchema.parse({
        studyId,
        events,
        cursor: events.at(-1)?.receivedAt ?? cursorQuery ?? null,
        ...summary,
      }),
    );
  }

  const studyEvidenceMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/evidence$/,
  );
  if (request.method === 'POST' && studyEvidenceMatch) {
    const studyId = decodeURIComponent(studyEvidenceMatch[1]!);
    const labExperiment = (
      await getLabRepository(env?.DB).listExperiments()
    ).find((experiment) => experiment.studyId === studyId);
    if (labExperiment) {
      return json(
        {
          error: 'darwin_lab_evidence_boundary',
          message:
            'Darwin Lab observations can be analysed only through their automated evidence pack.',
        },
        { status: 409 },
      );
    }
    const source = url.searchParams.get('source') ?? 'real_user';
    if (source !== 'real_user' && source !== 'automated') {
      return json(
        { error: 'invalid_request', message: 'Unsupported evidence source.' },
        { status: 400 },
      );
    }
    const events = await telemetryRepository.listEvents(
      studyId,
      10_000,
      await currentCycleStart(studyId),
      source,
    );
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
      operationalLog('info', 'evidence_generated', {
        requestId,
        studyId,
        evidenceId: pack.evidenceId,
        sourceEventCount: pack.study.sourceEventCount,
        signalCount: pack.frictionSignals.length,
      });
      return json(EvidencePackSchema.parse(pack), { status: 201 });
    } catch (error) {
      if (error instanceof EvidenceBoundaryError) {
        return json(
          {
            error: 'evidence_boundary_violation',
            message: error.message,
          },
          { status: 409 },
        );
      }
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
    const labExperiment = (
      await getLabRepository(env?.DB).listExperiments()
    ).find((experiment) => experiment.studyId === studyId);
    if (labExperiment) {
      return json(
        {
          error: 'darwin_lab_evidence_boundary',
          message:
            'Darwin Lab telemetry cannot enter the measured reasoning workflow.',
        },
        { status: 409 },
      );
    }
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
    if (cached) {
      operationalLog('info', 'gpt_analysis_cache', {
        requestId,
        outcome: 'hit',
        analysisId: cached.analysisId,
      });
      return json(EvidenceAnalysisSchema.parse(cached));
    }
    operationalLog('info', 'gpt_analysis_cache', {
      requestId,
      outcome: 'miss',
      evidenceId: pack.evidenceId,
    });

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
      operationalLog('info', 'gpt_analysis_created', {
        requestId,
        analysisId: analysis.analysisId,
        model: analysis.model,
      });
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
        const text = await readBoundedBody(request, 64_000);
        input = text ? JSON.parse(text) : {};
      } catch (error) {
        return json(
          {
            error:
              error instanceof PayloadTooLargeError
                ? 'payload_too_large'
                : 'invalid_request',
            message: 'Manifest request is invalid.',
          },
          { status: error instanceof PayloadTooLargeError ? 413 : 400 },
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
      operationalLog('info', 'codex_manifest_created', {
        requestId,
        manifestId: manifest.manifestId,
        analysisId: manifest.analysisId,
      });
      const persisted =
        (await telemetryRepository.getCodexManifestById(manifest.manifestId)) ??
        manifest;
      return json(CodexImplementationManifestSchema.parse(persisted), {
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
      await dispatchEvolutionWorkflow({
        token: env.GITHUB_TOKEN,
        execution,
        callbackNonce: callbackCredential.nonce,
        manifestHash: manifest.manifestHash,
        callbackUrl: `${url.origin}/api/repository-executions/${execution.executionId}/callback`,
      });
      const queued = updateRepositoryExecution(execution, { status: 'queued' });
      const persisted =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          queued,
        );
      if (!persisted) {
        return json(
          {
            error: 'execution_changed',
            message:
              'Repository execution changed while the workflow was being dispatched.',
          },
          { status: 409 },
        );
      }
      operationalLog('info', 'github_workflow_dispatched', {
        requestId,
        executionId: persisted.executionId,
        action: 'evolution',
      });
      execution = persisted;
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
      const persisted =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          failed,
        );
      if (!persisted) {
        return json(
          {
            error: 'execution_changed',
            message:
              'Repository execution changed while a dispatch failure was being recorded.',
          },
          { status: 409 },
        );
      }
      return json(RepositoryMutationExecutionSchema.parse(persisted), {
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
      const manifest = await telemetryRepository.getCodexManifestById(
        execution.manifestId,
      );
      if (!manifest) {
        throw new Error('The retained execution manifest could not be loaded.');
      }
      const prepared = RepositoryMutationExecutionSchema.parse({
        ...execution,
        rollback,
      });
      const persistedPrepared =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          prepared,
        );
      if (!persistedPrepared) {
        return json(
          {
            error: 'execution_changed',
            message:
              'Repository execution changed while the rollback was being prepared.',
          },
          { status: 409 },
        );
      }
      execution = persistedPrepared;
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
      operationalLog('info', 'github_workflow_dispatched', {
        requestId,
        executionId: execution.executionId,
        action: 'rollback',
      });
      const queued = updateRepositoryRollback(execution, { status: 'queued' });
      const persistedQueued =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          queued,
        );
      if (!persistedQueued) {
        return json(
          {
            error: 'execution_changed',
            message:
              'Repository rollback changed while the workflow was being dispatched.',
          },
          { status: 409 },
        );
      }
      execution = persistedQueued;
      return json(RepositoryMutationExecutionSchema.parse(execution), {
        status: 201,
      });
    } catch (error) {
      if (execution.rollback) {
        const failed = updateRepositoryRollback(execution, {
          status: 'failed',
          error:
            error instanceof Error
              ? error.message
              : 'GitHub rollback workflow dispatch failed.',
        });
        const persisted =
          await telemetryRepository.compareAndSwapRepositoryExecution(
            execution,
            failed,
          );
        if (!persisted) {
          return json(
            {
              error: 'execution_changed',
              message:
                'Repository rollback changed while a dispatch failure was being recorded.',
            },
            { status: 409 },
          );
        }
        execution = persisted;
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

  const repositoryRecoveryMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/recovery\/force-fail$/,
  );
  if (request.method === 'POST' && repositoryRecoveryMatch) {
    let input: unknown;
    try {
      input = JSON.parse(await readBoundedBody(request, 1_024));
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'confirmation_required',
          message: 'A bounded recovery confirmation is required.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
      );
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).length !== 1 ||
      (input as { confirmation?: unknown }).confirmation !==
        'FAIL STRANDED EXECUTION'
    ) {
      return json(
        {
          error: 'confirmation_required',
          message: 'Type FAIL STRANDED EXECUTION to use recovery.',
        },
        { status: 400 },
      );
    }
    const executionId = decodeURIComponent(repositoryRecoveryMatch[1]!);
    const recovery = await forceFailStrandedExecution(
      telemetryRepository,
      executionId,
    );
    if (recovery.outcome === 'not_found') {
      return json(
        { error: 'not_found', message: 'Repository execution not found.' },
        { status: 404 },
      );
    }
    if (recovery.outcome === 'too_recent') {
      return json(
        {
          error: 'recovery_window_active',
          message: 'The workflow is still inside its bounded recovery window.',
          eligibleAt: recovery.eligibleAt,
        },
        { status: 409 },
      );
    }
    return json(RepositoryMutationExecutionSchema.parse(recovery.execution), {
      status: recovery.outcome === 'recovered' ? 200 : 409,
    });
  }

  const repositoryManifestMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/manifest$/,
  );
  if (request.method === 'GET' && repositoryManifestMatch) {
    const executionId = decodeURIComponent(repositoryManifestMatch[1]!);
    const execution =
      await telemetryRepository.getRepositoryExecution(executionId);
    const manifest = execution
      ? await telemetryRepository.getCodexManifestById(execution.manifestId)
      : null;
    if (!execution || !manifest) {
      return json(
        { error: 'not_found', message: 'Repository manifest not found.' },
        { status: 404 },
      );
    }
    if (url.searchParams.get('audience') === 'operator') {
      return json({ execution, manifest });
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
    let body: string;
    try {
      body = await readBoundedBody(request, 750_000);
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'invalid_callback',
          message: 'Callback body is invalid or too large.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
      );
    }
    const manifest = await telemetryRepository.getCodexManifestById(
      execution.manifestId,
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
      const persisted =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          updated,
        );
      if (!persisted) {
        return json(
          {
            error: 'execution_changed',
            message:
              'Repository rollback changed while the callback was being recorded.',
          },
          { status: 409 },
        );
      }
      return json(RepositoryMutationExecutionSchema.parse(persisted));
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
    let body: string;
    try {
      body = await readBoundedBody(request, 750_000);
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'invalid_callback',
          message: 'Callback body is invalid or too large.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
      );
    }
    const manifest = await telemetryRepository.getCodexManifestById(
      execution.manifestId,
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
      const persisted =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          updated,
        );
      if (!persisted) {
        return json(
          {
            error: 'execution_changed',
            message:
              'Repository execution changed while the callback was being recorded.',
          },
          { status: 409 },
        );
      }
      return json(RepositoryMutationExecutionSchema.parse(persisted));
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
    const releasing = updateRepositoryRollback(execution, {
      status: 'releasing',
    });
    const claimed = await telemetryRepository.compareAndSwapRepositoryExecution(
      execution,
      releasing,
    );
    if (!claimed) {
      const current =
        await telemetryRepository.getRepositoryExecution(executionId);
      if (current?.rollback?.status === 'released') {
        return json(RepositoryMutationExecutionSchema.parse(current));
      }
      return json(
        {
          error: 'release_in_progress',
          message: 'Another request already claimed this rollback release.',
        },
        { status: 409 },
      );
    }
    execution = claimed;
    let releasedSha: string;
    try {
      releasedSha = await mergeRollbackPullRequest({
        token: env.GITHUB_TOKEN,
        execution,
        rollback: execution.rollback!,
      });
    } catch (error) {
      const current =
        await telemetryRepository.getRepositoryExecution(executionId);
      if (current?.rollback?.status === 'released') {
        return json(RepositoryMutationExecutionSchema.parse(current));
      }
      if (
        !current ||
        current.version !== execution.version ||
        current.rollback?.status !== 'releasing'
      ) {
        return json(
          {
            error: 'release_state_uncertain',
            message:
              'The rollback release state changed while GitHub was responding; inspect the current execution before retrying.',
          },
          { status: 409 },
        );
      }
      const failed = updateRepositoryRollback(execution, {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'GitHub rollback pull request release failed.',
      });
      const persisted =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          failed,
        );
      if (!persisted) {
        return json(
          {
            error: 'release_state_uncertain',
            message:
              'The rollback release state changed while its failure was being recorded.',
          },
          { status: 409 },
        );
      }
      return json(RepositoryMutationExecutionSchema.parse(persisted), {
        status: 502,
      });
    }
    const released = updateRepositoryRollback(execution, {
      status: 'released',
      headSha: releasedSha,
      previewUrl: execution.repository.studyUrl,
    });
    const persisted =
      await telemetryRepository.compareAndSwapRepositoryExecution(
        execution,
        released,
      );
    if (!persisted) {
      const current =
        await telemetryRepository.getRepositoryExecution(executionId);
      if (current?.rollback?.status === 'released') {
        return json(RepositoryMutationExecutionSchema.parse(current));
      }
      return json(
        {
          error: 'release_state_uncertain',
          message:
            'GitHub merged the rollback, but its final state could not be recorded. Reconcile the execution before retrying.',
        },
        { status: 409 },
      );
    }
    return json(RepositoryMutationExecutionSchema.parse(persisted));
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
    const releasing = updateRepositoryExecution(execution, {
      status: 'releasing',
    });
    const claimed = await telemetryRepository.compareAndSwapRepositoryExecution(
      execution,
      releasing,
    );
    if (!claimed) {
      const current =
        await telemetryRepository.getRepositoryExecution(executionId);
      if (current?.status === 'released') {
        return json(RepositoryMutationExecutionSchema.parse(current));
      }
      return json(
        {
          error: 'release_in_progress',
          message: 'Another request already claimed this mutation release.',
        },
        { status: 409 },
      );
    }
    execution = claimed;
    let releasedSha: string;
    try {
      releasedSha = await mergeEvolutionPullRequest({
        token: env.GITHUB_TOKEN,
        execution,
      });
    } catch (error) {
      const current =
        await telemetryRepository.getRepositoryExecution(executionId);
      if (current?.status === 'released') {
        return json(RepositoryMutationExecutionSchema.parse(current));
      }
      if (
        !current ||
        current.version !== execution.version ||
        current.status !== 'releasing'
      ) {
        return json(
          {
            error: 'release_state_uncertain',
            message:
              'The mutation release state changed while GitHub was responding; inspect the current execution before retrying.',
          },
          { status: 409 },
        );
      }
      const failed = updateRepositoryExecution(execution, {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'GitHub pull request release failed.',
      });
      const persisted =
        await telemetryRepository.compareAndSwapRepositoryExecution(
          execution,
          failed,
        );
      if (!persisted) {
        return json(
          {
            error: 'release_state_uncertain',
            message:
              'The mutation release state changed while its failure was being recorded.',
          },
          { status: 409 },
        );
      }
      return json(RepositoryMutationExecutionSchema.parse(persisted), {
        status: 502,
      });
    }
    const released = updateRepositoryExecution(execution, {
      status: 'released',
      headSha: releasedSha,
      previewUrl: execution.repository.studyUrl,
    });
    const persisted =
      await telemetryRepository.compareAndSwapRepositoryExecution(
        execution,
        released,
      );
    if (!persisted) {
      const current =
        await telemetryRepository.getRepositoryExecution(executionId);
      if (current?.status === 'released') {
        return json(RepositoryMutationExecutionSchema.parse(current));
      }
      return json(
        {
          error: 'release_state_uncertain',
          message:
            'GitHub merged the mutation, but its final state could not be recorded. Reconcile the execution before retrying.',
        },
        { status: 409 },
      );
    }
    return json(RepositoryMutationExecutionSchema.parse(persisted));
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
      try {
        workspaceBody = await readBoundedBody(request, 256_000);
      } catch (error) {
        return json(
          {
            error:
              error instanceof PayloadTooLargeError
                ? 'payload_too_large'
                : 'invalid_request',
            message: 'Workspace body is invalid or too large.',
          },
          { status: error instanceof PayloadTooLargeError ? 413 : 400 },
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
    const sessionToken = request.headers.get('X-Darwin-Study-Session');
    const sessionVerification =
      sessionToken || env?.PROJECTFLOW_INGESTION_SECRET
        ? await verifyStudySessionToken(
            sessionToken,
            env?.PROJECTFLOW_INGESTION_SECRET ||
              'local-development-study-session',
          )
        : null;
    if (
      sessionVerification &&
      (!sessionVerification.ok ||
        sessionVerification.claims.studyId !== studyId ||
        sessionVerification.claims.participantId !== participantId ||
        sessionVerification.claims.deploymentOrigin !==
          targetAuthorization.identity.sourceOrigin)
    ) {
      return json(
        {
          error: sessionVerification.ok
            ? 'study_session_subject_mismatch'
            : sessionVerification.error,
          message: sessionVerification.ok
            ? 'Workspace path does not match the study session.'
            : sessionVerification.message,
        },
        { status: sessionVerification.ok ? 403 : 401 },
      );
    }
    if (
      !targetStudyAllowed(studyId, env) &&
      !(
        sessionVerification?.ok &&
        sessionVerification.claims.evidenceClass === 'darwin_lab'
      )
    ) {
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
      input = JSON.parse(await readBoundedBody(request, 16_384));
    } catch (error) {
      return json(
        {
          error:
            error instanceof PayloadTooLargeError
              ? 'payload_too_large'
              : 'invalid_request',
          message: 'Request body must be valid JSON.',
        },
        { status: error instanceof PayloadTooLargeError ? 413 : 400 },
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
  const requestId = requestIdFor(request);
  const startedAt = performance.now();
  try {
    const response = await handleRequest(request, env);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const pathname = new URL(request.url).pathname;
    operationalLog(
      response.status >= 500
        ? 'error'
        : response.status >= 400
          ? 'warn'
          : 'info',
      'request_completed',
      {
        requestId,
        method: request.method,
        path: pathname,
        status: response.status,
        durationMs,
      },
    );
    operationalLog(
      response.status === 401 || response.status === 403 ? 'warn' : 'info',
      'authentication_decision',
      {
        requestId,
        boundary: isCallbackRoute(request)
          ? 'github_callback'
          : isTargetRoute(pathname)
            ? 'projectflow_target'
            : pathname === '/api/health'
              ? 'public_health'
              : 'operator',
        outcome:
          response.status === 401 || response.status === 403
            ? 'rejected'
            : 'accepted',
        status: response.status,
      },
    );

    const auditMutation =
      request.method !== 'GET' &&
      request.method !== 'OPTIONS' &&
      (pathname === '/api/demo/reset' ||
        pathname.startsWith('/api/retention/') ||
        pathname.startsWith('/api/target-connection') ||
        pathname.includes('/evidence') ||
        pathname.includes('/codex-manifest') ||
        pathname.includes('/repository-executions') ||
        pathname === '/api/simulations' ||
        pathname.startsWith('/api/lab/'));
    if (auditMutation) {
      const callbackRoute = isCallbackRoute(request);
      const targetRoute = isTargetRoute(pathname);
      const authorization =
        !callbackRoute && !targetRoute
          ? await authorizeOperator(
              request,
              env,
              requiredOperatorCapability(request.method, pathname),
            )
          : null;
      const actor = callbackRoute
        ? 'github-actions'
        : targetRoute
          ? 'projectflow-target'
          : authorization?.ok
            ? authorization.identity.actor
            : 'unauthenticated';
      let afterState: string | null = null;
      if (
        response.headers.get('Content-Type')?.includes('application/json') &&
        (pathname.includes('/repository-executions') ||
          pathname.includes('/codex-manifest') ||
          pathname === '/api/demo/reset')
      ) {
        try {
          const payload = (await response.clone().json()) as {
            status?: unknown;
            rollback?: { status?: unknown };
          };
          afterState =
            typeof payload.rollback?.status === 'string'
              ? `rollback:${payload.rollback.status}`
              : typeof payload.status === 'string'
                ? payload.status
                : null;
        } catch {
          afterState = null;
        }
      }
      const beforeState = pathname.endsWith('/rollback/release')
        ? 'rollback:preview_ready'
        : pathname.endsWith('/rollback')
          ? 'released'
          : pathname.endsWith('/release')
            ? 'preview_ready'
            : pathname.includes('/callback')
              ? 'workflow_in_progress'
              : null;
      const event = OperationalAuditEventSchema.parse({
        auditEventId: `audit-${crypto.randomUUID()}`,
        requestId,
        occurredAt: new Date().toISOString(),
        actor,
        target: pathname,
        action: `${request.method} ${pathname}`.slice(0, 128),
        outcome:
          response.status < 400
            ? 'succeeded'
            : response.status < 500
              ? 'rejected'
              : 'failed',
        beforeState,
        afterState,
        durationMs,
        metadata: { status: response.status },
      });
      operationalLog(
        event.outcome === 'failed'
          ? 'error'
          : event.outcome === 'rejected'
            ? 'warn'
            : 'info',
        'privileged_transition',
        {
          requestId,
          actor: event.actor,
          target: event.target,
          action: event.action,
          outcome: event.outcome,
          beforeState: event.beforeState,
          afterState: event.afterState,
          durationMs,
        },
      );
      await timeOperation(
        'd1',
        'record_audit_event',
        () => getTelemetryRepository(env.DB).recordAuditEvent(event),
        requestId,
      ).catch(() => undefined);
    }

    const tracedResponse = new Response(response.body, response);
    tracedResponse.headers.set('X-Darwin-Request-ID', requestId);
    return tracedResponse;
  } catch (error) {
    console.error(
      '[darwin:api]',
      JSON.stringify({
        event: 'unhandled_request_error',
        requestId,
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
      {
        status: 500,
        headers: { 'X-Darwin-Request-ID': requestId },
      },
      corsForRequest(request, env).corsHeaders,
    );
  }
};

const worker: ExportedHandler<Env> = {
  fetch: handleWorkerRequest,
  async scheduled(_controller, env, context) {
    context.waitUntil(
      getTelemetryRepository(env.DB)
        .compactRetention()
        .then((result) => {
          console.info(
            '[darwin:retention]',
            JSON.stringify({ event: 'retention_run_completed', ...result }),
          );
        })
        .catch((error) => {
          console.error(
            '[darwin:retention]',
            JSON.stringify({
              event: 'retention_run_failed',
              error: error instanceof Error ? error.name : 'UnknownError',
            }),
          );
        }),
    );
  },
};

export default worker;

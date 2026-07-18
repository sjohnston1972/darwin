import {
  CodexImplementationManifestSchema,
  DemoResetResponseSchema,
  EvidencePackSchema,
  EvidenceAnalysisSchema,
  GenomeExecutionDetailResponseSchema,
  GenomeHistoryResponseSchema,
  HealthResponseSchema,
  ObservationArchiveDetailResponseSchema,
  ObservationArchivesResponseSchema,
  ParticipantWorkspaceResponseSchema,
  RepositoryMutationExecutionSchema,
  SimulationSummarySchema,
  StudyEventsResponseSchema,
  StudySessionResponseSchema,
  TargetApplicationConnectionSchema,
  TelemetryReceiptSchema,
} from '@darwin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleRequest,
  handleWorkerRequest,
  resetSimulationStore,
} from './index';
import { resetInMemoryTelemetry } from './persistence/telemetry-repository';
import { signTargetRequestForTest } from './security/auth';
import {
  hashCallbackBodyForTest,
  signExecutionCallbackForTest,
} from './security/callback';

const studyEvent = {
  schemaVersion: 1,
  eventId: '49d13df2-8dce-4ad3-b20e-d8b4edc01b63',
  sessionId: 'session-api-test',
  participantId: 'participant-api-test',
  studyId: 'projectflow-baseline-study',
  appVersion: '1.0.0',
  source: 'real_user',
  occurredAt: '2026-07-16T12:00:00.000Z',
  sequence: 0,
  route: '/study/dashboard',
  viewport: 'desktop',
  eventType: 'page_view',
} as const;

const candidate = (id: string, total: number) => ({
  id,
  title: `Mutation ${id}`,
  problem: 'Assigned work takes too many interactions to reach.',
  evidenceIds: ['EV-001'],
  pressureClusterIds: ['task-discovery-pressure'],
  hypothesis: 'A direct route will improve discovery.',
  change: `Implement ${id} as a direct task-discovery capability.`,
  predictedImpact: {
    metric: 'navigation efficiency',
    direction: 'increase',
    rationale: 'It removes intermediate routes.',
  },
  confidence: 0.8,
  scorecard: {
    evidenceStrength: 70,
    userImpact: total,
    feasibility: total,
    validationClarity: total,
    total,
  },
  scope: ['navigation'],
  tradeoffs: ['Adds a persistent navigation choice.'],
  acceptanceCriteria: ['Assigned work is directly reachable.'],
  validationPlan: {
    primaryMetric: 'Median interactions to assigned task',
    baseline: 'Measured path contains seven interactions',
    successThreshold: 'Four or fewer measured interactions',
    guardrails: ['Task completion rate does not decrease.'],
  },
  codexBrief: `Implement ${id} while preserving existing routes.`,
});

const evidenceModelOutput = {
  evidenceAssessment: {
    summary: 'The ordered journey shows indirect assigned-work navigation.',
    pressureClusters: [
      {
        id: 'task-discovery-pressure',
        title: 'Assigned work is buried',
        interpretation: 'The information architecture hides assigned tasks.',
        evidenceIds: ['EV-001'],
        affectedTargets: ['nav-projects'],
        userConsequence: 'Users take a long route to assigned work.',
        competingExplanations: ['The participant may be unfamiliar.'],
        mutationOpportunity: 'Create a direct assigned-work destination.',
      },
    ],
    selectionRationale: 'The direct route has the clearest causal path.',
  },
  selectedMutation: candidate('direct-my-work', 90),
  alternatives: [
    candidate('dashboard-work-queue', 75),
    candidate('global-search', 70),
  ],
  unsupportedIdeasRejected: [
    { idea: 'Rewrite telemetry', reason: 'Telemetry is protected.' },
  ],
};

const liveEnv = {
  DARWIN_AI_MODE: 'live',
  OPENAI_API_KEY: 'sk-test-secret',
  OPENAI_MODEL: 'gpt-5.6',
} as const;

const repositorySha = 'd'.repeat(40);
const repositoryTarget = {
  schemaVersion: 1,
  targetId: 'projectflow',
  name: 'ProjectFlow',
  purpose: 'Task management',
  defaultBranch: 'main',
  mutablePaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  contextPaths: ['AGENTS.md', 'apps/projectflow/src/App.tsx'],
  validationCommands: ['npm run verify'],
  limits: { maximumChangedFiles: 8, maximumChangedLines: 700 },
};

const signedTargetRequest = async (
  path: string,
  body: string,
  secret = 'projectflow-ingestion-test-secret',
  overrides: Record<string, string> = {},
) => {
  const timestamp = overrides.timestamp ?? String(Date.now());
  const targetId = overrides.targetId ?? 'projectflow';
  const sourceOrigin =
    overrides.sourceOrigin ?? 'https://darwin-projectflow.pages.dev';
  const clientKey = overrides.clientKey ?? 'signed-edge-client';
  const signature = await signTargetRequestForTest(
    secret,
    [timestamp, targetId, sourceOrigin, clientKey, body].join('\n'),
  );
  return new Request(`https://darwin-api.example${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Darwin-Timestamp': timestamp,
      'X-Darwin-Target': targetId,
      'X-Darwin-Source-Origin': sourceOrigin,
      'X-Darwin-Client-Key': clientKey,
      'X-Darwin-Signature': overrides.signature ?? signature,
    },
    ...(body ? { body } : {}),
  });
};

const signedCallbackRequest = async ({
  path,
  method,
  body = '',
  nonce,
  executionId,
  repository,
  manifestHash,
  secret = 'callback-test-token',
  timestamp = String(Date.now()),
}: {
  path: string;
  method: 'GET' | 'POST';
  body?: string;
  nonce: string;
  executionId: string;
  repository: string;
  manifestHash: string;
  secret?: string;
  timestamp?: string;
}) => {
  const bodyDigest = await hashCallbackBodyForTest(body);
  const signature = await signExecutionCallbackForTest(
    secret,
    [
      method,
      new URL(path).pathname,
      timestamp,
      nonce,
      executionId,
      repository,
      manifestHash,
      bodyDigest,
    ].join('\n'),
  );
  return new Request(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Darwin-Timestamp': timestamp,
      'X-Darwin-Execution-Nonce': nonce,
      'X-Darwin-Repository': repository,
      'X-Darwin-Manifest-Hash': manifestHash,
      'X-Darwin-Signature': signature,
    },
    ...(body ? { body } : {}),
  });
};

const installOpenAIResponse = (output: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('api.github.com/repos/') && url.includes('/commits/')) {
        return Response.json({ sha: repositorySha });
      }
      if (url.endsWith(`/${repositorySha}/darwin.target.json`)) {
        return new Response(JSON.stringify(repositoryTarget));
      }
      if (
        url.includes(`raw.githubusercontent.com/`) &&
        url.includes(repositorySha)
      ) {
        return new Response(
          url.endsWith('/AGENTS.md')
            ? '# ProjectFlow repository constraints'
            : 'export function App() { return null; }',
        );
      }
      if (url.startsWith('https://darwin-projectflow.pages.dev/')) {
        return new Response(
          '<!doctype html><html><head><title>ProjectFlow</title></head></html>',
          { headers: { 'Content-Type': 'text/html' } },
        );
      }
      if (url.endsWith('/merge')) {
        return Response.json({ merged: true, sha: 'f'.repeat(40) });
      }
      return new Response(
        JSON.stringify({
          id: 'resp_test_live',
          output_text: JSON.stringify(output),
        }),
        { status: 200 },
      );
    }),
  );

describe('Darwin API', () => {
  beforeEach(async () => {
    resetSimulationStore();
    await resetInMemoryTelemetry();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a schema-valid health response', async () => {
    const response = await handleRequest(
      new Request('http://localhost/api/health'),
    );
    const body = HealthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(body.service).toBe('darwin-api');
    expect(body.version).toBe('0.23.0');

    const liveResponse = await handleRequest(
      new Request('http://localhost/api/health'),
      {
        DARWIN_AI_MODE: 'live',
        OPENAI_API: 'legacy-local-key-name',
        OPENAI_MODEL: 'gpt-5.6',
      },
    );
    await expect(liveResponse.json()).resolves.toMatchObject({
      analysis: {
        mode: 'live',
        model: 'gpt-5.6',
        liveModelAvailable: true,
      },
    });
  });

  it('requires capability-scoped operator authorization on every control-plane route', async () => {
    const protectedRoutes = [
      ['GET', '/api/target-connection'],
      ['POST', '/api/target-connection'],
      ['POST', '/api/target-connection/disconnect'],
      ['POST', '/api/demo/reset'],
      ['GET', '/api/genome'],
      ['GET', '/api/observations/archives'],
      ['GET', '/api/studies/projectflow-baseline-study/events'],
      ['POST', '/api/studies/projectflow-baseline-study/evidence'],
      ['GET', '/api/studies/projectflow-baseline-study/evidence/latest'],
      ['POST', '/api/studies/projectflow-baseline-study/analyse-evidence'],
      [
        'GET',
        '/api/studies/projectflow-baseline-study/evidence-analysis/latest',
      ],
      ['POST', '/api/evidence-analyses/analysis-test/codex-manifest'],
      ['POST', '/api/evidence-analyses/analysis-test/codex-manifest/execution'],
      ['GET', '/api/repository-executions/execution-test'],
      ['POST', '/api/repository-executions/execution-test/rollback'],
      ['POST', '/api/repository-executions/execution-test/release'],
      ['POST', '/api/repository-executions/execution-test/rollback/release'],
      ['GET', '/api/studies/projectflow-baseline-study/sessions/session-test'],
      ['POST', '/api/simulations'],
      ['GET', '/api/simulations/sim-baseline-1859'],
    ] as const;

    for (const [method, path] of protectedRoutes) {
      const response = await handleRequest(
        new Request(`https://darwin-api.example${path}`, { method }),
        { DARWIN_OPERATOR_TOKEN: 'operator-test-token' },
      );
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }

    const viewerDenied = await handleRequest(
      new Request(
        'https://darwin-api.example/api/studies/projectflow-baseline-study/events',
        { headers: { Authorization: 'Bearer viewer-test-token' } },
      ),
      {
        DARWIN_OPERATOR_TOKEN: 'operator-test-token',
        DARWIN_VIEWER_TOKEN: 'viewer-test-token',
      },
    );
    expect(viewerDenied.status).toBe(403);

    const operatorSession = await handleRequest(
      new Request('https://darwin-api.example/api/auth/session', {
        headers: { Authorization: 'Bearer operator-test-token' },
      }),
      { DARWIN_OPERATOR_TOKEN: 'operator-test-token' },
    );
    expect(operatorSession.status).toBe(200);
    await expect(operatorSession.json()).resolves.toMatchObject({
      authenticated: true,
      actor: 'operator',
    });
  });

  it('accepts only signed ProjectFlow telemetry with configured provenance', async () => {
    const secret = 'projectflow-ingestion-test-secret';
    const environment = {
      PROJECTFLOW_INGESTION_SECRET: secret,
      PROJECTFLOW_PRODUCTION_URL: 'https://darwin-projectflow.pages.dev/',
    };
    const body = JSON.stringify({ events: [studyEvent] });
    const unsigned = await handleRequest(
      new Request('https://darwin-api.example/api/telemetry/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      environment,
    );
    expect(unsigned.status).toBe(401);

    const accepted = await handleRequest(
      await signedTargetRequest('/api/telemetry/events', body, secret),
      environment,
    );
    expect(accepted.status).toBe(202);
    expect(TelemetryReceiptSchema.parse(await accepted.json())).toEqual({
      accepted: 1,
      rejected: 0,
      duplicates: 0,
    });

    const replay = await handleRequest(
      await signedTargetRequest('/api/telemetry/events', body, secret),
      environment,
    );
    expect(TelemetryReceiptSchema.parse(await replay.json())).toEqual({
      accepted: 0,
      rejected: 0,
      duplicates: 1,
    });

    const unsupportedBody = JSON.stringify({
      events: [{ ...studyEvent, studyId: 'attacker-selected-study' }],
    });
    const unsupported = await handleRequest(
      await signedTargetRequest(
        '/api/telemetry/events',
        unsupportedBody,
        secret,
      ),
      environment,
    );
    expect(unsupported.status).toBe(403);
  });

  it('rate limits signed telemetry on the edge-derived target identity', async () => {
    const limit = vi.fn(async (input: { key: string }) => {
      void input;
      return { success: true };
    });
    const secret = 'projectflow-ingestion-test-secret';
    const environment = {
      PROJECTFLOW_INGESTION_SECRET: secret,
      PROJECTFLOW_PRODUCTION_URL: 'https://darwin-projectflow.pages.dev/',
      INGESTION_RATE_LIMITER: { limit },
    };
    for (const [index, participantId] of [
      'participant-one',
      'participant-two',
    ].entries()) {
      const body = JSON.stringify({
        events: [
          {
            ...studyEvent,
            eventId: `${index + 1}9d13df2-8dce-4ad3-b20e-d8b4edc01b6${index}`,
            sessionId: `session-${index}`,
            participantId,
          },
        ],
      });
      const response = await handleRequest(
        await signedTargetRequest('/api/telemetry/events', body, secret),
        environment,
      );
      expect(response.status).toBe(202);
    }
    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls[0]![0]).toEqual(limit.mock.calls[1]![0]);
    expect(limit).toHaveBeenCalledWith({
      key: 'projectflow:signed-edge-client',
    });
  });

  it('verifies, persists, and disconnects the configured target application', async () => {
    installOpenAIResponse(evidenceModelOutput);
    const request = {
      fullName: 'sjohnston1972/projectflow',
      branch: 'main',
      productionUrl: 'https://darwin-projectflow.pages.dev/',
      studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
    };
    const connectedResponse = await handleRequest(
      new Request('http://localhost/api/target-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
    const connection = TargetApplicationConnectionSchema.parse(
      await connectedResponse.json(),
    );

    expect(connectedResponse.status).toBe(201);
    expect(connection.repository).toMatchObject({
      fullName: request.fullName,
      branch: request.branch,
      productionUrl: request.productionUrl,
      studyUrl: request.studyUrl,
    });
    expect(connection.checks.map((check) => check.id)).toEqual([
      'repository',
      'contract',
      'runtime',
      'telemetry',
    ]);

    const loadedResponse = await handleRequest(
      new Request('http://localhost/api/target-connection'),
    );
    expect(
      TargetApplicationConnectionSchema.parse(await loadedResponse.json()),
    ).toEqual(connection);

    const disconnected = await handleRequest(
      new Request('http://localhost/api/target-connection/disconnect', {
        method: 'POST',
      }),
    );
    expect(disconnected.status).toBe(204);
    expect(
      (
        await handleRequest(
          new Request('http://localhost/api/target-connection'),
        )
      ).status,
    ).toBe(204);
  });

  it('rejects target connections outside the configured control boundary', async () => {
    const response = await handleRequest(
      new Request('http://localhost/api/target-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'another/repository',
          branch: 'main',
          productionUrl: 'https://example.com/',
          studyUrl: 'https://example.com/?study=true',
        }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'target_not_allowed',
    });
  });

  it('returns a structured 404 for unknown routes', async () => {
    const response = await handleRequest(
      new Request('http://localhost/api/missing'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'not_found',
    });
  });

  it('preserves JSON and CORS when an unexpected request error occurs', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const database = {
      prepare: vi.fn(() => {
        throw new Error('database unavailable');
      }),
    } as unknown as D1Database;
    const origin = 'https://darwin-control-room.pages.dev';
    const response = await handleWorkerRequest(
      new Request('http://localhost/api/studies/test/events', {
        headers: { Origin: origin },
      }),
      { ALLOWED_ORIGINS: origin, DB: database },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    await expect(response.json()).resolves.toMatchObject({
      error: 'internal_error',
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[darwin:api]',
      expect.stringContaining('unhandled_request_error'),
    );
  });

  it('enforces production origins and telemetry rate limits', async () => {
    const forbidden = await handleRequest(
      new Request('http://localhost/api/health', {
        headers: { Origin: 'https://untrusted.example' },
      }),
      { ALLOWED_ORIGINS: 'https://darwin-control-room.pages.dev' },
    );
    expect(forbidden.status).toBe(403);

    const limiter = {
      limit: vi.fn().mockResolvedValue({ success: false }),
    } as unknown as RateLimit;
    const limited = await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        headers: { Origin: 'https://darwin-projectflow.pages.dev' },
        body: JSON.stringify({ events: [studyEvent] }),
      }),
      {
        ALLOWED_ORIGINS: 'https://darwin-projectflow.pages.dev',
        INGESTION_RATE_LIMITER: limiter,
      },
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://darwin-projectflow.pages.dev',
    );
  });

  it('ingests, deduplicates, and exposes ordered real telemetry', async () => {
    const invalid = {
      ...studyEvent,
      eventId: crypto.randomUUID(),
      rawText: 'no',
    };
    const ingest = await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [studyEvent, invalid] }),
      }),
    );
    const receipt = TelemetryReceiptSchema.parse(await ingest.json());
    expect(ingest.status).toBe(202);
    expect(receipt).toEqual({ accepted: 1, rejected: 1, duplicates: 0 });

    const duplicate = await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({ events: [studyEvent] }),
      }),
    );
    expect(TelemetryReceiptSchema.parse(await duplicate.json())).toEqual({
      accepted: 0,
      rejected: 0,
      duplicates: 1,
    });

    const eventsResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events?limit=20',
      ),
    );
    const events = StudyEventsResponseSchema.parse(await eventsResponse.json());
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      eventId: studyEvent.eventId,
      source: 'real_user',
    });
    expect(events.count).toBe(1);
    expect(events.sessionCounts).toEqual({ 'session-api-test': 1 });
    expect(events.participantCount).toBe(1);

    const sessionResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/sessions/session-api-test',
      ),
    );
    const session = StudySessionResponseSchema.parse(
      await sessionResponse.json(),
    );
    expect(session.events.map((event) => event.sequence)).toEqual([0]);
  });

  it('persists participant-specific ProjectFlow workspaces', async () => {
    const workspace = {
      projects: [
        {
          id: 'polaris',
          name: 'Polaris Launch',
          code: 'POL',
          owner: 'Alex Morgan',
          status: 'On track',
          dueDate: 'Aug 30',
        },
      ],
      tasks: [],
      updatedAt: '2026-07-16T12:00:00.000Z',
    };
    const path =
      'http://localhost/api/studies/projectflow-baseline-study/participants/participant-api-test/workspace';
    const storedResponse = await handleRequest(
      new Request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspace),
      }),
    );
    expect(storedResponse.status).toBe(200);

    const loadedResponse = await handleRequest(new Request(path));
    const loaded = ParticipantWorkspaceResponseSchema.parse(
      await loadedResponse.json(),
    );
    expect(loaded.workspace?.projects[0]?.name).toBe('Polaris Launch');
  });

  it('generates and persists a hashed evidence pack from real events', async () => {
    const attemptId = 'attempt-api-evidence';
    const taskId = 'find-assigned-task';
    const start = {
      ...studyEvent,
      eventId: '00000000-0000-4000-8000-000000000101',
      eventType: 'task_started',
      taskAttemptId: attemptId,
      taskId,
    };
    const completed = {
      ...studyEvent,
      eventId: '00000000-0000-4000-8000-000000000102',
      sequence: 1,
      occurredAt: '2026-07-16T12:00:10.000Z',
      eventType: 'task_completed',
      taskAttemptId: attemptId,
      taskId,
      durationMs: 10_000,
      outcome: 'success',
    };
    await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({ events: [start, completed] }),
      }),
    );

    const generatedResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence',
        { method: 'POST' },
      ),
    );
    const generated = EvidencePackSchema.parse(await generatedResponse.json());
    expect(generatedResponse.status).toBe(201);
    expect(generated.evidenceClass).toBe('measured');
    expect(generated.study.attempts).toBe(1);
    expect(generated.evidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const latestResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence/latest',
      ),
    );
    const latest = EvidencePackSchema.parse(await latestResponse.json());
    expect(latest.evidenceHash).toBe(generated.evidenceHash);

    const resetResponse = await handleRequest(
      new Request('http://localhost/api/demo/reset', { method: 'POST' }),
    );
    expect(DemoResetResponseSchema.parse(await resetResponse.json())).toEqual({
      status: 'reset',
      repositoryResetDispatched: false,
    });
    const resetEvidence = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence/latest?optional=true',
      ),
    );
    const resetEvents = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events?limit=20',
      ),
    );
    expect(resetEvidence.status).toBe(204);
    expect(
      StudyEventsResponseSchema.parse(await resetEvents.json()),
    ).toMatchObject({ count: 0, events: [] });
  });

  it('caches evidence analysis and creates a bounded Codex manifest', async () => {
    const attemptId = 'attempt-analysis-test';
    const taskId = 'find-assigned-task';
    const event = (
      sequence: number,
      eventType: string,
      details: Record<string, unknown> = {},
    ) => ({
      ...studyEvent,
      eventId: `00000000-0000-4000-8000-${(sequence + 201)
        .toString()
        .padStart(12, '0')}`,
      occurredAt: `2026-07-16T12:01:${sequence
        .toString()
        .padStart(2, '0')}.000Z`,
      sequence,
      eventType,
      ...details,
    });
    const events = [
      event(0, 'task_started', { taskAttemptId: attemptId, taskId }),
      event(1, 'element_clicked', {
        targetId: 'nav-projects',
        taskAttemptId: attemptId,
        taskId,
      }),
      event(2, 'route_changed', {
        route: '/study/projects',
        properties: { fromRoute: '/study/dashboard' },
      }),
      event(3, 'element_clicked', {
        route: '/study/projects',
        targetId: 'project-open-apollo',
        taskAttemptId: attemptId,
        taskId,
      }),
      event(4, 'route_changed', {
        route: '/study/projects/apollo',
        properties: { fromRoute: '/study/projects' },
      }),
      event(5, 'element_clicked', {
        route: '/study/projects/apollo',
        targetId: 'project-tasks-open',
        taskAttemptId: attemptId,
        taskId,
      }),
      event(6, 'route_changed', {
        route: '/study/projects/apollo/tasks',
        properties: { fromRoute: '/study/projects/apollo' },
      }),
      event(7, 'element_clicked', {
        route: '/study/projects/apollo/tasks',
        targetId: 'task-open-apl-241',
        taskAttemptId: attemptId,
        taskId,
      }),
      event(8, 'task_completed', {
        route: '/study/projects/apollo/tasks',
        taskAttemptId: attemptId,
        taskId,
        durationMs: 8_000,
        outcome: 'success',
      }),
    ];
    await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({ events }),
      }),
    );
    await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence',
        { method: 'POST' },
      ),
    );

    const analysisPath =
      'http://localhost/api/studies/projectflow-baseline-study/analyse-evidence';
    installOpenAIResponse(evidenceModelOutput);
    const firstResponse = await handleRequest(
      new Request(analysisPath, { method: 'POST' }),
      liveEnv,
    );
    const first = EvidenceAnalysisSchema.parse(await firstResponse.json());
    const secondResponse = await handleRequest(
      new Request(analysisPath, { method: 'POST' }),
      liveEnv,
    );
    const second = EvidenceAnalysisSchema.parse(await secondResponse.json());

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);
    expect(second).toEqual(first);
    expect(first.selectedMutation.evidenceIds).toContain('EV-001');

    const manifestResponse = await handleRequest(
      new Request(
        `http://localhost/api/evidence-analyses/${first.analysisId}/codex-manifest`,
        { method: 'POST' },
      ),
      {},
    );
    const manifest = CodexImplementationManifestSchema.parse(
      await manifestResponse.json(),
    );
    expect(manifest.repositoryCommit).toBe(repositorySha);
    expect(manifest.repository?.baseSha).toBe(repositorySha);
    expect(manifest.mutationIds).toEqual([first.selectedMutation.id]);
    expect(JSON.stringify(manifest)).not.toContain('participantId');

    const alternatives = first.alternatives.slice(0, 2);
    const alternativeManifestResponse = await handleRequest(
      new Request(
        `http://localhost/api/evidence-analyses/${first.analysisId}/codex-manifest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mutationIds: alternatives.map((alternative) => alternative.id),
          }),
        },
      ),
      {},
    );
    const alternativeManifest = CodexImplementationManifestSchema.parse(
      await alternativeManifestResponse.json(),
    );
    expect(alternativeManifestResponse.status).toBe(201);
    expect(alternativeManifest.mutationId).toBe(alternatives[0]!.id);
    expect(alternativeManifest.mutationIds).toEqual(
      alternatives.map((alternative) => alternative.id),
    );
    expect(alternativeManifest.brief).toContain(alternatives[0]!.codexBrief);
    expect(alternativeManifest.brief).toContain(alternatives[1]!.codexBrief);

    const executionPath = `http://localhost/api/evidence-analyses/${first.analysisId}/codex-manifest/execution`;
    const executionResponse = await handleRequest(
      new Request(executionPath, { method: 'POST' }),
      {
        GITHUB_TOKEN: 'github-test-token',
        DARWIN_CALLBACK_TOKEN: 'callback-test-token',
      },
    );
    let execution = RepositoryMutationExecutionSchema.parse(
      await executionResponse.json(),
    );
    expect(executionResponse.status).toBe(201);
    expect(execution.status).toBe('queued');
    expect(execution.baseSha).toBe(repositorySha);
    expect(execution.repository.fullName).toBe('sjohnston1972/projectflow');
    const latestWorkflowInputs = () => {
      const dispatch = vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).includes('/actions/workflows/'),
        )
        .at(-1);
      return JSON.parse(String(dispatch?.[1]?.body)).inputs as Record<
        string,
        string
      >;
    };
    let callbackNonce = latestWorkflowInputs().callback_nonce!;

    const restoredExecutionResponse = await handleRequest(
      new Request(executionPath),
    );
    expect(
      RepositoryMutationExecutionSchema.parse(
        await restoredExecutionResponse.json(),
      ).executionId,
    ).toBe(execution.executionId);

    const manifestAccessPath = `http://localhost/api/repository-executions/${execution.executionId}/manifest`;
    const deniedManifestResponse = await handleRequest(
      new Request(manifestAccessPath),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    expect(deniedManifestResponse.status).toBe(401);
    const actionManifestResponse = await handleRequest(
      await signedCallbackRequest({
        path: manifestAccessPath,
        method: 'GET',
        nonce: callbackNonce,
        executionId: execution.executionId,
        repository: execution.repository.fullName,
        manifestHash: alternativeManifest.manifestHash,
      }),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    const actionManifest = (await actionManifestResponse.json()) as {
      manifest: typeof alternativeManifest;
    };
    expect(actionManifest.manifest.manifestId).toBe(
      alternativeManifest.manifestId,
    );

    const callbackPath = `http://localhost/api/repository-executions/${execution.executionId}/callback`;
    const callbackRequest = async (
      body: Record<string, unknown>,
      timestamp?: string,
      nonce = callbackNonce,
    ) => {
      const callbackBody = JSON.stringify(body);
      return signedCallbackRequest({
        path: callbackPath,
        method: 'POST',
        body: callbackBody,
        nonce,
        executionId: execution.executionId,
        repository: execution.repository.fullName,
        manifestHash: alternativeManifest.manifestHash,
        ...(timestamp ? { timestamp } : {}),
      });
    };
    const callback = async (body: Record<string, unknown>) => {
      const response = await handleRequest(await callbackRequest(body), {
        DARWIN_CALLBACK_TOKEN: 'callback-test-token',
      });
      return { response, body: await response.json() };
    };
    const oversizedCallback = await handleRequest(
      new Request(callbackPath, {
        method: 'POST',
        body: 'x'.repeat(750_001),
      }),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    expect(oversizedCallback.status).toBe(413);
    const crossExecutionCallback = await handleRequest(
      await callbackRequest({ status: 'failed' }, undefined, 'wrong-nonce'),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    expect(crossExecutionCallback.status).toBe(403);
    const expiredCallback = await handleRequest(
      await callbackRequest(
        { status: 'failed' },
        String(Date.now() - 10 * 60 * 1_000),
      ),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    expect(expiredCallback.status).toBe(401);
    const failedExecution = RepositoryMutationExecutionSchema.parse(
      (
        await callback({
          status: 'failed',
          error: 'Transient workflow failure.',
        })
      ).body,
    );
    expect(failedExecution.status).toBe('failed');

    const retryResponse = await handleRequest(
      new Request(executionPath, { method: 'POST' }),
      {
        GITHUB_TOKEN: 'github-test-token',
        DARWIN_CALLBACK_TOKEN: 'callback-test-token',
      },
    );
    execution = RepositoryMutationExecutionSchema.parse(
      await retryResponse.json(),
    );
    expect(retryResponse.status).toBe(201);
    expect(execution.status).toBe('queued');
    expect(execution.error).toBeNull();
    callbackNonce = latestWorkflowInputs().callback_nonce!;

    const runningCallbackBody = {
      status: 'codex_running',
      workflowRunId: 123,
      workflowUrl:
        'https://github.com/sjohnston1972/projectflow/actions/runs/123',
    };
    const replayTimestamp = String(Date.now());
    const firstRunningResponse = await handleRequest(
      await callbackRequest(runningCallbackBody, replayTimestamp),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    execution = RepositoryMutationExecutionSchema.parse(
      await firstRunningResponse.json(),
    );
    const replayedRunningResponse = await handleRequest(
      await callbackRequest(runningCallbackBody, replayTimestamp),
      { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
    );
    expect(replayedRunningResponse.status).toBe(409);
    await expect(replayedRunningResponse.json()).resolves.toMatchObject({
      error: 'callback_replayed',
    });
    execution = RepositoryMutationExecutionSchema.parse(
      (await callback({ status: 'validating' })).body,
    );
    execution = RepositoryMutationExecutionSchema.parse(
      (
        await callback({
          status: 'pull_request_open',
          headSha: 'e'.repeat(40),
          pullRequestNumber: 7,
          pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/7',
        })
      ).body,
    );
    const preview = await callback({
      status: 'preview_ready',
      previewUrl: 'https://darwin-projectflow.pages.dev/?study=true',
      changedFiles: ['apps/projectflow/src/App.tsx'],
      checks: [
        {
          name: 'npm run verify',
          status: 'passed',
          durationMs: 1200,
          output: 'All checks passed.',
        },
      ],
    });
    execution = RepositoryMutationExecutionSchema.parse(preview.body);
    expect(execution.status).toBe('preview_ready');
    expect(execution.pullRequestNumber).toBe(7);
    expect(execution.checks[0]?.status).toBe('passed');

    const invalid = await callback({ status: 'released' });
    expect(invalid.response.status).toBe(409);

    const releaseResponse = await handleRequest(
      new Request(
        `http://localhost/api/repository-executions/${execution.executionId}/release`,
        { method: 'POST' },
      ),
      { GITHUB_TOKEN: 'github-test-token' },
    );
    const releasedExecution = RepositoryMutationExecutionSchema.parse(
      await releaseResponse.json(),
    );
    expect(releaseResponse.status).toBe(200);
    expect(releasedExecution.status).toBe('released');
    expect(releasedExecution.headSha).toBe('f'.repeat(40));
    const terminalRewrite = await callback({
      status: 'released',
      headSha: 'a'.repeat(40),
    });
    expect(terminalRewrite.response.status).toBe(409);

    const genomeResponse = await handleRequest(
      new Request('http://localhost/api/genome'),
    );
    const genomeBody = await genomeResponse.text();
    const genome = GenomeHistoryResponseSchema.parse(JSON.parse(genomeBody));
    expect(genome.evolutionCycle.genomeEvolutionCount).toBe(1);
    expect(genome.evolutionCycle.startedAt).not.toBeNull();
    expect(genome.executions).toHaveLength(1);
    expect(genome.executions[0]?.executionId).toBe(execution.executionId);
    expect(genome.page).toEqual({ limit: 10, nextCursor: null });
    expect(genomeBody).not.toContain('All checks passed.');
    expect(genomeBody).not.toContain('Implemented the approved mutation.');
    expect(genomeBody).not.toContain('@@');

    const genomeDetailResponse = await handleRequest(
      new Request(`http://localhost/api/genome/${execution.executionId}`),
    );
    const genomeDetailBody = await genomeDetailResponse.text();
    const genomeDetail = GenomeExecutionDetailResponseSchema.parse(
      JSON.parse(genomeDetailBody),
    );
    expect(genomeDetail.execution.checks[0]?.output).toBe('All checks passed.');
    expect(genomeDetailBody.length).toBeGreaterThan(genomeBody.length);

    const observationArchivesResponse = await handleRequest(
      new Request('http://localhost/api/observations/archives'),
    );
    const observationArchivesBody = await observationArchivesResponse.text();
    const observationArchives = ObservationArchivesResponseSchema.parse(
      JSON.parse(observationArchivesBody),
    );
    expect(observationArchives.archives).toHaveLength(1);
    expect(observationArchives.archives[0]?.execution.executionId).toBe(
      execution.executionId,
    );
    expect(observationArchives.archives[0]?.evidence.evidenceId).toBe(
      first.evidenceId,
    );
    expect(observationArchives.page).toEqual({ limit: 10, nextCursor: null });
    expect(observationArchivesBody).not.toContain('frictionSignals');
    expect(observationArchivesBody).not.toContain('journeys');

    const observationArchiveDetailResponse = await handleRequest(
      new Request(
        `http://localhost/api/observations/archives/${execution.executionId}`,
      ),
    );
    const observationArchiveDetailBody =
      await observationArchiveDetailResponse.text();
    const observationArchiveDetail =
      ObservationArchiveDetailResponseSchema.parse(
        JSON.parse(observationArchiveDetailBody),
      );
    expect(
      observationArchiveDetail.archive.evidence.frictionSignals,
    ).not.toHaveLength(0);
    expect(observationArchiveDetailBody.length).toBeGreaterThan(
      observationArchivesBody.length,
    );

    const invalidArchivePage = await handleRequest(
      new Request('http://localhost/api/genome?limit=1000'),
    );
    expect(invalidArchivePage.status).toBe(400);

    const nextCycleEventsResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events?limit=20',
      ),
    );
    expect(
      StudyEventsResponseSchema.parse(await nextCycleEventsResponse.json())
        .count,
    ).toBe(0);

    const rollbackResponse = await handleRequest(
      new Request(
        `http://localhost/api/repository-executions/${execution.executionId}/rollback`,
        { method: 'POST' },
      ),
      {
        GITHUB_TOKEN: 'github-test-token',
        DARWIN_CALLBACK_TOKEN: 'callback-test-token',
      },
    );
    let rollbackExecution = RepositoryMutationExecutionSchema.parse(
      await rollbackResponse.json(),
    );
    expect(rollbackResponse.status).toBe(201);
    expect(rollbackExecution.rollback).toMatchObject({
      status: 'queued',
      revertedSha: 'f'.repeat(40),
    });
    callbackNonce = latestWorkflowInputs().callback_nonce!;

    const rollbackCallback = async (body: Record<string, unknown>) => {
      const callbackBody = JSON.stringify(body);
      const response = await handleRequest(
        await signedCallbackRequest({
          path: `http://localhost/api/repository-executions/${execution.executionId}/rollback/callback`,
          method: 'POST',
          body: callbackBody,
          nonce: callbackNonce,
          executionId: execution.executionId,
          repository: execution.repository.fullName,
          manifestHash: alternativeManifest.manifestHash,
        }),
        { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
      );
      return { response, body: await response.json() };
    };
    rollbackExecution = RepositoryMutationExecutionSchema.parse(
      (await rollbackCallback({ status: 'validating' })).body,
    );
    rollbackExecution = RepositoryMutationExecutionSchema.parse(
      (
        await rollbackCallback({
          status: 'pull_request_open',
          headSha: 'a'.repeat(40),
          pullRequestNumber: 19,
          pullRequestUrl:
            'https://github.com/sjohnston1972/projectflow/pull/19',
          patch: '@@ inverse patch @@\n- mutation\n+ baseline',
          changedFiles: ['apps/projectflow/src/App.tsx'],
          checks: [
            {
              name: 'Git revert generation',
              status: 'passed',
              durationMs: null,
              output: 'Exact inverse patch generated.',
            },
          ],
        })
      ).body,
    );
    rollbackExecution = RepositoryMutationExecutionSchema.parse(
      (
        await rollbackCallback({
          status: 'preview_ready',
          previewUrl: 'https://darwin-projectflow.pages.dev/?study=true',
        })
      ).body,
    );
    expect(rollbackExecution.rollback?.status).toBe('preview_ready');

    const rollbackReleaseResponse = await handleRequest(
      new Request(
        `http://localhost/api/repository-executions/${execution.executionId}/rollback/release`,
        { method: 'POST' },
      ),
      { GITHUB_TOKEN: 'github-test-token' },
    );
    rollbackExecution = RepositoryMutationExecutionSchema.parse(
      await rollbackReleaseResponse.json(),
    );
    expect(rollbackReleaseResponse.status).toBe(200);
    expect(rollbackExecution.rollback?.status).toBe('released');
    expect(rollbackExecution.rollback?.headSha).toBe('f'.repeat(40));
  });

  it('creates and retrieves an exactly 10,000-event simulation summary', async () => {
    const createResponse = await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );
    const created = (await createResponse.json()) as {
      run: { id: string; eventCount: number };
    };

    expect(createResponse.status).toBe(201);
    expect(created.run.eventCount).toBe(10_000);

    const summaryResponse = await handleRequest(
      new Request(`http://localhost/api/simulations/${created.run.id}/summary`),
    );
    const summary = SimulationSummarySchema.parse(await summaryResponse.json());

    expect(summaryResponse.status).toBe(200);
    expect(summary.run.eventCount).toBe(10_000);
    expect(summary.metrics.sessions).toBeGreaterThan(500);
  });

  it('rejects malformed simulation input safely', async () => {
    const response = await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1.5, variant: 'unknown' }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_request',
    });
  });
});

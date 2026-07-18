import {
  CodexImplementationManifestSchema,
  DemoResetResponseSchema,
  DiagnosticsResponseSchema,
  EvidencePackSchema,
  EvidenceAnalysisSchema,
  FitnessOutcomeSchema,
  GenomeExecutionDetailResponseSchema,
  GenomeHistoryResponseSchema,
  HealthResponseSchema,
  ObservationArchiveDetailResponseSchema,
  ObservationArchivesResponseSchema,
  OperationalTelemetryMetricsSchema,
  ParticipantWorkspaceResponseSchema,
  RepositoryMutationExecutionSchema,
  RetentionDeletionResponseSchema,
  RetentionSweepResultSchema,
  SimulationSummarySchema,
  StudyEventsResponseSchema,
  StudySessionResponseSchema,
  StudyTelemetrySummarySchema,
  TargetApplicationConnectionSchema,
  TelemetryReceiptSchema,
  type StudyTelemetryEvent,
} from '@darwin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleRequest,
  handleWorkerRequest,
  resetSimulationStore,
  runRetentionMaintenance,
  type Env,
} from './index';
import {
  getTelemetryRepository,
  resetInMemoryTelemetry,
} from './persistence/telemetry-repository';
import { retentionPolicy } from './persistence/retention';
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
  appVersion: 'baseline',
  source: 'real_user',
  occurredAt: '2026-07-16T12:00:00.000Z',
  sequence: 0,
  route: '/study/dashboard',
  viewport: 'desktop',
  eventType: 'page_view',
} as const;

const candidate = (id: string, total: number, evidenceId = 'EV-001') => ({
  id,
  title: `Mutation ${id}`,
  problem: 'Assigned work takes too many interactions to reach.',
  evidenceIds: [evidenceId],
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

const modelOutputForEvidence = (evidenceId: string) => ({
  evidenceAssessment: {
    summary: 'The ordered journey shows indirect assigned-work navigation.',
    pressureClusters: [
      {
        id: 'task-discovery-pressure',
        title: 'Assigned work is buried',
        interpretation: 'The information architecture hides assigned tasks.',
        evidenceIds: [evidenceId],
        affectedTargets: ['nav-projects'],
        userConsequence: 'Users take a long route to assigned work.',
        competingExplanations: ['The participant may be unfamiliar.'],
        mutationOpportunity: 'Create a direct assigned-work destination.',
      },
    ],
    selectionRationale: 'The direct route has the clearest causal path.',
  },
  selectedMutation: candidate('direct-my-work', 90, evidenceId),
  alternatives: [
    candidate('dashboard-work-queue', 75, evidenceId),
    candidate('global-search', 70, evidenceId),
  ],
  unsupportedIdeasRejected: [
    { idea: 'Rewrite telemetry', reason: 'Telemetry is protected.' },
  ],
});

const evidenceModelOutput = modelOutputForEvidence('EV-001');

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
  application: {
    primaryUser: 'Knowledge worker',
    domainEntities: ['project', 'task'],
    primaryGoals: ['find assigned work'],
    navigation: ['Dashboard', 'Projects'],
    capabilities: ['project task search'],
    interfaceInventory: [
      {
        area: 'projects',
        purpose: 'Browse projects',
        primaryActions: ['open project'],
      },
    ],
    routes: ['/dashboard', '/projects'],
    mutableAreas: ['navigation', 'search'],
    protectedAreas: ['telemetry-history'],
  },
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

const ingestConnectedTelemetry = async (
  events: unknown[],
  environment: Partial<Env> = {},
) => {
  const secret = 'projectflow-ingestion-test-secret';
  const body = JSON.stringify({ events });
  return handleRequest(
    await signedTargetRequest('/api/telemetry/events', body, secret),
    {
      PROJECTFLOW_INGESTION_SECRET: secret,
      PROJECTFLOW_PRODUCTION_URL: 'https://darwin-projectflow.pages.dev/',
      ...environment,
    },
  );
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

const installOpenAIResponse = (output: unknown) => {
  let deploymentVerificationCalls = 0;
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('api.github.com/repos/') && url.includes('/commits/')) {
        return Response.json({ sha: repositorySha });
      }
      if (
        url.endsWith(`/${repositorySha}/darwin.target.json`) ||
        url.endsWith(`/${'f'.repeat(40)}/darwin.target.json`)
      ) {
        return new Response(JSON.stringify(repositoryTarget));
      }
      if (
        url.includes(`raw.githubusercontent.com/`) &&
        (url.includes(repositorySha) || url.includes('f'.repeat(40)))
      ) {
        return new Response(
          url.endsWith('/AGENTS.md')
            ? '# ProjectFlow repository constraints'
            : 'export function App() { return null; }',
        );
      }
      if (url.startsWith('https://darwin-projectflow.pages.dev/')) {
        if (url.includes('darwin_deployment_verify=')) {
          deploymentVerificationCalls += 1;
          const deployedSha =
            deploymentVerificationCalls === 1 ? repositorySha : 'f'.repeat(40);
          return new Response(
            `<!doctype html><html><head><meta name="darwin-app-version" content="${deployedSha.slice(0, 12)}"><meta name="darwin-commit-sha" content="${deployedSha}"><title>ProjectFlow</title></head></html>`,
            { headers: { 'Content-Type': 'text/html' } },
          );
        }
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
};

const connectTargetApplication = () =>
  handleRequest(
    new Request('http://localhost/api/target-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'sjohnston1972/projectflow',
        branch: 'main',
        productionUrl: 'https://darwin-projectflow.pages.dev/',
        studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
      }),
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
    expect(response.headers.get('X-Request-ID')).toMatch(
      /^[A-Za-z0-9._:-]{1,80}$/,
    );
    expect(body.service).toBe('darwin-api');
    expect(body).toMatchObject({
      version: '0.1.0',
      commitSha: 'local',
      buildId: 'v0.1.0@local',
    });
    expect(body.retention).toMatchObject({
      status: 'healthy',
      eventCount: 0,
      expiredRecordCount: 0,
      policy: {
        version: '1.0.0',
        maxEventsPerStudy: 50_000,
        maxEventsPerTarget: 250_000,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /participantId|sessionId|repositoryExecution|patch|eventId/,
    );

    const deployedCommit = 'a'.repeat(40);
    const deployedResponse = await handleRequest(
      new Request('http://localhost/api/health'),
      {
        DARWIN_RELEASE: '1.4.0',
        DARWIN_COMMIT_SHA: deployedCommit,
      },
    );
    await expect(deployedResponse.json()).resolves.toMatchObject({
      version: '1.4.0',
      commitSha: deployedCommit,
      buildId: 'v1.4.0@aaaaaaa',
    });

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
    const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const protectedRoutes = [
      ['GET', '/api/auth/session'],
      ['GET', '/api/operations/metrics'],
      ['GET', '/api/target-connection'],
      ['POST', '/api/target-connection'],
      ['POST', '/api/target-connection/disconnect'],
      ['POST', '/api/demo/reset'],
      ['POST', '/api/retention/sweep'],
      ['DELETE', '/api/studies/projectflow-baseline-study'],
      [
        'DELETE',
        '/api/studies/projectflow-baseline-study/participants/participant-test',
      ],
      ['DELETE', '/api/repository-executions/execution-test/artifacts'],
      ['GET', '/api/diagnostics'],
      ['GET', '/api/genome'],
      ['GET', '/api/observations/archives'],
      ['GET', '/api/studies/projectflow-baseline-study/events'],
      ['GET', '/api/studies/projectflow-baseline-study/events/raw'],
      ['POST', '/api/studies/projectflow-baseline-study/evidence'],
      ['GET', '/api/studies/projectflow-baseline-study/evidence/latest'],
      ['POST', '/api/studies/projectflow-baseline-study/analyse-evidence'],
      [
        'GET',
        '/api/studies/projectflow-baseline-study/evidence-analysis/latest',
      ],
      ['POST', '/api/evidence-analyses/analysis-test/codex-manifest'],
      ['GET', '/api/evidence-analyses/analysis-test/codex-manifest'],
      ['POST', '/api/evidence-analyses/analysis-test/codex-manifest/execution'],
      ['GET', '/api/evidence-analyses/analysis-test/codex-manifest/execution'],
      ['GET', '/api/repository-executions/execution-test'],
      ['POST', '/api/repository-executions/execution-test/rollback'],
      ['POST', '/api/repository-executions/execution-test/release'],
      ['POST', '/api/repository-executions/execution-test/rollback/release'],
      ['GET', '/api/studies/projectflow-baseline-study/sessions/session-test'],
      ['POST', '/api/simulations'],
      ['GET', '/api/simulations/sim-baseline-1859'],
      ['GET', '/api/simulations/sim-baseline-1859/summary'],
    ] as const;

    for (const [method, path] of protectedRoutes) {
      const response = await handleRequest(
        new Request(`https://darwin-api.example${path}`, { method }),
        { DARWIN_OPERATOR_TOKEN: 'operator-test-token' },
      );
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }

    const viewerEnvironment = {
      DARWIN_OPERATOR_TOKEN: 'operator-test-token',
      DARWIN_VIEWER_TOKEN: 'viewer-test-token',
    };
    const viewerHeaders = { Authorization: 'Bearer viewer-test-token' };
    const viewerSummary = await handleRequest(
      new Request(
        'https://darwin-api.example/api/studies/projectflow-baseline-study/events',
        { headers: viewerHeaders },
      ),
      viewerEnvironment,
    );
    expect(viewerSummary.status).toBe(200);
    expect(
      StudyTelemetrySummarySchema.parse(await viewerSummary.json()),
    ).toEqual({
      studyId: 'projectflow-baseline-study',
      count: 0,
      sessionCount: 0,
      participantCount: 0,
      behaviorSignalCount: 0,
    });

    const inspectorRoutes = [
      '/api/genome',
      '/api/observations/archives',
      '/api/studies/projectflow-baseline-study/events/raw',
      '/api/studies/projectflow-baseline-study/sessions/session-test',
      '/api/studies/projectflow-baseline-study/evidence/latest',
      '/api/repository-executions/execution-test',
    ];
    for (const path of inspectorRoutes) {
      const viewerDenied = await handleRequest(
        new Request(`https://darwin-api.example${path}`, {
          headers: viewerHeaders,
        }),
        viewerEnvironment,
      );
      expect(viewerDenied.status, path).toBe(403);
      expect(viewerDenied.headers.get('Cache-Control')).toBe('no-store');
    }

    const viewerAllowed = await handleRequest(
      new Request('https://darwin-api.example/api/target-connection', {
        headers: { Authorization: 'Bearer viewer-test-token' },
      }),
      {
        DARWIN_OPERATOR_TOKEN: 'operator-test-token',
        DARWIN_VIEWER_TOKEN: 'viewer-test-token',
      },
    );
    expect(viewerAllowed.status).toBe(204);

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

    const auditRecords = audit.mock.calls
      .filter(([prefix]) => prefix === '[darwin:audit]')
      .map(
        ([, record]) => JSON.parse(String(record)) as Record<string, string>,
      );
    expect(auditRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: 'anonymous',
          action: 'POST /api/demo/reset',
          target: '/api/demo/reset',
          capability: 'reset',
          outcome: 'denied',
          reason: 'unauthorized',
        }),
        expect.objectContaining({
          actor: 'viewer',
          action: 'GET /api/studies/projectflow-baseline-study/events/raw',
          capability: 'inspect_evidence',
          outcome: 'denied',
          reason: 'forbidden',
        }),
        expect.objectContaining({
          actor: 'viewer',
          action: 'GET /api/target-connection',
          capability: 'observe',
          outcome: 'authorized',
        }),
        expect.objectContaining({
          actor: 'operator',
          action: 'GET /api/auth/session',
          capability: 'observe',
          outcome: 'authorized',
        }),
      ]),
    );
    expect(JSON.stringify(auditRecords)).not.toContain('operator-test-token');
    expect(JSON.stringify(auditRecords)).not.toContain('viewer-test-token');
  });

  it('accepts only signed ProjectFlow telemetry with configured provenance', async () => {
    const secret = 'projectflow-ingestion-test-secret';
    const environment = {
      PROJECTFLOW_INGESTION_SECRET: secret,
      PROJECTFLOW_PRODUCTION_URL: 'https://darwin-projectflow.pages.dev/',
    };
    const body = JSON.stringify({ events: [studyEvent] });
    const replayTimestamp = Date.now();
    const unsigned = await handleRequest(
      new Request('https://darwin-api.example/api/telemetry/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      environment,
    );
    expect(unsigned.status).toBe(401);

    const wrongDeployment = await handleRequest(
      await signedTargetRequest('/api/telemetry/events', body, secret, {
        sourceOrigin: 'https://untrusted.example',
      }),
      environment,
    );
    expect(wrongDeployment.status).toBe(403);

    const accepted = await handleRequest(
      await signedTargetRequest('/api/telemetry/events', body, secret, {
        timestamp: String(replayTimestamp),
      }),
      environment,
    );
    expect(accepted.status).toBe(202);
    expect(TelemetryReceiptSchema.parse(await accepted.json())).toEqual({
      accepted: 1,
      rejected: 0,
      duplicates: 0,
      sequenceConflicts: 0,
    });

    const replay = await handleRequest(
      await signedTargetRequest('/api/telemetry/events', body, secret, {
        timestamp: String(replayTimestamp),
      }),
      environment,
    );
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: 'target_request_replayed',
    });

    const duplicate = await handleRequest(
      await signedTargetRequest('/api/telemetry/events', body, secret, {
        timestamp: String(replayTimestamp + 1),
      }),
      environment,
    );
    expect(duplicate.status).toBe(202);
    expect(TelemetryReceiptSchema.parse(await duplicate.json())).toEqual({
      accepted: 0,
      rejected: 0,
      duplicates: 1,
      sequenceConflicts: 0,
    });

    const unsupportedEvents = [
      { ...studyEvent, studyId: 'attacker-selected-study' },
      { ...studyEvent, eventId: crypto.randomUUID(), source: 'automated' },
      { ...studyEvent, eventId: crypto.randomUUID(), appVersion: '99.0.0' },
    ];
    for (const event of unsupportedEvents) {
      const unsupportedBody = JSON.stringify({ events: [event] });
      const unsupported = await handleRequest(
        await signedTargetRequest(
          '/api/telemetry/events',
          unsupportedBody,
          secret,
        ),
        environment,
      );
      expect(unsupported.status).toBe(403);
    }

    const metricsResponse = await handleRequest(
      new Request('http://localhost/api/operations/metrics'),
    );
    expect(
      OperationalTelemetryMetricsSchema.parse(await metricsResponse.json()),
    ).toMatchObject({
      telemetryRequests: 8,
      acceptedEvents: 1,
      duplicateEvents: 1,
      authenticationRejected: 2,
      replayRejected: 1,
      contextRejected: 3,
      rejectedEvents: 3,
    });
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
    const rotatedIdentities = [
      {
        participantId: 'participant-one',
        studyId: 'projectflow-baseline-study',
        source: 'real_user',
      },
      {
        participantId: 'participant-two',
        studyId: 'projectflow-baseline-study',
        source: 'real_user',
      },
      {
        participantId: 'participant-three',
        studyId: 'projectflow-baseline-automated-study',
        source: 'automated',
      },
    ] as const;
    for (const [index, identity] of rotatedIdentities.entries()) {
      const body = JSON.stringify({
        events: [
          {
            ...studyEvent,
            eventId: `${index + 1}9d13df2-8dce-4ad3-b20e-d8b4edc01b6${index}`,
            sessionId: `session-${index}`,
            ...identity,
          },
        ],
      });
      const response = await handleRequest(
        await signedTargetRequest('/api/telemetry/events', body, secret),
        environment,
      );
      expect(response.status).toBe(202);
    }
    expect(limit).toHaveBeenCalledTimes(3);
    expect(limit.mock.calls[0]![0]).toEqual(limit.mock.calls[1]![0]);
    expect(limit.mock.calls[1]![0]).toEqual(limit.mock.calls[2]![0]);
    expect(limit).toHaveBeenCalledWith({
      key: 'projectflow:signed-edge-client',
    });
  });

  it('enforces configured per-study and per-target telemetry quotas', async () => {
    const ingest = (event: StudyTelemetryEvent, environment: Partial<Env>) =>
      handleRequest(
        new Request('http://localhost/api/telemetry/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: [event] }),
        }),
        environment,
      );
    const studyLimitedEnvironment = {
      DARWIN_MAX_EVENTS_PER_STUDY: '1',
      DARWIN_MAX_EVENTS_PER_TARGET: '10',
    };
    expect(
      TelemetryReceiptSchema.parse(
        await (await ingest(studyEvent, studyLimitedEnvironment)).json(),
      ),
    ).toMatchObject({ accepted: 1, rejected: 0 });
    const studyRejected = TelemetryReceiptSchema.parse(
      await (
        await ingest(
          {
            ...studyEvent,
            eventId: '59d13df2-8dce-4ad3-b20e-d8b4edc01b64',
            sequence: 1,
          },
          studyLimitedEnvironment,
        )
      ).json(),
    );
    expect(studyRejected).toEqual({
      accepted: 0,
      rejected: 1,
      duplicates: 0,
      sequenceConflicts: 0,
    });

    await resetInMemoryTelemetry();
    const targetLimitedEnvironment = {
      DARWIN_MAX_EVENTS_PER_STUDY: '10',
      DARWIN_MAX_EVENTS_PER_TARGET: '1',
    };
    await ingest(studyEvent, targetLimitedEnvironment);
    const targetRejected = TelemetryReceiptSchema.parse(
      await (
        await ingest(
          {
            ...studyEvent,
            eventId: '69d13df2-8dce-4ad3-b20e-d8b4edc01b65',
            sequence: 1,
          },
          targetLimitedEnvironment,
        )
      ).json(),
    );
    expect(targetRejected.rejected).toBe(1);
    const health = HealthResponseSchema.parse(
      await (
        await handleRequest(
          new Request('http://localhost/api/health'),
          targetLimitedEnvironment,
        )
      ).json(),
    );
    expect(health.retention).toMatchObject({
      status: 'attention',
      eventCount: 1,
      largestStudyEventCount: 1,
    });
  });

  it('deletes participant, study, and execution artifacts by explicit scope', async () => {
    await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [studyEvent] }),
      }),
    );
    const participantDeletion = RetentionDeletionResponseSchema.parse(
      await (
        await handleRequest(
          new Request(
            `http://localhost/api/studies/${studyEvent.studyId}/participants/${studyEvent.participantId}`,
            { method: 'DELETE' },
          ),
        )
      ).json(),
    );
    expect(participantDeletion).toMatchObject({
      scope: 'participant',
      deleted: { telemetryEvents: 1 },
    });
    const studyDeletion = RetentionDeletionResponseSchema.parse(
      await (
        await handleRequest(
          new Request(`http://localhost/api/studies/${studyEvent.studyId}`, {
            method: 'DELETE',
          }),
        )
      ).json(),
    );
    expect(studyDeletion.scope).toBe('study');
    const executionDeletion = RetentionDeletionResponseSchema.parse(
      await (
        await handleRequest(
          new Request(
            'http://localhost/api/repository-executions/execution-test/artifacts',
            { method: 'DELETE' },
          ),
        )
      ).json(),
    );
    expect(executionDeletion.scope).toBe('execution');
  });

  it('sweeps expired telemetry idempotently and records aggregate health', async () => {
    const policy = retentionPolicy();
    await getTelemetryRepository().insertEvents(
      [studyEvent],
      '2025-01-01T00:00:00.000Z',
      policy,
    );
    const first = RetentionSweepResultSchema.parse(
      await runRetentionMaintenance({}, '2026-07-18T03:17:00.000Z'),
    );
    expect(first.deleted.telemetryEvents).toBe(1);
    const second = RetentionSweepResultSchema.parse(
      await runRetentionMaintenance({}, '2026-07-18T03:18:00.000Z'),
    );
    expect(second.deleted.telemetryEvents).toBe(0);
    const health = HealthResponseSchema.parse(
      await (
        await handleRequest(new Request('http://localhost/api/health'))
      ).json(),
    );
    expect(health.retention).toMatchObject({
      status: 'healthy',
      eventCount: 0,
      lastSweepAt: '2026-07-18T03:18:00.000Z',
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
    expect(connection.ingestion).toMatchObject({
      targetId: 'projectflow',
      studyIds: [
        'projectflow-baseline-study',
        'projectflow-baseline-automated-study',
        'projectflow-darwin-lab',
      ],
      allowedOrigins: ['https://darwin-projectflow.pages.dev'],
      signatureAlgorithm: 'hmac-sha256',
    });
    expect(JSON.stringify(connection)).not.toContain(
      'projectflow-ingestion-test-secret',
    );
    expect(connection.applicationMap).toMatchObject({
      source: {
        repositorySha,
        sourceHash: connection.repository.sourceHash,
      },
      activeGenome: { version: repositorySha.slice(0, 12) },
    });
    expect(connection.checks.map((check) => check.id)).toEqual([
      'repository',
      'contract',
      'runtime',
      'telemetry',
    ]);

    const connectedVersionBody = JSON.stringify({
      events: [
        {
          ...studyEvent,
          eventId: crypto.randomUUID(),
          appVersion: repositorySha.slice(0, 12),
        },
      ],
    });
    const connectedVersionTelemetry = await handleRequest(
      await signedTargetRequest(
        '/api/telemetry/events',
        connectedVersionBody,
        'projectflow-ingestion-test-secret',
      ),
      {
        PROJECTFLOW_INGESTION_SECRET: 'projectflow-ingestion-test-secret',
        PROJECTFLOW_PRODUCTION_URL: request.productionUrl,
      },
    );
    expect(connectedVersionTelemetry.status).toBe(202);

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
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      error: 'internal_error',
    });
    expect(errorLog).toHaveBeenCalledWith(
      '[darwin:api]',
      expect.stringContaining('unhandled_request_error'),
    );
  });

  it('propagates request IDs and retains redacted privileged audit events', async () => {
    const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});
    const requestId = 'operator-reset-test-31';
    const secret = 'operator-secret-that-must-not-be-logged';
    const resetResponse = await handleWorkerRequest(
      new Request('https://darwin-api.example/api/demo/reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'X-Request-ID': requestId,
        },
      }),
      { DARWIN_OPERATOR_TOKEN: secret },
    );

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.headers.get('X-Request-ID')).toBe(requestId);

    const diagnosticsResponse = await handleRequest(
      new Request('http://localhost/api/diagnostics?limit=10'),
    );
    const diagnostics = DiagnosticsResponseSchema.parse(
      await diagnosticsResponse.json(),
    );
    expect(diagnostics.retentionDays).toBe(30);
    expect(diagnostics.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId,
          actor: 'operator',
          action: 'demo.reset',
          target: '/api/demo/reset',
          outcome: 'success',
          beforeState: 'active_cycle',
          afterState: 'complete',
          provider: null,
        }),
      ]),
    );
    expect(diagnostics.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'd1', failureCount: 0 }),
      ]),
    );
    expect(JSON.stringify(diagnostics)).not.toContain(secret);
    expect(infoLog.mock.calls.flat().join(' ')).not.toContain(secret);
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
    expect(receipt).toEqual({
      accepted: 1,
      rejected: 1,
      duplicates: 0,
      sequenceConflicts: 0,
    });

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
      sequenceConflicts: 0,
    });

    const sequenceConflict = await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              ...studyEvent,
              eventId: '00000000-0000-4000-8000-000000000019',
            },
          ],
        }),
      }),
    );
    expect(TelemetryReceiptSchema.parse(await sequenceConflict.json())).toEqual(
      {
        accepted: 0,
        rejected: 0,
        duplicates: 0,
        sequenceConflicts: 1,
      },
    );

    const crossStudyCollision = await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              ...studyEvent,
              eventId: '00000000-0000-4000-8000-000000000020',
              studyId: 'projectflow-baseline-automated-study',
              source: 'automated',
            },
          ],
        }),
      }),
    );
    expect(
      TelemetryReceiptSchema.parse(await crossStudyCollision.json()),
    ).toEqual({
      accepted: 1,
      rejected: 0,
      duplicates: 0,
      sequenceConflicts: 0,
    });

    const eventsResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events/raw?limit=20',
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
    expect(events.cursor).not.toBeNull();
    expect(events.hasMore).toBe(false);

    const emptyDeltaResponse = await handleRequest(
      new Request(
        `http://localhost/api/studies/projectflow-baseline-study/events/raw?limit=20&cursor=${encodeURIComponent(events.cursor!)}`,
      ),
    );
    const emptyDelta = StudyEventsResponseSchema.parse(
      await emptyDeltaResponse.json(),
    );
    expect(emptyDelta.events).toEqual([]);
    expect(emptyDelta.cursor).toBe(events.cursor);
    expect(emptyDelta.count).toBe(1);

    const nextEvent = {
      ...studyEvent,
      eventId: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
      sequence: 1,
      occurredAt: '2026-07-16T12:00:01.000Z',
    };
    await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({ events: [nextEvent] }),
      }),
    );
    const deltaResponse = await handleRequest(
      new Request(
        `http://localhost/api/studies/projectflow-baseline-study/events/raw?limit=20&cursor=${encodeURIComponent(events.cursor!)}`,
      ),
    );
    const delta = StudyEventsResponseSchema.parse(await deltaResponse.json());
    expect(delta.events.map((event) => event.eventId)).toEqual([
      nextEvent.eventId,
    ]);
    expect(delta.count).toBe(2);

    const invalidCursor = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events/raw?cursor=not-a-cursor',
      ),
    );
    expect(invalidCursor.status).toBe(400);

    const summaryResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events',
      ),
    );
    const summaryPayload = await summaryResponse.json();
    expect(JSON.stringify(summaryPayload)).not.toContain('session-api-test');
    expect(JSON.stringify(summaryPayload)).not.toContain(
      'participant-api-test',
    );
    expect(StudyTelemetrySummarySchema.parse(summaryPayload)).toEqual({
      studyId: 'projectflow-baseline-study',
      count: 2,
      sessionCount: 1,
      participantCount: 1,
      behaviorSignalCount: 0,
    });

    const sessionResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/sessions/session-api-test',
      ),
    );
    const session = StudySessionResponseSchema.parse(
      await sessionResponse.json(),
    );
    expect(session.events.map((event) => event.sequence)).toEqual([0, 1]);
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
    installOpenAIResponse(evidenceModelOutput);
    expect((await connectTargetApplication()).status).toBe(201);
    const attemptId = 'attempt-api-evidence';
    const taskId = 'find-assigned-task';
    const start = {
      ...studyEvent,
      eventId: '00000000-0000-4000-8000-000000000101',
      appVersion: repositorySha.slice(0, 12),
      eventType: 'task_started',
      taskAttemptId: attemptId,
      taskId,
    };
    const completed = {
      ...studyEvent,
      eventId: '00000000-0000-4000-8000-000000000102',
      appVersion: repositorySha.slice(0, 12),
      sequence: 1,
      occurredAt: '2026-07-16T12:00:10.000Z',
      eventType: 'task_completed',
      taskAttemptId: attemptId,
      taskId,
      durationMs: 10_000,
      outcome: 'success',
    };
    await ingestConnectedTelemetry([start, completed]);

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
    expect(generated.applicationMap).toMatchObject({
      source: {
        repositorySha,
        sourceHash: generated.applicationMap.source.sourceHash,
      },
      activeGenome: { version: repositorySha.slice(0, 12) },
    });

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
    expect(
      DemoResetResponseSchema.parse(await resetResponse.json()),
    ).toMatchObject({
      status: 'complete',
      repositoryResetDispatched: false,
    });
    const resetEvidence = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence/latest?optional=true',
      ),
    );
    const resetEvents = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/events/raw?limit=20',
      ),
    );
    expect(resetEvidence.status).toBe(204);
    expect(
      StudyEventsResponseSchema.parse(await resetEvents.json()),
    ).toMatchObject({ count: 0, events: [] });
  });

  it('rejects stale and mixed application versions before evidence generation', async () => {
    installOpenAIResponse(evidenceModelOutput);
    expect((await connectTargetApplication()).status).toBe(201);
    const telemetryRequest = (events: unknown[]) =>
      ingestConnectedTelemetry(events, {
        PROJECTFLOW_ALLOWED_APP_VERSIONS: 'cccccccccccc',
      });
    const evidenceRequest = () =>
      handleRequest(
        new Request(
          'http://localhost/api/studies/projectflow-baseline-study/evidence',
          { method: 'POST' },
        ),
      );

    await telemetryRequest([
      {
        ...studyEvent,
        eventId: '00000000-0000-4000-8000-000000000181',
        appVersion: 'cccccccccccc',
      },
    ]);
    const stale = await evidenceRequest();
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: 'telemetry_version_mismatch',
      appVersion: 'cccccccccccc',
      repositorySha,
    });

    await resetInMemoryTelemetry();
    expect((await connectTargetApplication()).status).toBe(201);
    await telemetryRequest([
      {
        ...studyEvent,
        eventId: '00000000-0000-4000-8000-000000000182',
        appVersion: repositorySha.slice(0, 12),
      },
      {
        ...studyEvent,
        eventId: '00000000-0000-4000-8000-000000000183',
        sessionId: 'session-api-mixed-version',
        appVersion: 'cccccccccccc',
      },
    ]);
    const mixed = await evidenceRequest();
    expect(mixed.status).toBe(409);
    await expect(mixed.json()).resolves.toMatchObject({
      error: 'mixed_app_versions',
      appVersions: ['cccccccccccc', 'dddddddddddd'],
    });
  });

  it('preserves state through reset workflow and deployment failures, then clears only after baseline verification', async () => {
    let deployedSha = 'a'.repeat(40);
    const fetcher = vi.fn(
      async (input: string | URL | Request, _init?: RequestInit) => {
        void _init;
        const url = String(input);
        if (url.includes('/darwin-reset.yml/dispatches')) {
          return new Response(null, { status: 204 });
        }
        if (url.startsWith('https://darwin-projectflow.pages.dev/')) {
          return new Response(
            `<!doctype html><meta name="darwin-app-version" content="${deployedSha.slice(0, 12)}"><meta name="darwin-commit-sha" content="${deployedSha}">`,
          );
        }
        return new Response(null, { status: 404 });
      },
    );
    vi.stubGlobal('fetch', fetcher);
    await handleRequest(
      new Request('http://localhost/api/telemetry/events', {
        method: 'POST',
        body: JSON.stringify({ events: [studyEvent] }),
      }),
    );
    const resetEnv = {
      GITHUB_TOKEN: 'github-test-token',
      DARWIN_CALLBACK_TOKEN: 'callback-test-token',
      PROJECTFLOW_RESET_MAX_ATTEMPTS: '2',
    };
    const startReset = async () => {
      const response = await handleRequest(
        new Request('http://localhost/api/demo/reset', { method: 'POST' }),
        resetEnv,
      );
      const execution = DemoResetResponseSchema.parse(await response.json());
      const dispatch = fetcher.mock.calls
        .filter(([input]) =>
          String(input).includes('/darwin-reset.yml/dispatches'),
        )
        .at(-1);
      const inputs = JSON.parse(String(dispatch?.[1]?.body)).inputs as Record<
        string,
        string
      >;
      return { execution, nonce: inputs.callback_nonce! };
    };
    const sendResetCallback = async (
      execution: ReturnType<typeof DemoResetResponseSchema.parse>,
      nonce: string,
      callback: Record<string, unknown>,
    ) => {
      const path = `http://localhost/api/demo/reset/${execution.resetId}/callback`;
      const body = JSON.stringify(callback);
      const response = await handleRequest(
        await signedCallbackRequest({
          path,
          method: 'POST',
          body,
          nonce,
          executionId: execution.resetId,
          repository: execution.repository.fullName,
          manifestHash: execution.policyHash,
        }),
        resetEnv,
      );
      return {
        response,
        execution: DemoResetResponseSchema.parse(await response.json()),
      };
    };
    const eventCount = async () => {
      const response = await handleRequest(
        new Request(
          'http://localhost/api/studies/projectflow-baseline-study/events?limit=20',
        ),
      );
      return StudyTelemetrySummarySchema.parse(await response.json()).count;
    };

    const workflowFailure = await startReset();
    expect(workflowFailure.execution.status).toBe('queued');
    expect(await eventCount()).toBe(1);
    await sendResetCallback(workflowFailure.execution, workflowFailure.nonce, {
      status: 'running',
      workflowRunId: 901,
      workflowUrl:
        'https://github.com/sjohnston1972/projectflow/actions/runs/901',
    });
    await sendResetCallback(workflowFailure.execution, workflowFailure.nonce, {
      status: 'validating',
    });
    const failedWorkflow = await sendResetCallback(
      workflowFailure.execution,
      workflowFailure.nonce,
      { status: 'failed', error: 'Baseline validation failed.' },
    );
    expect(failedWorkflow.execution).toMatchObject({
      status: 'failed',
      error: 'Baseline validation failed.',
    });
    expect(await eventCount()).toBe(1);

    const deploymentFailure = await startReset();
    await sendResetCallback(
      deploymentFailure.execution,
      deploymentFailure.nonce,
      {
        status: 'running',
      },
    );
    await sendResetCallback(
      deploymentFailure.execution,
      deploymentFailure.nonce,
      {
        status: 'validating',
      },
    );
    const failedDeployment = await sendResetCallback(
      deploymentFailure.execution,
      deploymentFailure.nonce,
      { status: 'deploying', baselineCommit: 'b'.repeat(40) },
    );
    expect(failedDeployment.execution.status).toBe('failed');
    expect(failedDeployment.execution.deploymentVerification).toMatchObject({
      observedCommit: 'a'.repeat(40),
      attempts: 2,
    });
    expect(await eventCount()).toBe(1);

    const successfulReset = await startReset();
    await sendResetCallback(successfulReset.execution, successfulReset.nonce, {
      status: 'running',
    });
    await sendResetCallback(successfulReset.execution, successfulReset.nonce, {
      status: 'validating',
    });
    deployedSha = 'c'.repeat(40);
    const completed = await sendResetCallback(
      successfulReset.execution,
      successfulReset.nonce,
      { status: 'deploying', baselineCommit: deployedSha },
    );
    expect(completed.execution).toMatchObject({
      status: 'complete',
      baselineCommit: deployedSha,
      deploymentVerification: {
        status: 'verified',
        observedCommit: deployedSha,
        observedAppVersion: deployedSha.slice(0, 12),
      },
    });
    expect(await eventCount()).toBe(0);
    const genomeResponse = await handleRequest(
      new Request('http://localhost/api/genome'),
    );
    expect(
      GenomeHistoryResponseSchema.parse(await genomeResponse.json())
        .evolutionCycle,
    ).toMatchObject({
      genomeEvolutionCount: 0,
      measuredCommit: deployedSha,
      appVersion: deployedSha.slice(0, 12),
      deploymentVerifiedAt:
        completed.execution.deploymentVerification?.verifiedAt,
    });
  });

  it('caches evidence analysis and creates a bounded Codex manifest', async () => {
    installOpenAIResponse(evidenceModelOutput);
    expect((await connectTargetApplication()).status).toBe(201);
    const attemptId = 'attempt-analysis-test';
    const taskId = 'find-assigned-task';
    const fitnessTaskIds = [
      'find-assigned-task',
      'create-project',
      'create-assigned-task',
    ];
    const event = (
      sequence: number,
      eventType: string,
      details: Record<string, unknown> = {},
    ) => ({
      ...studyEvent,
      eventId: `00000000-0000-4000-8000-${(sequence + 201)
        .toString()
        .padStart(12, '0')}`,
      appVersion: repositorySha.slice(0, 12),
      occurredAt: `2026-07-16T12:01:${sequence
        .toString()
        .padStart(2, '0')}.000Z`,
      sequence,
      eventType,
      ...details,
    });
    const baselineJourney = [
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
    const events = [0, 1, 2].flatMap((cohortIndex) =>
      baselineJourney.map((journeyEvent, index) => ({
        ...journeyEvent,
        eventId: `00000000-0000-4000-8000-${(401 + cohortIndex * 20 + index)
          .toString()
          .padStart(12, '0')}`,
        sessionId: `session-analysis-${cohortIndex}`,
        participantId: `participant-analysis-${cohortIndex}`,
        ...('taskAttemptId' in journeyEvent
          ? { taskAttemptId: `${attemptId}-${cohortIndex}` }
          : {}),
        ...('taskId' in journeyEvent
          ? { taskId: fitnessTaskIds[cohortIndex] }
          : {}),
      })),
    );
    await ingestConnectedTelemetry(events);
    const evidenceResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence',
        { method: 'POST' },
      ),
    );
    const evidence = EvidencePackSchema.parse(await evidenceResponse.json());
    const signalId = evidence.frictionSignals[0]!.evidenceId;

    const analysisPath =
      'http://localhost/api/studies/projectflow-baseline-study/analyse-evidence';
    installOpenAIResponse(modelOutputForEvidence(signalId));
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
    expect(first.selectedMutation.evidenceIds).toContain(signalId);

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
      new Request(manifestAccessPath, {
        headers: { Authorization: 'Bearer operator-test-token' },
      }),
      {
        DARWIN_CALLBACK_TOKEN: 'callback-test-token',
        DARWIN_OPERATOR_TOKEN: 'operator-test-token',
      },
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
    const replayTimestamp = Date.now();
    const runningRequests = await Promise.all([
      callbackRequest(runningCallbackBody, String(replayTimestamp)),
      callbackRequest(runningCallbackBody, String(replayTimestamp + 1)),
    ]);
    const runningResponses = await Promise.all(
      runningRequests.map((runningRequest) =>
        handleRequest(runningRequest, {
          DARWIN_CALLBACK_TOKEN: 'callback-test-token',
        }),
      ),
    );
    expect(runningResponses.map(({ status }) => status).sort()).toEqual([
      200, 409,
    ]);
    const acceptedRunningResponse = runningResponses.find(
      ({ status }) => status === 200,
    )!;
    const conflictedRunningResponse = runningResponses.find(
      ({ status }) => status === 409,
    )!;
    execution = RepositoryMutationExecutionSchema.parse(
      await acceptedRunningResponse.json(),
    );
    await expect(conflictedRunningResponse.json()).resolves.toMatchObject({
      error: 'concurrent_update',
      execution: { status: 'codex_running' },
    });
    const replayedRunningResponse = await handleRequest(
      await callbackRequest(runningCallbackBody, String(replayTimestamp)),
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

    const releaseUrl = `http://localhost/api/repository-executions/${execution.executionId}/release`;
    const mergeCallsBeforeRelease = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).endsWith('/merge')).length;
    const releaseResponses = await Promise.all(
      [0, 1].map(() =>
        handleRequest(new Request(releaseUrl, { method: 'POST' }), {
          GITHUB_TOKEN: 'github-test-token',
          PROJECTFLOW_DEPLOYMENT_TIMEOUT_MS: '500',
          PROJECTFLOW_DEPLOYMENT_POLL_MS: '0',
        }),
      ),
    );
    expect(releaseResponses.map(({ status }) => status).sort()).toEqual([
      200, 202,
    ]);
    const releaseResponse = releaseResponses.find(
      ({ status }) => status === 200,
    )!;
    const releasedExecution = RepositoryMutationExecutionSchema.parse(
      await releaseResponse.json(),
    );
    expect(releaseResponse.status).toBe(200);
    expect(releasedExecution.status).toBe('released');
    expect(releasedExecution.headSha).toBe('f'.repeat(40));
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).endsWith('/merge'))
        .length,
    ).toBe(mergeCallsBeforeRelease + 1);
    const repeatedReleaseResponse = await handleRequest(
      new Request(releaseUrl, { method: 'POST' }),
      { GITHUB_TOKEN: 'github-test-token' },
    );
    expect(repeatedReleaseResponse.status).toBe(200);
    expect(
      RepositoryMutationExecutionSchema.parse(
        await repeatedReleaseResponse.json(),
      ).status,
    ).toBe('released');
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).endsWith('/merge'))
        .length,
    ).toBe(mergeCallsBeforeRelease + 1);
    expect(releasedExecution.deploymentVerification).toMatchObject({
      status: 'verified',
      expectedCommit: 'f'.repeat(40),
      observedCommit: 'f'.repeat(40),
      expectedAppVersion: 'f'.repeat(12),
      observedAppVersion: 'f'.repeat(12),
      attempts: 2,
    });
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
    expect(genome.evolutionCycle.startedAt).toBe(
      releasedExecution.deploymentVerification?.verifiedAt,
    );
    expect(genome.evolutionCycle).toMatchObject({
      measuredCommit: 'f'.repeat(40),
      appVersion: 'f'.repeat(12),
      deploymentVerifiedAt:
        releasedExecution.deploymentVerification?.verifiedAt,
    });
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
        'http://localhost/api/studies/projectflow-baseline-study/events/raw?limit=20',
      ),
    );
    expect(
      StudyEventsResponseSchema.parse(await nextCycleEventsResponse.json())
        .count,
    ).toBe(0);

    const evolvedEvents = [0, 1, 2].flatMap((cohortIndex) => {
      const evolvedAttemptId = `attempt-evolved-${cohortIndex}`;
      const evolvedTaskId = fitnessTaskIds[cohortIndex]!;
      const evolvedBase = {
        ...studyEvent,
        sessionId: `session-evolved-${cohortIndex}`,
        participantId: `participant-evolved-${cohortIndex}`,
        appVersion: 'f'.repeat(12),
      };
      return [
        {
          ...evolvedBase,
          eventId: `00000000-0000-4000-8000-${(601 + cohortIndex * 10)
            .toString()
            .padStart(12, '0')}`,
          sequence: 0,
          occurredAt: `2026-07-18T12:0${cohortIndex}:00.000Z`,
          eventType: 'task_started',
          taskAttemptId: evolvedAttemptId,
          taskId: evolvedTaskId,
        },
        {
          ...evolvedBase,
          eventId: `00000000-0000-4000-8000-${(602 + cohortIndex * 10)
            .toString()
            .padStart(12, '0')}`,
          sequence: 1,
          occurredAt: `2026-07-18T12:0${cohortIndex}:02.000Z`,
          eventType: 'element_clicked',
          targetId: 'nav-tasks',
          taskAttemptId: evolvedAttemptId,
          taskId: evolvedTaskId,
        },
        {
          ...evolvedBase,
          eventId: `00000000-0000-4000-8000-${(603 + cohortIndex * 10)
            .toString()
            .padStart(12, '0')}`,
          sequence: 2,
          occurredAt: `2026-07-18T12:0${cohortIndex}:04.000Z`,
          eventType: 'element_clicked',
          targetId: 'task-open-apl-241',
          taskAttemptId: evolvedAttemptId,
          taskId: evolvedTaskId,
        },
        {
          ...evolvedBase,
          eventId: `00000000-0000-4000-8000-${(604 + cohortIndex * 10)
            .toString()
            .padStart(12, '0')}`,
          sequence: 3,
          occurredAt: `2026-07-18T12:0${cohortIndex}:06.000Z`,
          eventType: 'task_completed',
          taskAttemptId: evolvedAttemptId,
          taskId: evolvedTaskId,
          durationMs: 6_000,
          outcome: 'success',
        },
      ];
    });
    const evolvedIngestResponse = await ingestConnectedTelemetry(evolvedEvents);
    expect(evolvedIngestResponse.status).toBe(202);
    const evolvedEvidenceResponse = await handleRequest(
      new Request(
        'http://localhost/api/studies/projectflow-baseline-study/evidence',
        { method: 'POST' },
      ),
    );
    expect(evolvedEvidenceResponse.status).toBe(201);
    const evolvedEvidence = EvidencePackSchema.parse(
      await evolvedEvidenceResponse.json(),
    );
    expect(evolvedEvidence.study).toMatchObject({
      appVersion: 'f'.repeat(12),
      measuredCommit: 'f'.repeat(40),
      sessions: 3,
      participants: 3,
      attempts: 3,
    });
    const fitnessResponse = await handleRequest(
      new Request(
        `http://localhost/api/repository-executions/${execution.executionId}/fitness`,
        { method: 'POST' },
      ),
    );
    const fitness = FitnessOutcomeSchema.parse(await fitnessResponse.json());
    expect(fitnessResponse.status).toBe(201);
    expect(fitness).toMatchObject({
      executionId: execution.executionId,
      status: 'measured',
      formulaVersion: '1.0.0',
      baseline: { evidenceHash: first.evidenceHash },
      evolved: { evidenceHash: evolvedEvidence.evidenceHash },
    });
    expect(fitness.delta).toBeGreaterThan(0);
    const genomeWithFitnessResponse = await handleRequest(
      new Request('http://localhost/api/genome'),
    );
    expect(
      GenomeHistoryResponseSchema.parse(await genomeWithFitnessResponse.json())
        .fitnessOutcomes[0],
    ).toEqual(fitness);

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

    const rollbackCallback = async (
      body: Record<string, unknown>,
      timestamp?: string,
    ) => {
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
          ...(timestamp ? { timestamp } : {}),
        }),
        { DARWIN_CALLBACK_TOKEN: 'callback-test-token' },
      );
      return { response, body: await response.json() };
    };
    const rollbackCallbackTimestamp = Date.now();
    const rollbackValidatingResponses = await Promise.all([
      rollbackCallback(
        { status: 'validating' },
        String(rollbackCallbackTimestamp),
      ),
      rollbackCallback(
        { status: 'validating' },
        String(rollbackCallbackTimestamp + 1),
      ),
    ]);
    expect(
      rollbackValidatingResponses.map(({ response }) => response.status).sort(),
    ).toEqual([200, 409]);
    rollbackExecution = RepositoryMutationExecutionSchema.parse(
      rollbackValidatingResponses.find(
        ({ response }) => response.status === 200,
      )!.body,
    );
    expect(
      rollbackValidatingResponses.find(
        ({ response }) => response.status === 409,
      )!.body,
    ).toMatchObject({
      error: 'concurrent_update',
      execution: { rollback: { status: 'validating' } },
    });
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

    const rollbackReleaseUrl = `http://localhost/api/repository-executions/${execution.executionId}/rollback/release`;
    const mergeCallsBeforeRollback = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).endsWith('/merge')).length;
    const rollbackReleaseResponses = await Promise.all(
      [0, 1].map(() =>
        handleRequest(new Request(rollbackReleaseUrl, { method: 'POST' }), {
          GITHUB_TOKEN: 'github-test-token',
        }),
      ),
    );
    expect(rollbackReleaseResponses.map(({ status }) => status).sort()).toEqual(
      [200, 202],
    );
    const rollbackReleaseResponse = rollbackReleaseResponses.find(
      ({ status }) => status === 200,
    )!;
    rollbackExecution = RepositoryMutationExecutionSchema.parse(
      await rollbackReleaseResponse.json(),
    );
    expect(rollbackReleaseResponse.status).toBe(200);
    expect(rollbackExecution.rollback?.status).toBe('released');
    expect(rollbackExecution.rollback?.headSha).toBe('f'.repeat(40));
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).endsWith('/merge'))
        .length,
    ).toBe(mergeCallsBeforeRollback + 1);
    const repeatedRollbackReleaseResponse = await handleRequest(
      new Request(rollbackReleaseUrl, { method: 'POST' }),
      { GITHUB_TOKEN: 'github-test-token' },
    );
    expect(repeatedRollbackReleaseResponse.status).toBe(200);
    expect(
      RepositoryMutationExecutionSchema.parse(
        await repeatedRollbackReleaseResponse.json(),
      ).rollback?.status,
    ).toBe('released');
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).endsWith('/merge'))
        .length,
    ).toBe(mergeCallsBeforeRollback + 1);
    const stoppedFitnessResponse = await handleRequest(
      new Request(
        `http://localhost/api/repository-executions/${execution.executionId}/fitness`,
      ),
    );
    expect(
      FitnessOutcomeSchema.parse(await stoppedFitnessResponse.json()),
    ).toMatchObject({
      status: 'rolled_back',
      baselineScore: null,
      evolvedScore: null,
      delta: null,
    });
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
    expect(created).not.toHaveProperty('events');
    expect(JSON.stringify(created).length).toBeLessThan(100_000);

    const summaryResponse = await handleRequest(
      new Request(`http://localhost/api/simulations/${created.run.id}/summary`),
    );
    const summary = SimulationSummarySchema.parse(await summaryResponse.json());

    expect(summaryResponse.status).toBe(200);
    expect(summary.run.eventCount).toBe(10_000);
    expect(summary.metrics.sessions).toBeGreaterThan(500);
  });

  it('rate limits simulations on the authenticated operator identity', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const response = await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
      { SIMULATION_RATE_LIMITER: { limit } },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(limit).toHaveBeenCalledWith({ key: 'local-development' });
  });

  it('rejects unconfigured simulation seeds and evolved variants', async () => {
    for (const input of [
      { seed: 2026, variant: 'baseline' },
      { seed: 1859, variant: 'evolved' },
    ]) {
      const response = await handleRequest(
        new Request('http://localhost/api/simulations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: 'simulation_not_allowed',
      });
    }
  });

  it('admits only one simulation request at a time', async () => {
    let releaseBody: ((value: string) => void) | undefined;
    const firstRequest = new Request('http://localhost/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
    });
    vi.spyOn(firstRequest, 'text').mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseBody = resolve;
        }),
    );
    const firstResponsePromise = handleRequest(firstRequest);
    await vi.waitFor(() => expect(releaseBody).toBeTypeOf('function'));

    const busyResponse = await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );
    expect(busyResponse.status).toBe(503);
    expect(busyResponse.headers.get('Retry-After')).toBe('5');
    await expect(busyResponse.json()).resolves.toMatchObject({
      error: 'simulation_busy',
    });

    releaseBody!(JSON.stringify({ seed: 1859, variant: 'baseline' }));
    expect((await firstResponsePromise).status).toBe(201);
  });

  it('rejects oversized simulation requests before parsing', async () => {
    const response = await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '5000',
        },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: 'payload_too_large',
    });
  });

  it('expires simulation metadata and evicts the least-recently-used run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T09:00:00.000Z'));
    const runIds: string[] = [];
    for (const seed of [1859, 1860, 1861, 1862, 1863]) {
      const response = await handleRequest(
        new Request('http://localhost/api/simulations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed, variant: 'baseline' }),
        }),
        { DARWIN_DEMO_SEED: String(seed) },
      );
      const payload = (await response.json()) as { run: { id: string } };
      runIds.push(payload.run.id);
    }

    expect(
      (
        await handleRequest(
          new Request(`http://localhost/api/simulations/${runIds[0]}`),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handleRequest(
          new Request(`http://localhost/api/simulations/${runIds[4]}`),
        )
      ).status,
    ).toBe(200);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1_000 + 1);
    expect(
      (
        await handleRequest(
          new Request(`http://localhost/api/simulations/${runIds[4]}`),
        )
      ).status,
    ).toBe(404);
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

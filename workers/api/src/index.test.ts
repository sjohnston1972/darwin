import {
  CodexImplementationManifestSchema,
  DemoResetResponseSchema,
  EvidencePackSchema,
  EvidenceAnalysisSchema,
  EvolutionAnalysisResponseSchema,
  EvolutionTimelineResponseSchema,
  HealthResponseSchema,
  MutationDiffSchema,
  MutationDecisionResponseSchema,
  MutationReleaseResponseSchema,
  MutationValidationResponseSchema,
  OrganismStateSchema,
  OutcomeValidationSchema,
  ParticipantWorkspaceResponseSchema,
  SimulationSummarySchema,
  StudyEventsResponseSchema,
  StudySessionResponseSchema,
  TelemetryReceiptSchema,
} from '@darwin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleRequest,
  handleWorkerRequest,
  resetSimulationStore,
} from './index';
import { resetInMemoryTelemetry } from './persistence/telemetry-repository';

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

const liveProposal = {
  id: 'mutation-global-task-discovery-v1',
  name: 'Promote global task discovery',
  observation: 'Assigned tasks are difficult to locate.',
  evidence: ['Measured navigation paths are longer than necessary.'],
  hypothesis: 'A direct assigned-work route will reduce path length.',
  implementationSummary: 'Promote My Work and global search.',
  predictedFitnessGain: 20.8,
  confidence: 0.86,
  risk: 'low',
  affectedFiles: ['apps/projectflow/src/App.tsx'],
  status: 'proposed',
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

const installOpenAIResponse = (output: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_test_live',
          output_text: JSON.stringify(output),
        }),
        { status: 200 },
      ),
    ),
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
    expect(body.version).toBe('0.20.4');

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
      new Request('http://localhost/api/health', {
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

  it('serves clearly labelled recorded automation before a live outcome run', async () => {
    const response = await handleRequest(
      new Request('http://localhost/api/outcomes/automated-comparison'),
    );
    const outcome = OutcomeValidationSchema.parse(await response.json());

    expect(outcome.provenance).toBe('recorded_automated_run');
    expect(outcome.evidenceClass).toBe('automated');
    expect(outcome.delta.interactions).toBeLessThan(0);
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

    await handleRequest(
      new Request('http://localhost/api/demo/reset', { method: 'POST' }),
    );
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
    const resetOutcome = await handleRequest(
      new Request('http://localhost/api/outcomes/automated-comparison'),
    );

    expect(resetEvidence.status).toBe(204);
    expect(resetOutcome.status).toBe(204);
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
      { DARWIN_REPOSITORY_COMMIT: 'c75e37d' },
    );
    const manifest = CodexImplementationManifestSchema.parse(
      await manifestResponse.json(),
    );
    expect(manifest.repositoryCommit).toBe('c75e37d');
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
      { DARWIN_REPOSITORY_COMMIT: 'c75e37d' },
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

  it('refuses to invent a simulation proposal when GPT is unavailable', async () => {
    await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );
    const response = await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'analysis_failed',
    });
  });

  it('returns a schema-valid live analysis when GPT-5.6 mode succeeds', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );
    installOpenAIResponse(liveProposal);

    const response = await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
      liveEnv,
    );
    const analysis = EvolutionAnalysisResponseSchema.parse(
      await response.json(),
    );

    expect(analysis).toMatchObject({
      mode: 'live',
      model: 'gpt-5.6',
      proposal: { status: 'proposed' },
    });
    expect(JSON.stringify(analysis)).not.toContain('sk-test-secret');
  });

  it('approves, validates, releases, persists the timeline, and resets', async () => {
    await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );
    installOpenAIResponse(liveProposal);
    await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
      liveEnv,
    );

    const approvalResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/approve',
        { method: 'POST' },
      ),
    );
    const approval = MutationDecisionResponseSchema.parse(
      await approvalResponse.json(),
    );

    expect(approval.proposal.status).toBe('approved');
    expect(approval.organism).toMatchObject({
      variant: 'baseline',
      genomeVersion: 'v1.0',
      evolutionCycles: 0,
    });

    const repeatedResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/reject',
        { method: 'POST' },
      ),
    );
    expect(repeatedResponse.status).toBe(409);

    const diffResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/diff',
      ),
    );
    const diff = MutationDiffSchema.parse(await diffResponse.json());
    expect(diff.source).toBe('repository_source_comparison');
    expect(diff.patch).toContain("initialRoute: 'my-work'");

    const earlyReleaseResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/release',
        { method: 'POST' },
      ),
    );
    expect(earlyReleaseResponse.status).toBe(409);

    const validationResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/validate',
        { method: 'POST' },
      ),
    );
    const validation = MutationValidationResponseSchema.parse(
      await validationResponse.json(),
    );
    expect(validation.proposal.status).toBe('validated');
    expect(validation.validation).toMatchObject({
      status: 'passed',
      source: 'recorded_repository_run',
    });
    expect(validation.validation.checks).toHaveLength(3);

    const releaseResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/release',
        { method: 'POST' },
      ),
    );
    const release = MutationReleaseResponseSchema.parse(
      await releaseResponse.json(),
    );
    expect(release.proposal.status).toBe('released');
    expect(release.organism).toMatchObject({
      variant: 'evolved',
      genomeVersion: 'v1.1',
      evolutionCycles: 1,
    });
    expect(release.record).toMatchObject({
      version: 'v1.1',
      outcome: 'survived',
    });

    const stateResponse = await handleRequest(
      new Request('http://localhost/api/organism/state'),
    );
    expect(OrganismStateSchema.parse(await stateResponse.json()).variant).toBe(
      'evolved',
    );

    const timelineResponse = await handleRequest(
      new Request('http://localhost/api/evolution/timeline'),
    );
    const timeline = EvolutionTimelineResponseSchema.parse(
      await timelineResponse.json(),
    );
    expect(timeline.records.map((record) => record.outcome)).toEqual([
      'baseline',
      'survived',
    ]);

    const reloadedTimelineResponse = await handleRequest(
      new Request('http://localhost/api/evolution/timeline'),
    );
    expect(await reloadedTimelineResponse.json()).toEqual(timeline);

    const resetResponse = await handleRequest(
      new Request('http://localhost/api/demo/reset', { method: 'POST' }),
    );
    const reset = DemoResetResponseSchema.parse(await resetResponse.json());
    expect(reset.organism).toMatchObject({
      variant: 'baseline',
      genomeVersion: 'v1.0',
      evolutionCycles: 0,
    });

    const resetTimelineResponse = await handleRequest(
      new Request('http://localhost/api/evolution/timeline'),
    );
    expect(await resetTimelineResponse.json()).toEqual({ records: [] });

    const missingProposalResponse = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/approve',
        { method: 'POST' },
      ),
    );
    expect(missingProposalResponse.status).toBe(404);
  });

  it('keeps the baseline active when a mutation fails selection', async () => {
    await handleRequest(
      new Request('http://localhost/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
      }),
    );
    installOpenAIResponse(liveProposal);
    await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
      liveEnv,
    );

    const response = await handleRequest(
      new Request(
        'http://localhost/api/mutations/mutation-global-task-discovery-v1/reject',
        { method: 'POST' },
      ),
    );
    const decision = MutationDecisionResponseSchema.parse(
      await response.json(),
    );

    expect(decision.proposal.status).toBe('rejected');
    expect(decision.organism.variant).toBe('baseline');
    expect(decision.organism.evolutionCycles).toBe(0);

    const timelineResponse = await handleRequest(
      new Request('http://localhost/api/evolution/timeline'),
    );
    const timeline = EvolutionTimelineResponseSchema.parse(
      await timelineResponse.json(),
    );
    expect(timeline.records.at(-1)?.outcome).toBe('failed_selection');
  });
});

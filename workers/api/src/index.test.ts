import {
  DemoResetResponseSchema,
  EvolutionAnalysisResponseSchema,
  EvolutionTimelineResponseSchema,
  HealthResponseSchema,
  MutationDiffSchema,
  MutationDecisionResponseSchema,
  MutationReleaseResponseSchema,
  MutationValidationResponseSchema,
  OrganismStateSchema,
  ParticipantWorkspaceResponseSchema,
  SimulationSummarySchema,
  StudyEventsResponseSchema,
  StudySessionResponseSchema,
  TelemetryReceiptSchema,
} from '@darwin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleRequest, resetSimulationStore } from './index';
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

  it('analyses a simulation into fitness, ranked findings, and one proposal', async () => {
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
    const analysis = EvolutionAnalysisResponseSchema.parse(
      await response.json(),
    );

    expect(response.status).toBe(200);
    expect(analysis.fitness.baseline.score).toBeLessThan(
      analysis.fitness.evolved.score,
    );
    expect(analysis).toMatchObject({
      mode: 'mock',
      model: 'deterministic-mock',
    });
    expect(analysis.findings[0]?.id).toBe('finding-task-discovery');
    expect(analysis.proposal.id).toBe('mutation-global-task-discovery-v1');
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
    const mockResponse = await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
    );
    const mockAnalysis = EvolutionAnalysisResponseSchema.parse(
      await mockResponse.json(),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'resp_api_live',
            output_text: JSON.stringify(mockAnalysis.proposal),
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
      {
        DARWIN_AI_MODE: 'live',
        OPENAI_API_KEY: 'sk-test-secret',
        OPENAI_MODEL: 'gpt-5.6',
      },
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
    await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
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
    await handleRequest(
      new Request('http://localhost/api/evolution/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationId: 'sim-baseline-1859' }),
      }),
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

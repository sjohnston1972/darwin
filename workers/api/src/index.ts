import {
  CodexImplementationManifestSchema,
  DemoResetResponseSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  EvolutionTimelineResponseSchema,
  EvolutionAnalysisRequestSchema,
  EvolutionAnalysisResponseSchema,
  FitnessComparisonSchema,
  MutationDiffSchema,
  MutationDecisionResponseSchema,
  MutationReleaseResponseSchema,
  MutationValidationResponseSchema,
  OrganismStateSchema,
  OutcomeValidationSchema,
  ParticipantWorkspaceResponseSchema,
  ProjectFlowWorkspaceSchema,
  SimulationRequestSchema,
  StudyEventsResponseSchema,
  StudySessionResponseSchema,
  StudyTelemetryEventSchema,
  TelemetryReceiptSchema,
  ValidationResultSchema,
  type EvolutionRecord,
  type FitnessComparison,
  type HealthResponse,
  type MutationProposal,
  type OrganismState,
  type SimulationResult,
} from '@darwin/shared';

import phase7Artifacts from './fixtures/phase7-artifacts.json';
import phase12Outcome from './fixtures/phase12-outcome.json';
import { simulate } from './simulation';
import {
  EvolutionAnalysisError,
  compareFitness,
  executeEvolutionAnalysis,
  rankFrictionFindings,
} from './evolution';
import {
  getTelemetryRepository,
  type PersistedDemoState,
} from './persistence/telemetry-repository';
import { buildEvidencePack } from './evidence';
import {
  EvidenceReasoningError,
  analyseEvidence,
  analysisCacheKey,
  buildCodexManifest,
} from './reasoning';
import { OutcomeValidationError, compareAutomatedOutcomes } from './outcomes';

export interface Env {
  DB?: D1Database;
  INGESTION_RATE_LIMITER?: RateLimit;
  ALLOWED_ORIGINS: string;
  DARWIN_AI_MODE: string;
  DARWIN_DEMO_SEED: string;
  DARWIN_EVENT_COUNT: string;
  OPENAI_API_KEY?: string;
  OPENAI_API?: string;
  OPENAI_MODEL: string;
  OPENAI_TIMEOUT_MS: string;
  DARWIN_REPOSITORY_COMMIT: string;
}

const defaultCorsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
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
  Object.entries(corsHeaders).forEach(([name, value]) =>
    headers.set(name, value),
  );

  return new Response(JSON.stringify(body), { ...init, headers });
};

const simulationStore = new Map<string, SimulationResult>();
const mutationStore = new Map<string, MutationProposal>();
const validationStore = new Map<string, unknown>();
const fitnessStore = new Map<string, FitnessComparison>();
let timelineStore: EvolutionRecord[] = [];
const recordedValidation = ValidationResultSchema.parse(
  phase7Artifacts.validation,
);
const recordedDiff = MutationDiffSchema.parse(phase7Artifacts.diff);
const recordedOutcome = OutcomeValidationSchema.parse(phase12Outcome);

const initialOrganismState = (): OrganismState => ({
  variant: 'baseline',
  genomeVersion: 'v1.0',
  evolutionCycles: 0,
  activeMutationId: null,
  updatedAt: new Date().toISOString(),
});

let organismState = initialOrganismState();
let recordedOutcomeVisible = true;

const demoState = (): PersistedDemoState => ({
  organism: organismState,
  timeline: timelineStore,
  mutations: [...mutationStore.entries()],
  validations: [...validationStore.entries()],
  fitness: [...fitnessStore.entries()],
  recordedOutcomeVisible,
});

const restoreDemoState = (state: PersistedDemoState) => {
  organismState = OrganismStateSchema.parse(state.organism);
  timelineStore = EvolutionTimelineResponseSchema.parse({
    records: state.timeline,
  }).records;
  mutationStore.clear();
  state.mutations.forEach(([id, proposal]) => mutationStore.set(id, proposal));
  validationStore.clear();
  state.validations.forEach(([id, validation]) =>
    validationStore.set(id, validation),
  );
  fitnessStore.clear();
  state.fitness.forEach(([id, fitness]) => fitnessStore.set(id, fitness));
  recordedOutcomeVisible = state.recordedOutcomeVisible ?? true;
};

const simulationFromId = (id: string) => {
  const match = id.match(/^sim-(baseline|evolved)-(-?\d+)$/);
  if (!match) return null;
  return simulate({
    variant: match[1] as 'baseline' | 'evolved',
    seed: Number(match[2]),
  });
};

export const resetSimulationStore = (showRecordedOutcome = true) => {
  simulationStore.clear();
  mutationStore.clear();
  validationStore.clear();
  fitnessStore.clear();
  timelineStore = [];
  organismState = initialOrganismState();
  recordedOutcomeVisible = showRecordedOutcome;
};

export const handleRequest = async (
  request: Request,
  env?: Partial<Env>,
): Promise<Response> => {
  const url = new URL(request.url);
  const { pathname } = url;
  const telemetryRepository = getTelemetryRepository(env?.DB);
  if (env?.DB) {
    const persisted = await telemetryRepository.getDemoState();
    if (persisted) restoreDemoState(persisted);
  }
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

  if (request.method === 'GET' && pathname === '/api/health') {
    const response: HealthResponse = {
      status: 'ok',
      service: 'darwin-api',
      version: '0.19.0',
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

  if (request.method === 'POST' && pathname === '/api/demo/reset') {
    resetSimulationStore(false);
    await telemetryRepository.reset();
    await telemetryRepository.saveDemoState(demoState());
    return json(
      DemoResetResponseSchema.parse({
        status: 'reset',
        organism: organismState,
      }),
    );
  }

  if (request.method === 'GET' && pathname === '/api/organism/state') {
    return json(OrganismStateSchema.parse(organismState));
  }

  if (request.method === 'GET' && pathname === '/api/evolution/timeline') {
    return json(
      EvolutionTimelineResponseSchema.parse({ records: timelineStore }),
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
    try {
      const body = await request.text();
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
    const events = candidates.flatMap((candidate) => {
      const parsed = StudyTelemetryEventSchema.safeParse(candidate);
      if (!parsed.success || parsed.data.source === 'synthetic') return [];
      return [parsed.data];
    });
    if (env?.INGESTION_RATE_LIMITER) {
      const actors = new Set(
        events.map((event) => `${event.studyId}:${event.participantId}`),
      );
      for (const key of actors) {
        const outcome = await env.INGESTION_RATE_LIMITER.limit({ key });
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
    const events = await telemetryRepository.listEvents(studyId, limit);
    const count = await telemetryRepository.countEvents(studyId);
    return json(
      StudyEventsResponseSchema.parse({
        studyId,
        events,
        count,
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
      await telemetryRepository.listEvents(studyId, 10_000)
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
    const pack = await buildEvidencePack(studyId, events);
    await telemetryRepository.saveEvidence(pack);
    return json(EvidencePackSchema.parse(pack), { status: 201 });
  }

  if (pathname === '/api/outcomes/automated-comparison') {
    if (request.method === 'GET') {
      const validation = await telemetryRepository.getLatestOutcomeValidation();
      const outcome =
        validation ?? (recordedOutcomeVisible ? recordedOutcome : null);
      if (!outcome) {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      return json(OutcomeValidationSchema.parse(outcome));
    }
    if (request.method === 'POST') {
      const baseline = await telemetryRepository.getLatestEvidence(
        'projectflow-baseline-automated-study',
      );
      const evolved = await telemetryRepository.getLatestEvidence(
        'projectflow-evolved-automated-study',
      );
      if (!baseline || !evolved) {
        return json(
          {
            error: 'insufficient_evidence',
            message: 'Both automated cohort evidence packs are required.',
          },
          { status: 409 },
        );
      }
      try {
        const validation = compareAutomatedOutcomes(baseline, evolved);
        await telemetryRepository.saveOutcomeValidation(validation);
        return json(OutcomeValidationSchema.parse(validation), { status: 201 });
      } catch (error) {
        if (error instanceof OutcomeValidationError) {
          return json(
            { error: 'validation_failed', message: error.message },
            { status: 422 },
          );
        }
        throw error;
      }
    }
  }

  const latestEvidenceMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/evidence\/latest$/,
  );
  if (request.method === 'GET' && latestEvidenceMatch) {
    const studyId = decodeURIComponent(latestEvidenceMatch[1]!);
    const pack = await telemetryRepository.getLatestEvidence(studyId);
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
    const pack = await telemetryRepository.getLatestEvidence(studyId);
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
    const cacheKey = await analysisCacheKey(pack.evidenceHash, model);
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
          ? Math.min(60_000, Math.max(1_000, configuredTimeout))
          : 12_000,
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
    const analysis =
      await telemetryRepository.getLatestEvidenceAnalysis(studyId);
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
      if (existing)
        return json(CodexImplementationManifestSchema.parse(existing));
      const analysis =
        await telemetryRepository.getEvidenceAnalysis(analysisId);
      if (!analysis) {
        return json(
          { error: 'not_found', message: 'Evidence analysis was not found.' },
          { status: 404 },
        );
      }
      const manifest = await buildCodexManifest(
        analysis,
        env?.DARWIN_REPOSITORY_COMMIT || 'working-tree',
      );
      await telemetryRepository.saveCodexManifest(manifest);
      return json(CodexImplementationManifestSchema.parse(manifest), {
        status: 201,
      });
    }
  }

  const studySessionMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/sessions\/([^/]+)$/,
  );
  if (request.method === 'GET' && studySessionMatch) {
    const studyId = decodeURIComponent(studySessionMatch[1]!);
    const sessionId = decodeURIComponent(studySessionMatch[2]!);
    const events = await telemetryRepository.listSession(studyId, sessionId);
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
        input = await request.json();
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

    const configuredEventCount = Number(env?.DARWIN_EVENT_COUNT ?? 10_000);
    const eventCount =
      configuredEventCount === 10_000 ? configuredEventCount : 10_000;
    const result = simulate({ ...parsed.data, eventCount });
    simulationStore.set(result.run.id, result);

    return json(
      { run: result.run, summary: result.summary },
      {
        status: 201,
        headers: { Location: `/api/simulations/${result.run.id}` },
      },
    );
  }

  if (request.method === 'POST' && pathname === '/api/evolution/analyse') {
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

    const parsed = EvolutionAnalysisRequestSchema.safeParse(input);
    if (!parsed.success) {
      return json(
        {
          error: 'invalid_request',
          message: 'Evolution analysis input failed validation.',
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const source =
      simulationStore.get(parsed.data.simulationId) ??
      simulationFromId(parsed.data.simulationId);
    if (!source) {
      return json(
        { error: 'not_found', message: 'Simulation run was not found.' },
        { status: 404 },
      );
    }

    const baseline =
      source.run.variant === 'baseline'
        ? source
        : simulate({ seed: source.run.seed, variant: 'baseline' });
    const evolved =
      source.run.variant === 'evolved'
        ? source
        : simulate({ seed: source.run.seed, variant: 'evolved' });
    simulationStore.set(baseline.run.id, baseline);
    simulationStore.set(evolved.run.id, evolved);

    const fitness = compareFitness(baseline, evolved);
    const findings = rankFrictionFindings(baseline);

    try {
      const configuredTimeout = Number(env?.OPENAI_TIMEOUT_MS ?? 12_000);
      const timeoutMs = Number.isFinite(configuredTimeout)
        ? Math.min(60_000, Math.max(1_000, configuredTimeout))
        : 12_000;
      const analysis = await executeEvolutionAnalysis(
        { summary: baseline.summary, findings, fitness },
        {
          requestedMode: env?.DARWIN_AI_MODE,
          apiKey: openAIKey(env),
          model: env?.OPENAI_MODEL,
          timeoutMs,
        },
      );
      const response = EvolutionAnalysisResponseSchema.parse({
        mode: analysis.mode,
        model: analysis.model,
        fitness,
        findings,
        proposal: analysis.proposal,
      });
      mutationStore.set(analysis.proposal.id, analysis.proposal);
      fitnessStore.set(analysis.proposal.id, fitness);
      if (!timelineStore.some((record) => record.outcome === 'baseline')) {
        timelineStore.push({
          id: `record-baseline-${baseline.run.seed}`,
          version: 'v1.0',
          outcome: 'baseline',
          fitness: fitness.baseline,
          recordedAt: baseline.run.completedAt ?? baseline.run.startedAt,
        });
      }
      await telemetryRepository.saveDemoState(demoState());
      return json(response);
    } catch (error) {
      if (error instanceof EvolutionAnalysisError) {
        return json(
          { error: 'analysis_failed', message: error.message },
          { status: 422 },
        );
      }
      throw error;
    }
  }

  const mutationDecisionMatch = pathname.match(
    /^\/api\/mutations\/([^/]+)\/(approve|reject)$/,
  );
  if (request.method === 'POST' && mutationDecisionMatch) {
    const id = decodeURIComponent(mutationDecisionMatch[1]!);
    const decision = mutationDecisionMatch[2] as 'approve' | 'reject';
    const proposal = mutationStore.get(id);

    if (!proposal) {
      return json(
        { error: 'not_found', message: 'Mutation proposal was not found.' },
        { status: 404 },
      );
    }

    if (proposal.status !== 'proposed') {
      return json(
        {
          error: 'invalid_state',
          message: `Mutation proposal has already been ${proposal.status}.`,
        },
        { status: 409 },
      );
    }

    const decidedProposal: MutationProposal = {
      ...proposal,
      status: decision === 'approve' ? 'approved' : 'rejected',
    };
    mutationStore.set(id, decidedProposal);

    if (decision === 'reject') {
      const fitness = fitnessStore.get(id);
      if (fitness) {
        timelineStore.push({
          id: `record-rejected-${id}`,
          version: 'v1.0',
          mutationId: id,
          outcome: 'failed_selection',
          fitness: fitness.baseline,
          recordedAt: new Date().toISOString(),
        });
      }
    }

    await telemetryRepository.saveDemoState(demoState());

    return json(
      MutationDecisionResponseSchema.parse({
        proposal: decidedProposal,
        organism: organismState,
      }),
    );
  }

  const mutationDiffMatch = pathname.match(/^\/api\/mutations\/([^/]+)\/diff$/);
  if (request.method === 'GET' && mutationDiffMatch) {
    const id = decodeURIComponent(mutationDiffMatch[1]!);
    if (!mutationStore.has(id) || recordedDiff.mutationId !== id) {
      return json(
        { error: 'not_found', message: 'Mutation diff was not found.' },
        { status: 404 },
      );
    }
    return json(recordedDiff);
  }

  const mutationValidationMatch = pathname.match(
    /^\/api\/mutations\/([^/]+)\/validate$/,
  );
  if (request.method === 'POST' && mutationValidationMatch) {
    const id = decodeURIComponent(mutationValidationMatch[1]!);
    const proposal = mutationStore.get(id);
    if (!proposal || recordedValidation.mutationId !== id) {
      return json(
        { error: 'not_found', message: 'Mutation proposal was not found.' },
        { status: 404 },
      );
    }
    if (proposal.status !== 'approved') {
      return json(
        {
          error: 'invalid_state',
          message: 'Mutation must be approved before validation.',
        },
        { status: 409 },
      );
    }

    validationStore.set(id, recordedValidation);
    const validatedProposal: MutationProposal = {
      ...proposal,
      status: recordedValidation.status === 'passed' ? 'validated' : 'approved',
    };
    mutationStore.set(id, validatedProposal);
    await telemetryRepository.saveDemoState(demoState());
    return json(
      MutationValidationResponseSchema.parse({
        proposal: validatedProposal,
        validation: recordedValidation,
      }),
    );
  }

  const mutationReleaseMatch = pathname.match(
    /^\/api\/mutations\/([^/]+)\/release$/,
  );
  if (request.method === 'POST' && mutationReleaseMatch) {
    const id = decodeURIComponent(mutationReleaseMatch[1]!);
    const proposal = mutationStore.get(id);
    const validation = validationStore.get(id);
    if (!proposal) {
      return json(
        { error: 'not_found', message: 'Mutation proposal was not found.' },
        { status: 404 },
      );
    }
    if (
      proposal.status !== 'validated' ||
      !validation ||
      ValidationResultSchema.parse(validation).status !== 'passed'
    ) {
      return json(
        {
          error: 'invalid_state',
          message: 'Mutation must pass validation before release.',
        },
        { status: 409 },
      );
    }

    const releasedProposal: MutationProposal = {
      ...proposal,
      status: 'released',
    };
    mutationStore.set(id, releasedProposal);
    organismState = {
      variant: 'evolved',
      genomeVersion: 'v1.1',
      evolutionCycles: 1,
      activeMutationId: id,
      updatedAt: new Date().toISOString(),
    };
    const fitness = FitnessComparisonSchema.parse(fitnessStore.get(id));
    const record: EvolutionRecord = {
      id: `record-survived-${id}`,
      version: 'v1.1',
      mutationId: id,
      outcome: 'survived',
      fitness: fitness.evolved,
      recordedAt: new Date().toISOString(),
    };
    timelineStore.push(record);
    await telemetryRepository.saveDemoState(demoState());

    return json(
      MutationReleaseResponseSchema.parse({
        proposal: releasedProposal,
        organism: organismState,
        record,
      }),
    );
  }

  const summaryMatch = pathname.match(/^\/api\/simulations\/([^/]+)\/summary$/);
  if (request.method === 'GET' && summaryMatch) {
    const id = decodeURIComponent(summaryMatch[1]!);
    const result = simulationStore.get(id) ?? simulationFromId(id);
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
    const result = simulationStore.get(id) ?? simulationFromId(id);
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

const worker: ExportedHandler<Env> = {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};

export default worker;

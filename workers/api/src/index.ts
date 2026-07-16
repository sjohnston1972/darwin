import {
  DemoResetResponseSchema,
  EvolutionTimelineResponseSchema,
  EvolutionAnalysisRequestSchema,
  EvolutionAnalysisResponseSchema,
  FitnessComparisonSchema,
  MutationDiffSchema,
  MutationDecisionResponseSchema,
  MutationReleaseResponseSchema,
  MutationValidationResponseSchema,
  OrganismStateSchema,
  SimulationRequestSchema,
  ValidationResultSchema,
  type EvolutionRecord,
  type FitnessComparison,
  type HealthResponse,
  type MutationProposal,
  type OrganismState,
  type SimulationResult,
} from '@darwin/shared';

import phase7Artifacts from './fixtures/phase7-artifacts.json';
import { simulate } from './simulation';
import {
  EvolutionAnalysisError,
  compareFitness,
  executeEvolutionAnalysis,
  rankFrictionFindings,
} from './evolution';

export interface Env {
  DARWIN_AI_MODE: string;
  DARWIN_DEMO_SEED: string;
  DARWIN_EVENT_COUNT: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_TIMEOUT_MS: string;
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const json = (body: unknown, init: ResponseInit = {}) => {
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

const initialOrganismState = (): OrganismState => ({
  variant: 'baseline',
  genomeVersion: 'v1.0',
  evolutionCycles: 0,
  activeMutationId: null,
  updatedAt: new Date().toISOString(),
});

let organismState = initialOrganismState();

export const resetSimulationStore = () => {
  simulationStore.clear();
  mutationStore.clear();
  validationStore.clear();
  fitnessStore.clear();
  timelineStore = [];
  organismState = initialOrganismState();
};

export const handleRequest = async (
  request: Request,
  env?: Partial<Env>,
): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'GET' && pathname === '/api/health') {
    const response: HealthResponse = {
      status: 'ok',
      service: 'darwin-api',
      version: '0.7.0',
      timestamp: new Date().toISOString(),
    };

    return json(response);
  }

  if (request.method === 'POST' && pathname === '/api/demo/reset') {
    resetSimulationStore();
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

    const source = simulationStore.get(parsed.data.simulationId);
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
        ? Math.min(30_000, Math.max(1_000, configuredTimeout))
        : 12_000;
      const analysis = await executeEvolutionAnalysis(
        { summary: baseline.summary, findings, fitness },
        {
          requestedMode: env?.DARWIN_AI_MODE,
          apiKey: env?.OPENAI_API_KEY,
          model: env?.OPENAI_MODEL,
          timeoutMs,
        },
      );
      const response = EvolutionAnalysisResponseSchema.parse({
        mode: analysis.mode,
        model: analysis.model,
        fallbackReason: analysis.fallbackReason,
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
    const result = simulationStore.get(id);
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
    const result = simulationStore.get(id);
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

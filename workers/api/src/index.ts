import {
  DemoResetResponseSchema,
  EvolutionAnalysisRequestSchema,
  EvolutionAnalysisResponseSchema,
  MutationDecisionResponseSchema,
  OrganismStateSchema,
  SimulationRequestSchema,
  type HealthResponse,
  type MutationProposal,
  type OrganismState,
  type SimulationResult,
} from '@darwin/shared';

import { simulate } from './simulation';
import {
  EvolutionAnalysisError,
  MockEvolutionAnalyzer,
  compareFitness,
  rankFrictionFindings,
} from './evolution';

export interface Env {
  DARWIN_AI_MODE: string;
  DARWIN_DEMO_SEED: string;
  DARWIN_EVENT_COUNT: string;
  OPENAI_MODEL: string;
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
      version: '0.5.0',
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
      const proposal = await new MockEvolutionAnalyzer().analyse({
        summary: baseline.summary,
        findings,
        fitness,
      });
      const response = EvolutionAnalysisResponseSchema.parse({
        mode: 'mock',
        fitness,
        findings,
        proposal,
      });
      mutationStore.set(proposal.id, proposal);
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

    if (decision === 'approve') {
      organismState = {
        variant: 'evolved',
        genomeVersion: 'v1.1',
        evolutionCycles: 1,
        activeMutationId: id,
        updatedAt: new Date().toISOString(),
      };
    }

    return json(
      MutationDecisionResponseSchema.parse({
        proposal: decidedProposal,
        organism: organismState,
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

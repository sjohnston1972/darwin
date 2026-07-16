import {
  EvolutionAnalysisResponseSchema,
  HealthResponseSchema,
  SimulationSummarySchema,
} from '@darwin/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { handleRequest, resetSimulationStore } from './index';

describe('Darwin API', () => {
  beforeEach(() => resetSimulationStore());

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
    expect(analysis.findings[0]?.id).toBe('finding-task-discovery');
    expect(analysis.proposal.id).toBe('mutation-global-task-discovery-v1');
  });
});

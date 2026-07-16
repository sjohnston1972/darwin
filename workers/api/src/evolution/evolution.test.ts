import { MutationProposalSchema } from '@darwin/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  EvolutionAnalysisError,
  MockEvolutionAnalyzer,
  OpenAIAnalysisError,
  OpenAIEvolutionAnalyzer,
  compareFitness,
  executeEvolutionAnalysis,
  mutationProposalJsonSchema,
  rankFrictionFindings,
  validateMutationProposal,
} from './index';
import { simulate } from '../simulation';

describe('fitness and evolution analysis', () => {
  const baseline = simulate({ seed: 1859, variant: 'baseline' });
  const evolved = simulate({ seed: 1859, variant: 'evolved' });
  const analysisInput = () => ({
    summary: baseline.summary,
    findings: rankFrictionFindings(baseline),
    fitness: compareFitness(baseline, evolved),
  });

  it('calculates higher fitness for the evolved organism', () => {
    const fitness = compareFitness(baseline, evolved);

    expect(fitness.baseline.score).toBeGreaterThan(60);
    expect(fitness.baseline.score).toBeLessThan(75);
    expect(fitness.evolved.score).toBeGreaterThan(85);
    expect(fitness.evolved.score).toBeGreaterThan(fitness.baseline.score);
    expect(fitness.delta).toBeGreaterThan(15);
  });

  it('ranks assigned-task discovery as the strongest selection pressure', () => {
    const findings = rankFrictionFindings(baseline);

    expect(findings[0]?.id).toBe('finding-task-discovery');
    expect(findings[0]!.impact).toBeGreaterThan(findings[1]!.impact);
    expect(findings[0]!.evidence).toHaveLength(3);
  });

  it('returns a deterministic schema-valid mock mutation proposal', async () => {
    const fitness = compareFitness(baseline, evolved);
    const findings = rankFrictionFindings(baseline);
    const analyzer = new MockEvolutionAnalyzer();
    const proposal = await analyzer.analyse({
      summary: baseline.summary,
      findings,
      fitness,
    });

    expect(MutationProposalSchema.parse(proposal).id).toBe(
      'mutation-global-task-discovery-v1',
    );
    expect(proposal.predictedFitnessGain).toBe(fitness.delta);
    expect(proposal.status).toBe('proposed');
  });

  it('rejects malformed analyzer output safely', () => {
    expect(() =>
      validateMutationProposal({
        id: 'invalid-proposal',
        confidence: 2,
        risk: 'unknown',
      }),
    ).toThrow(EvolutionAnalysisError);
  });

  it('parses a strict live Responses API proposal and logs metadata only', async () => {
    const proposal = await new MockEvolutionAnalyzer().analyse(analysisInput());
    const events: Record<string, unknown>[] = [];
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_phase6_live',
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: JSON.stringify(proposal) },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { 'x-request-id': 'req_phase6_live' },
        },
      ),
    );
    const analyzer = new OpenAIEvolutionAnalyzer({
      apiKey: 'sk-test-secret',
      model: 'gpt-5.6',
      fetch: fetcher,
      logger: { info: (event) => events.push(event) },
    });

    await expect(analyzer.analyse(analysisInput())).resolves.toEqual(proposal);
    const request = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request[1].body)) as {
      text: { format: { strict: boolean; schema: unknown } };
      input: Array<{ role: string; content: string }>;
    };

    expect(request[0]).toBe('https://api.openai.com/v1/responses');
    expect(request[1].headers).toMatchObject({
      Authorization: 'Bearer sk-test-secret',
    });
    expect(body.text.format).toMatchObject({
      strict: true,
      schema: mutationProposalJsonSchema,
    });
    expect(body.input[1]?.content).not.toContain('sk-test-secret');
    expect(events).toEqual([
      expect.objectContaining({
        event: 'openai_analysis_completed',
        model: 'gpt-5.6',
        responseId: 'resp_phase6_live',
        requestId: 'req_phase6_live',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('sk-test-secret');
    expect(JSON.stringify(events)).not.toContain(proposal.hypothesis);
  });

  it('times out a live request with a typed fallback reason', async () => {
    const fetcher = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const analyzer = new OpenAIEvolutionAnalyzer({
      apiKey: 'sk-test-secret',
      model: 'gpt-5.6',
      timeoutMs: 1,
      fetch: fetcher,
      logger: { info: vi.fn() },
    });

    await expect(analyzer.analyse(analysisInput())).rejects.toMatchObject({
      name: 'OpenAIAnalysisError',
      code: 'timeout',
    } satisfies Partial<OpenAIAnalysisError>);
  });

  it('selects live mode and falls back safely when the API fails', async () => {
    const proposal = await new MockEvolutionAnalyzer().analyse(analysisInput());
    const live = await executeEvolutionAnalysis(analysisInput(), {
      requestedMode: 'live',
      apiKey: 'sk-test-secret',
      model: 'gpt-5.6',
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ output_text: JSON.stringify(proposal) }),
            { status: 200 },
          ),
        ),
      logger: { info: vi.fn() },
    });
    expect(live).toMatchObject({ mode: 'live', model: 'gpt-5.6', proposal });

    const fallback = await executeEvolutionAnalysis(analysisInput(), {
      requestedMode: 'live',
      apiKey: 'sk-test-secret',
      model: 'gpt-5.6',
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      logger: { info: vi.fn() },
    });
    expect(fallback).toMatchObject({
      mode: 'fallback',
      model: 'deterministic-mock',
      fallbackReason: 'api_error',
    });

    const missingKey = await executeEvolutionAnalysis(analysisInput(), {
      requestedMode: 'live',
    });
    expect(missingKey).toMatchObject({
      mode: 'fallback',
      fallbackReason: 'missing_api_key',
    });
  });
});

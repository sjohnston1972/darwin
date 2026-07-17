import { describe, expect, it, vi } from 'vitest';

import {
  EvolutionAnalysisError,
  OpenAIAnalysisError,
  OpenAIEvolutionAnalyzer,
  compareFitness,
  executeEvolutionAnalysis,
  mutationProposalJsonSchema,
  rankFrictionFindings,
  validateMutationProposal,
} from './index';
import { simulate } from '../simulation';

describe('fitness and live evolution analysis', () => {
  const baseline = simulate({ seed: 1859, variant: 'baseline' });
  const evolved = simulate({ seed: 1859, variant: 'evolved' });
  const analysisInput = () => ({
    summary: baseline.summary,
    findings: rankFrictionFindings(baseline),
    fitness: compareFitness(baseline, evolved),
  });
  const proposal = {
    id: 'mutation-global-task-discovery-v1',
    name: 'Promote global task discovery',
    observation: 'Assigned tasks are difficult to locate.',
    evidence: ['Measured navigation paths are longer than necessary.'],
    hypothesis: 'A direct work route will reduce path length.',
    implementationSummary: 'Promote My Work and global search.',
    predictedFitnessGain: 20.8,
    confidence: 0.86,
    risk: 'low' as const,
    affectedFiles: ['apps/projectflow/src/App.tsx'],
    status: 'proposed' as const,
  };

  it('calculates higher fitness for the evolved application', () => {
    const fitness = compareFitness(baseline, evolved);
    expect(fitness.baseline.score).toBeGreaterThan(60);
    expect(fitness.evolved.score).toBeGreaterThan(85);
    expect(fitness.delta).toBeGreaterThan(15);
  });

  it('ranks assigned-task discovery as the strongest selection pressure', () => {
    const findings = rankFrictionFindings(baseline);
    expect(findings[0]?.id).toBe('finding-task-discovery');
    expect(findings[0]!.impact).toBeGreaterThan(findings[1]!.impact);
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

  it('sends strict structured output with cached ProjectFlow context', async () => {
    const events: Record<string, unknown>[] = [];
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_live',
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: JSON.stringify(proposal) },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'x-request-id': 'req_live' } },
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
      prompt_cache_key?: string;
      prompt_cache_retention?: string;
    };
    expect(request[0]).toBe('https://api.openai.com/v1/responses');
    expect(body.text.format).toMatchObject({
      strict: true,
      schema: mutationProposalJsonSchema,
    });
    expect(body.prompt_cache_key).toMatch(/^darwin-ctx-/);
    expect(body.prompt_cache_retention).toBe('24h');
    expect(body.input[1]?.content).toContain(
      'Darwin Telemetry-to-Evolution Examples',
    );
    expect(body.input[1]?.content).toContain(
      'target application source is fetched from its live GitHub commit',
    );
    expect(JSON.stringify(events)).not.toContain('sk-test-secret');
  });

  it('returns a typed timeout from the live API', async () => {
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

  it('uses live mode and fails closed when GPT is unavailable', async () => {
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

    await expect(
      executeEvolutionAnalysis(analysisInput(), {
        requestedMode: 'live',
        apiKey: 'sk-test-secret',
        fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      }),
    ).rejects.toMatchObject({ code: 'api_error' });
    await expect(
      executeEvolutionAnalysis(analysisInput(), { requestedMode: 'live' }),
    ).rejects.toMatchObject({ code: 'missing_api_key' });
  });
});

import { describe, expect, it } from 'vitest';

import { HealthResponseSchema, MutationProposalSchema } from './contracts';

describe('shared contracts', () => {
  it('accepts a valid health response', () => {
    expect(
      HealthResponseSchema.parse({
        status: 'ok',
        service: 'darwin-api',
        version: '0.1.0',
        timestamp: '2026-07-16T12:00:00.000Z',
      }),
    ).toMatchObject({ status: 'ok', service: 'darwin-api' });
  });

  it('rejects mutation confidence outside the supported range', () => {
    const proposal = {
      id: 'mutation-001',
      name: 'Promote task discovery',
      observation: 'Assigned work is difficult to locate.',
      evidence: ['42% of task workflows backtrack through Projects.'],
      hypothesis: 'A global entry point will reduce navigation cost.',
      implementationSummary: 'Promote search and My Work.',
      predictedFitnessGain: 18,
      confidence: 1.2,
      risk: 'low',
      affectedFiles: ['apps/web/src/App.tsx'],
      status: 'proposed',
    };

    expect(() => MutationProposalSchema.parse(proposal)).toThrow();
  });
});

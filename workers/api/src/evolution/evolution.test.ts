import { MutationProposalSchema } from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import {
  EvolutionAnalysisError,
  MockEvolutionAnalyzer,
  compareFitness,
  rankFrictionFindings,
  validateMutationProposal,
} from './index';
import { simulate } from '../simulation';

describe('fitness and evolution analysis', () => {
  const baseline = simulate({ seed: 1859, variant: 'baseline' });
  const evolved = simulate({ seed: 1859, variant: 'evolved' });

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
});

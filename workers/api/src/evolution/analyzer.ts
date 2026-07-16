import {
  MutationProposalSchema,
  type FitnessComparison,
  type FrictionFinding,
  type MutationProposal,
  type SimulationSummary,
} from '@darwin/shared';

export interface EvolutionAnalysisInput {
  summary: SimulationSummary;
  findings: FrictionFinding[];
  fitness: FitnessComparison;
}

export interface EvolutionAnalyzer {
  analyse(input: EvolutionAnalysisInput): Promise<MutationProposal>;
}

export class EvolutionAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvolutionAnalysisError';
  }
}

export const validateMutationProposal = (value: unknown): MutationProposal => {
  const parsed = MutationProposalSchema.safeParse(value);
  if (!parsed.success) {
    throw new EvolutionAnalysisError(
      `Mutation proposal failed schema validation: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  return parsed.data;
};

export class MockEvolutionAnalyzer implements EvolutionAnalyzer {
  async analyse(input: EvolutionAnalysisInput): Promise<MutationProposal> {
    const leadingFinding = input.findings[0];
    if (!leadingFinding) {
      throw new EvolutionAnalysisError(
        'At least one friction finding is required for evolution analysis.',
      );
    }

    return validateMutationProposal({
      id: 'mutation-global-task-discovery-v1',
      name: 'Promote global task discovery',
      observation: leadingFinding.description,
      evidence: leadingFinding.evidence,
      hypothesis:
        'Promoting assigned work and search into persistent navigation will reduce path length, abandonment, and time-to-task without removing existing project workflows.',
      implementationSummary:
        'Make My Work a primary destination, move task search into the global header, keep quick task creation globally available, and consolidate Reports into Insights.',
      predictedFitnessGain: input.fitness.delta,
      confidence: leadingFinding.confidence,
      risk: 'low',
      affectedFiles: [
        'apps/web/src/projectflow/ProjectFlow.tsx',
        'apps/web/src/projectflow/projectflow.css',
      ],
      status: 'proposed',
    });
  }
}

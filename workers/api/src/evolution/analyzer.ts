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

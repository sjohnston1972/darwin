import type { AnalysisMode, MutationProposal } from '@darwin/shared';

import type { EvolutionAnalysisInput } from './analyzer';
import {
  OpenAIAnalysisError,
  OpenAIEvolutionAnalyzer,
  type AnalysisLogger,
} from './openai';

export interface EvolutionExecutionOptions {
  requestedMode?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  logger?: AnalysisLogger;
}

export interface EvolutionExecutionResult {
  proposal: MutationProposal;
  mode: AnalysisMode;
  model: string;
}

export const executeEvolutionAnalysis = async (
  input: EvolutionAnalysisInput,
  options: EvolutionExecutionOptions = {},
): Promise<EvolutionExecutionResult> => {
  if (options.requestedMode !== 'live') {
    throw new OpenAIAnalysisError(
      'Live GPT analysis is not configured; no recommendation was generated.',
      'missing_api_key',
    );
  }

  if (!options.apiKey) {
    throw new OpenAIAnalysisError(
      'OPENAI_API_KEY is required; no recommendation was generated.',
      'missing_api_key',
    );
  }

  const model = options.model ?? 'gpt-5.6';
  const proposal = await new OpenAIEvolutionAnalyzer({
    apiKey: options.apiKey,
    model,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
    logger: options.logger,
  }).analyse(input);
  return { proposal, mode: 'live', model };
};

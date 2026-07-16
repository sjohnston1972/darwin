import type {
  AnalysisFallbackReason,
  AnalysisMode,
  MutationProposal,
} from '@darwin/shared';

import { MockEvolutionAnalyzer, type EvolutionAnalysisInput } from './analyzer';
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
  fallbackReason?: AnalysisFallbackReason;
}

const fallbackReason = (error: unknown): AnalysisFallbackReason =>
  error instanceof OpenAIAnalysisError ? error.code : 'invalid_response';

export const executeEvolutionAnalysis = async (
  input: EvolutionAnalysisInput,
  options: EvolutionExecutionOptions = {},
): Promise<EvolutionExecutionResult> => {
  const mock = new MockEvolutionAnalyzer();
  if (options.requestedMode !== 'live') {
    return {
      proposal: await mock.analyse(input),
      mode: 'mock',
      model: 'deterministic-mock',
    };
  }

  if (!options.apiKey) {
    return {
      proposal: await mock.analyse(input),
      mode: 'fallback',
      model: 'deterministic-mock',
      fallbackReason: 'missing_api_key',
    };
  }

  const model = options.model ?? 'gpt-5.6';
  try {
    const proposal = await new OpenAIEvolutionAnalyzer({
      apiKey: options.apiKey,
      model,
      timeoutMs: options.timeoutMs,
      fetch: options.fetch,
      logger: options.logger,
    }).analyse(input);
    return { proposal, mode: 'live', model };
  } catch (error) {
    return {
      proposal: await mock.analyse(input),
      mode: 'fallback',
      model: 'deterministic-mock',
      fallbackReason: fallbackReason(error),
    };
  }
};

import type { AnalysisFailureReason, MutationProposal } from '@darwin/shared';

import {
  EvolutionAnalysisError,
  validateMutationProposal,
  type EvolutionAnalysisInput,
  type EvolutionAnalyzer,
} from './analyzer';
import {
  evolutionReasoningContext,
  evolutionReasoningContextVersion,
} from '../reasoning/generated-context';

const responsesEndpoint = 'https://api.openai.com/v1/responses';

export const mutationFileAllowList = [
  'apps/projectflow/src/App.tsx',
  'apps/projectflow/src/styles.css',
  'apps/projectflow/src/data.ts',
] as const;

export const evolutionAnalysisSystemPrompt = `You are Darwin, an autonomous product engineer operating under strict evidence and safety constraints.

Analyse the supplied aggregated application telemetry and propose exactly one high-value, low-risk product mutation.

Ground every conclusion in supplied evidence. Do not invent user research, metrics, or source-code capabilities. Prefer the smallest change likely to improve measurable fitness. Preserve existing functionality. Treat predictions as estimates. Remain inside the supplied mutation allow-list. Return only the requested structured output. Do not include chain-of-thought.`;

export const mutationProposalJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    observation: { type: 'string', minLength: 1 },
    evidence: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    hypothesis: { type: 'string', minLength: 1 },
    implementationSummary: { type: 'string', minLength: 1 },
    predictedFitnessGain: { type: 'number' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    risk: { type: 'string', enum: ['low'] },
    affectedFiles: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: [...mutationFileAllowList] },
    },
    status: { type: 'string', enum: ['proposed'] },
  },
  required: [
    'id',
    'name',
    'observation',
    'evidence',
    'hypothesis',
    'implementationSummary',
    'predictedFitnessGain',
    'confidence',
    'risk',
    'affectedFiles',
    'status',
  ],
  additionalProperties: false,
} as const;

export interface AnalysisLogger {
  info(event: Record<string, unknown>): void;
}

const defaultLogger: AnalysisLogger = {
  info(event) {
    console.info('[darwin:analysis]', JSON.stringify(event));
  },
};

export class OpenAIAnalysisError extends EvolutionAnalysisError {
  constructor(
    message: string,
    readonly code: AnalysisFailureReason,
  ) {
    super(message);
    this.name = 'OpenAIAnalysisError';
  }
}

export interface OpenAIEvolutionAnalyzerOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  logger?: AnalysisLogger;
  endpoint?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const responseText = (payload: unknown): string | null => {
  const response = asRecord(payload);
  if (!response) return null;
  if (typeof response.output_text === 'string') return response.output_text;
  if (!Array.isArray(response.output)) return null;

  for (const outputItem of response.output) {
    const output = asRecord(outputItem);
    if (!output || !Array.isArray(output.content)) continue;
    for (const contentItem of output.content) {
      const content = asRecord(contentItem);
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return null;
};

const validateAllowedMutation = (value: unknown): MutationProposal => {
  const proposal = validateMutationProposal(value);
  if (proposal.status !== 'proposed' || proposal.risk !== 'low') {
    throw new OpenAIAnalysisError(
      'Live mutation proposal exceeded the controlled mutation policy.',
      'invalid_response',
    );
  }

  const disallowedFile = proposal.affectedFiles.find(
    (file) => !mutationFileAllowList.some((allowed) => allowed === file),
  );
  if (disallowedFile) {
    throw new OpenAIAnalysisError(
      'Live mutation proposal included a file outside the allow-list.',
      'invalid_response',
    );
  }

  return proposal;
};

const normalizeError = (error: unknown, timedOut: boolean) => {
  if (error instanceof OpenAIAnalysisError) return error;
  if (timedOut || (asRecord(error)?.name ?? '') === 'AbortError') {
    return new OpenAIAnalysisError(
      'OpenAI evolution analysis timed out.',
      'timeout',
    );
  }
  if (error instanceof EvolutionAnalysisError || error instanceof SyntaxError) {
    return new OpenAIAnalysisError(
      'OpenAI returned an invalid mutation proposal.',
      'invalid_response',
    );
  }
  return new OpenAIAnalysisError(
    'OpenAI evolution analysis request failed.',
    'api_error',
  );
};

export class OpenAIEvolutionAnalyzer implements EvolutionAnalyzer {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly logger: AnalysisLogger;
  private readonly endpoint: string;

  constructor(options: OpenAIEvolutionAnalyzerOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.logger = options.logger ?? defaultLogger;
    this.endpoint = options.endpoint ?? responsesEndpoint;
  }

  async analyse(input: EvolutionAnalysisInput): Promise<MutationProposal> {
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let responseId: string | undefined;
    let requestId: string | null = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          prompt_cache_key: `darwin-${evolutionReasoningContextVersion}`,
          prompt_cache_retention: '24h',
          input: [
            { role: 'system', content: evolutionAnalysisSystemPrompt },
            { role: 'developer', content: evolutionReasoningContext },
            {
              role: 'user',
              content: JSON.stringify({
                targetApplication: 'ProjectFlow',
                applicationContext: {
                  purpose:
                    'A project-management workspace for finding assigned work, coordinating projects, creating tasks, and reviewing delivery health.',
                  primaryUser:
                    'A knowledge worker managing personal tasks and shared project delivery.',
                  domainEntities: [
                    'workspace',
                    'project',
                    'task',
                    'user',
                    'report',
                  ],
                  primaryGoals: [
                    'find assigned work',
                    'create and assign tasks',
                    'monitor project delivery',
                    'review team workload',
                  ],
                  baselineVariant: {
                    version: '1.0.0',
                    navigation: [
                      'Dashboard',
                      'Projects',
                      'Reports',
                      'Settings',
                    ],
                    capabilities: [
                      'dashboard task summary',
                      'project directory',
                      'project-scoped task search',
                      'project-scoped task creation',
                      'standalone reports',
                    ],
                  },
                  interfaceInventory: [
                    {
                      area: 'dashboard',
                      purpose:
                        'Summarise work, project health, capacity, and activity.',
                    },
                    {
                      area: 'projects',
                      purpose:
                        'Browse projects before opening project-scoped work.',
                    },
                    {
                      area: 'task-discovery',
                      purpose: 'Find and open assigned work.',
                      baselinePath: [
                        'Projects',
                        'project detail',
                        'task directory',
                        'task',
                      ],
                    },
                    {
                      area: 'global-header',
                      purpose:
                        'Provide workspace actions and navigation context.',
                    },
                  ],
                },
                telemetry: input.summary,
                selectionPressure: input.findings,
                fitness: input.fitness,
                mutationPolicy: {
                  risk: 'low',
                  status: 'proposed',
                  allowedFiles: mutationFileAllowList,
                },
              }),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'darwin_mutation_proposal',
              schema: mutationProposalJsonSchema,
              strict: true,
            },
          },
          max_output_tokens: 1_800,
        }),
        signal: controller.signal,
      });
      requestId = response.headers.get('x-request-id');

      if (!response.ok) {
        throw new OpenAIAnalysisError(
          `OpenAI Responses API returned HTTP ${response.status}.`,
          'api_error',
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OpenAIAnalysisError(
          'OpenAI returned a non-JSON response.',
          'invalid_response',
        );
      }
      const responseRecord = asRecord(payload);
      responseId =
        typeof responseRecord?.id === 'string' ? responseRecord.id : undefined;
      const output = responseText(payload);
      if (!output) {
        throw new OpenAIAnalysisError(
          'OpenAI response did not contain structured output text.',
          'invalid_response',
        );
      }

      const proposal = validateAllowedMutation(JSON.parse(output));
      this.logger.info({
        event: 'openai_analysis_completed',
        model: this.model,
        responseId,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      return proposal;
    } catch (error) {
      const normalized = normalizeError(error, timedOut);
      this.logger.info({
        event: 'openai_analysis_failed',
        model: this.model,
        responseId,
        requestId,
        reason: normalized.code,
        durationMs: Date.now() - startedAt,
      });
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }
}

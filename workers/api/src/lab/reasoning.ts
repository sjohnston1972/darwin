import {
  LabAgentDecisionResponseSchema,
  LabAnalysisSchema,
  type LabAgentDecisionRequest,
  type LabAgentDecisionResponse,
  type LabAnalysis,
  type LabEvidencePack,
  type LabExperiment,
} from '@darwin/shared';
import { z } from 'zod';
import { timeOperation } from '../observability';

export const labAgentPromptVersion = '1.0.0' as const;
export const labAnalysisPromptVersion = '1.0.0' as const;

const agentDecisionJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'navigate',
        'click',
        'hover',
        'type',
        'clear',
        'key',
        'select',
        'scroll',
        'back',
        'forward',
        'submit',
        'abandon',
      ],
    },
    target: {
      anyOf: [
        {
          type: 'object',
          properties: {
            semanticId: { type: ['string', 'null'] },
            role: { type: ['string', 'null'] },
            name: { type: ['string', 'null'] },
          },
          required: ['semanticId', 'role', 'name'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
    value: { type: ['string', 'null'] },
    key: { type: ['string', 'null'] },
    destination: { type: ['string', 'null'] },
    expectation: { type: 'string' },
  },
  required: ['action', 'target', 'value', 'key', 'destination', 'expectation'],
  additionalProperties: false,
} as const;

const mutationJsonSchema = {
  type: 'object',
  properties: {
    mutationId: { type: 'string' },
    title: { type: 'string' },
    problem: { type: 'string' },
    evidenceIds: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', pattern: '^L-EV-\\d{3}$' },
    },
    hypothesis: { type: 'string' },
    implementationBrief: { type: 'string' },
    tradeoffs: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string' },
    },
    validationPlan: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'mutationId',
    'title',
    'problem',
    'evidenceIds',
    'hypothesis',
    'implementationBrief',
    'tradeoffs',
    'validationPlan',
    'confidence',
  ],
  additionalProperties: false,
} as const;

const analysisOutputSchema = z.object({
  summary: z.string().min(1).max(1_000),
  selectedMutationId: z.string().min(1).max(128),
  mutations: z
    .array(
      z.object({
        mutationId: z.string().min(1).max(128),
        title: z.string().min(1).max(120),
        problem: z.string().min(1).max(600),
        evidenceIds: z.array(z.string().regex(/^L-EV-\d{3}$/)).min(1),
        hypothesis: z.string().min(1).max(600),
        implementationBrief: z.string().min(1).max(2_000),
        tradeoffs: z.array(z.string().min(1).max(300)).min(1).max(5),
        validationPlan: z.string().min(1).max(1_000),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(3),
});

const analysisJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    selectedMutationId: { type: 'string' },
    mutations: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: mutationJsonSchema,
    },
  },
  required: ['summary', 'selectedMutationId', 'mutations'],
  additionalProperties: false,
} as const;

const agentSystemPrompt = `You are one bounded automated usability-study participant operating the real ProjectFlow target only through its rendered accessibility tree. Adopt the supplied persona. Choose exactly one next action that advances the assigned task. Do not claim success from the task wording; use only UI evidence. Never reveal chain-of-thought. The expectation is one compact sentence describing the expected UI result. Prefer semantic IDs or accessible roles and names. Stay on the supplied target origin. If the task is complete choose submit; if no safe progress is possible choose abandon.`;

const analysisSystemPrompt = `You are Darwin Lab's population analyst. Analyse only the supplied evidence pack derived from automated Playwright interactions with the verified real ProjectFlow target. Darwin Lab agents are automated and are never human participants or human fitness evidence. Return one to three bounded ProjectFlow mutation candidates. Every problem and mutation must cite only supplied L-EV evidence IDs. Do not invent post-mutation fitness. Prefer the smallest functional change that addresses recurrent population-level selection pressure. Include a measurable automated retest plan and material tradeoffs. Return only structured output.`;

export class LabReasoningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabReasoningError';
  }
}

const responseText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;
  if (!Array.isArray(record.output)) return null;
  for (const item of record.output) {
    const output = item as { content?: unknown[] };
    for (const content of output.content ?? []) {
      const part = content as { type?: string; text?: unknown };
      if (part.type === 'output_text' && typeof part.text === 'string') {
        return part.text;
      }
    }
  }
  return null;
};

const callStructuredOutput = async (
  apiKey: string,
  model: string,
  system: string,
  input: unknown,
  schemaName: string,
  schema: object,
  timeoutMs: number,
  maxOutputTokens: number,
  fetcher: typeof fetch,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await timeOperation('openai', 'lab_reasoning', () =>
      fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: 'none' },
          input: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(input) },
          ],
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name: schemaName,
              schema,
              strict: true,
            },
          },
          max_output_tokens: maxOutputTokens,
        }),
        signal: controller.signal,
      }),
    );
    if (!response.ok) {
      throw new LabReasoningError(
        `OpenAI Responses API returned HTTP ${response.status}.`,
      );
    }
    const text = responseText(await response.json());
    if (!text) throw new LabReasoningError('OpenAI returned no output.');
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof LabReasoningError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LabReasoningError('OpenAI request timed out.');
    }
    throw new LabReasoningError(
      error instanceof Error ? error.message : 'OpenAI request failed.',
    );
  } finally {
    clearTimeout(timeout);
  }
};

export interface LabReasoningOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  createdAt?: string;
}

export async function decideLabAgentAction(
  request: LabAgentDecisionRequest,
  options: LabReasoningOptions = {},
): Promise<LabAgentDecisionResponse> {
  if (!options.apiKey) {
    throw new LabReasoningError('Live Lab agent reasoning is unavailable.');
  }
  const model = options.model || 'gpt-5.6-luna';
  const output = await callStructuredOutput(
    options.apiKey,
    model,
    agentSystemPrompt,
    request,
    'darwin_lab_agent_action',
    agentDecisionJsonSchema,
    options.timeoutMs ?? 30_000,
    400,
    options.fetch ?? fetch,
  );
  const candidate = output as {
    target?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  const target = candidate.target
    ? Object.fromEntries(
        Object.entries(candidate.target).filter(([, value]) => value !== null),
      )
    : null;
  const parsed = LabAgentDecisionResponseSchema.parse({
    model,
    decision: { ...candidate, target },
  });
  const targetActions = new Set([
    'click',
    'hover',
    'type',
    'clear',
    'select',
    'submit',
  ]);
  if (targetActions.has(parsed.decision.action) && !parsed.decision.target) {
    throw new LabReasoningError('The selected action requires a target.');
  }
  return parsed;
}

export async function analyseLabEvidence(
  experiment: LabExperiment,
  evidence: LabEvidencePack,
  options: LabReasoningOptions = {},
): Promise<LabAnalysis> {
  if (!options.apiKey) {
    throw new LabReasoningError('Live Lab population analysis is unavailable.');
  }
  if (!evidence.signals.length) {
    throw new LabReasoningError(
      'No deterministic Lab friction signals are available for analysis.',
    );
  }
  const model = options.model || 'gpt-5.6';
  const raw = await callStructuredOutput(
    options.apiKey,
    model,
    analysisSystemPrompt,
    {
      experiment: {
        task: experiment.task,
        populationSize: experiment.populationSize,
        seed: experiment.seed,
        maxActions: experiment.maxActions,
      },
      evidence,
    },
    'darwin_lab_population_analysis',
    analysisJsonSchema,
    options.timeoutMs ?? 90_000,
    2_500,
    options.fetch ?? fetch,
  );
  const output = analysisOutputSchema.parse(raw);
  const availableIds = new Set(
    evidence.signals.map((signal) => signal.evidenceId),
  );
  const mutationIds = new Set(output.mutations.map((item) => item.mutationId));
  if (!mutationIds.has(output.selectedMutationId)) {
    throw new LabReasoningError('Selected mutation is not in the portfolio.');
  }
  if (
    output.mutations.some((mutation) =>
      mutation.evidenceIds.some((evidenceId) => !availableIds.has(evidenceId)),
    )
  ) {
    throw new LabReasoningError('Analysis cited unsupported Lab evidence.');
  }
  return LabAnalysisSchema.parse({
    provenance: evidence.provenance,
    analysisId: `lab-analysis-${crypto.randomUUID()}`,
    experimentId: experiment.experimentId,
    evidencePackId: evidence.evidencePackId,
    evidenceHash: evidence.evidenceHash,
    model,
    promptVersion: labAnalysisPromptVersion,
    createdAt: options.createdAt ?? new Date().toISOString(),
    ...output,
    mutations: output.mutations.map((mutation) => ({
      ...mutation,
      provenance: evidence.provenance,
    })),
  });
}

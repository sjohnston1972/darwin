import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidenceMutationCandidateSchema,
  EvidencePressureClusterSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidenceMutationCandidate,
  type EvidencePack,
} from '@darwin/shared';
import { z } from 'zod';

import {
  evolutionReasoningContext,
  evolutionReasoningContextVersion,
} from './generated-context';
import type { RepositorySnapshot } from '../repository/github-source';

export const evidencePromptVersion = '3.0.0' as const;
export const codexAllowedPaths = [
  'apps/projectflow/src/App.tsx',
  'apps/projectflow/src/styles.css',
  'apps/projectflow/src/data.ts',
] as const;
export const codexProtectedPaths = [
  'workers/api/src/evidence/**',
  'workers/api/migrations/**',
  'packages/telemetry-client/**',
] as const;

const modelPressureClusterSchema = EvidencePressureClusterSchema.extend({
  affectedTargets: z.array(z.string().min(1)),
});

const modelOutputSchema = z.object({
  evidenceAssessment: z.object({
    summary: z.string().min(1),
    pressureClusters: z.array(modelPressureClusterSchema).min(1).max(8),
    selectionRationale: z.string().min(1),
  }),
  selectedMutation: EvidenceMutationCandidateSchema,
  alternatives: z.array(EvidenceMutationCandidateSchema).min(2).max(5),
  unsupportedIdeasRejected: z.array(
    z.object({ idea: z.string().min(1), reason: z.string().min(1) }),
  ),
});

const candidateJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    problem: { type: 'string', minLength: 1 },
    evidenceIds: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', pattern: '^EV-\\d{3}$' },
    },
    pressureClusterIds: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    hypothesis: { type: 'string', minLength: 1 },
    change: { type: 'string', minLength: 1 },
    predictedImpact: {
      type: 'object',
      properties: {
        metric: { type: 'string', minLength: 1 },
        direction: { type: 'string', enum: ['increase', 'decrease'] },
        rationale: { type: 'string', minLength: 1 },
      },
      required: ['metric', 'direction', 'rationale'],
      additionalProperties: false,
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    scorecard: {
      type: 'object',
      properties: {
        evidenceStrength: { type: 'integer', minimum: 0, maximum: 100 },
        userImpact: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'User impact score on a 0-100 percentage scale.',
        },
        feasibility: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description:
            'Implementation feasibility on a 0-100 percentage scale.',
        },
        validationClarity: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Validation clarity on a 0-100 percentage scale.',
        },
        total: { type: 'integer', minimum: 0, maximum: 100 },
      },
      required: [
        'evidenceStrength',
        'userImpact',
        'feasibility',
        'validationClarity',
        'total',
      ],
      additionalProperties: false,
    },
    scope: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    tradeoffs: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    acceptanceCriteria: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    validationPlan: {
      type: 'object',
      properties: {
        primaryMetric: { type: 'string', minLength: 1 },
        baseline: { type: 'string', minLength: 1 },
        successThreshold: { type: 'string', minLength: 1 },
        guardrails: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
      },
      required: ['primaryMetric', 'baseline', 'successThreshold', 'guardrails'],
      additionalProperties: false,
    },
    codexBrief: { type: 'string', minLength: 1 },
  },
  required: [
    'id',
    'title',
    'problem',
    'evidenceIds',
    'pressureClusterIds',
    'hypothesis',
    'change',
    'predictedImpact',
    'confidence',
    'scorecard',
    'scope',
    'tradeoffs',
    'acceptanceCriteria',
    'validationPlan',
    'codexBrief',
  ],
  additionalProperties: false,
} as const;

export const evidenceAnalysisJsonSchema = {
  type: 'object',
  properties: {
    evidenceAssessment: {
      type: 'object',
      properties: {
        summary: { type: 'string', minLength: 1 },
        pressureClusters: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1 },
              title: { type: 'string', minLength: 1 },
              interpretation: { type: 'string', minLength: 1 },
              evidenceIds: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', pattern: '^EV-\\d{3}$' },
              },
              affectedTargets: {
                type: 'array',
                items: { type: 'string', minLength: 1 },
              },
              userConsequence: { type: 'string', minLength: 1 },
              competingExplanations: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', minLength: 1 },
              },
              mutationOpportunity: { type: 'string', minLength: 1 },
            },
            required: [
              'id',
              'title',
              'interpretation',
              'evidenceIds',
              'affectedTargets',
              'userConsequence',
              'competingExplanations',
              'mutationOpportunity',
            ],
            additionalProperties: false,
          },
        },
        selectionRationale: { type: 'string', minLength: 1 },
      },
      required: ['summary', 'pressureClusters', 'selectionRationale'],
      additionalProperties: false,
    },
    selectedMutation: candidateJsonSchema,
    alternatives: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: candidateJsonSchema,
    },
    unsupportedIdeasRejected: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          idea: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
        },
        required: ['idea', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'evidenceAssessment',
    'selectedMutation',
    'alternatives',
    'unsupportedIdeasRejected',
  ],
  additionalProperties: false,
} as const;

export const evidenceAnalysisSystemPrompt = `You are Darwin's senior product evolution analyst. Analyse measured ProjectFlow behavior deeply enough that a product team could defend the resulting mutation.

Reconstruct each supplied ordered journey before interpreting detector signals. Inspect the supplied application source to determine what the affected controls actually do, including inert controls, missing handlers, hidden state changes, misleading affordances, and available destinations. Detector signals are leads, not conclusions.

Group related evidence into causal pressure clusters. For every cluster state the most likely interpretation, user consequence, affected targets, and at least one credible competing explanation. Never turn a single hover, drag, zoom, or click into a product-wide claim without acknowledging weak coverage.

The evolution catalogue contains concrete examples of powerful mutations that may be adopted when matching evidence exists. It is not evidence, a mandatory mapping, or a list of default answers. Prefer functional mutations that remove broken or missing behavior over cosmetic changes. Consider combined mutations when multiple signals share one cause.

Produce a portfolio containing one selected mutation and two to five genuine alternatives spanning the meaningful pressure clusters. Score each candidate for evidence strength, user impact, feasibility, and validation clarity using integer percentages from 0 to 100, never a 1-5 rubric. Evidence strength must reflect recurrence across events, sessions, participants, and completed tasks. Predictions are hypotheses, not outcomes.

Every behavioral claim and candidate must cite supplied evidence IDs. Every scope value must come from mutableAreas. Never target protectedAreas. Keep the implementation human-approved and bounded to ProjectFlow, but do not reduce a powerful supported mutation to a superficial label or tooltip. Return only the requested structured output.`;

export class EvidenceReasoningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceReasoningError';
  }
}

const canonicalStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const analysisCacheKey = (
  evidenceHash: string,
  model: string,
  repositorySourceHash = 'legacy',
  repositoryBaseSha = 'legacy',
) =>
  sha256(
    canonicalStringify({
      contextVersion: evolutionReasoningContextVersion,
      evidenceHash,
      model,
      promptVersion: evidencePromptVersion,
      repositoryBaseSha,
      repositorySourceHash,
    }),
  );

export function validateModelOutput(
  value: unknown,
  pack: EvidencePack,
): z.infer<typeof modelOutputSchema> {
  const output = modelOutputSchema.parse(value);
  const candidates = [output.selectedMutation, ...output.alternatives];
  const knownEvidence = new Set(
    pack.frictionSignals.map((signal) => signal.evidenceId),
  );
  const knownClusters = new Set(
    output.evidenceAssessment.pressureClusters.map((cluster) => cluster.id),
  );
  const knownTargets = new Set([
    ...pack.frictionSignals.flatMap((signal) =>
      signal.trace.flatMap((event) => (event.targetId ? [event.targetId] : [])),
    ),
    ...pack.journeys.flatMap((journey) =>
      journey.events.flatMap((event) =>
        event.targetId ? [event.targetId] : [],
      ),
    ),
  ]);
  const mutableAreas = new Set(pack.applicationMap.mutableAreas);
  const protectedAreas = new Set(pack.applicationMap.protectedAreas);

  for (const cluster of output.evidenceAssessment.pressureClusters) {
    if (cluster.evidenceIds.some((id) => !knownEvidence.has(id))) {
      throw new EvidenceReasoningError(
        `Pressure cluster ${cluster.id} cites an unknown evidence ID.`,
      );
    }
  }

  const pressureClusters = output.evidenceAssessment.pressureClusters.map(
    (cluster) => {
      const observedModelTargets = cluster.affectedTargets.filter((target) =>
        knownTargets.has(target),
      );
      const citedTraceTargets = pack.frictionSignals
        .filter((signal) => cluster.evidenceIds.includes(signal.evidenceId))
        .flatMap((signal) =>
          signal.trace.flatMap((event) =>
            event.targetId ? [event.targetId] : [],
          ),
        );
      return EvidencePressureClusterSchema.parse({
        ...cluster,
        affectedTargets: [
          ...new Set(
            observedModelTargets.length
              ? observedModelTargets
              : citedTraceTargets,
          ),
        ],
      });
    },
  );

  for (const candidate of candidates) {
    if (candidate.evidenceIds.some((id) => !knownEvidence.has(id))) {
      throw new EvidenceReasoningError(
        `Mutation ${candidate.id} cites an unknown evidence ID.`,
      );
    }
    if (candidate.pressureClusterIds.some((id) => !knownClusters.has(id))) {
      throw new EvidenceReasoningError(
        `Mutation ${candidate.id} cites an unknown pressure cluster.`,
      );
    }
    if (
      candidate.scope.some(
        (scope) => protectedAreas.has(scope) || !mutableAreas.has(scope),
      )
    ) {
      throw new EvidenceReasoningError(
        `Mutation ${candidate.id} exceeds the mutable application scope.`,
      );
    }
  }
  const normalized = candidates
    .map((candidate) => normalizeCandidateScore(candidate, pack))
    .sort((left, right) => right.scorecard.total - left.scorecard.total);
  const selectedMutation = normalized[0]!;
  const modelSelectionChanged =
    selectedMutation.id !== output.selectedMutation.id;
  return {
    ...output,
    evidenceAssessment: {
      ...output.evidenceAssessment,
      pressureClusters,
      selectionRationale: modelSelectionChanged
        ? `${selectedMutation.title} ranked highest after Darwin normalized evidence recurrence and portfolio scores. ${output.evidenceAssessment.selectionRationale}`
        : output.evidenceAssessment.selectionRationale,
    },
    selectedMutation,
    alternatives: normalized.slice(1),
  };
}

function normalizeCandidateScore(
  candidate: EvidenceMutationCandidate,
  pack: EvidencePack,
): EvidenceMutationCandidate {
  const citedSignals = pack.frictionSignals.filter((signal) =>
    candidate.evidenceIds.includes(signal.evidenceId),
  );
  const recurrence = citedSignals.length
    ? citedSignals.reduce(
        (total, signal) =>
          total +
          Math.min(30, signal.support.events * 6) +
          Math.min(25, signal.support.sessions * 12) +
          Math.min(25, signal.support.participants * 12) +
          Math.min(20, signal.support.attempts * 10),
        0,
      ) / citedSignals.length
    : 0;
  const evidenceStrength = Math.min(
    pack.quality.score,
    pack.quality.dimensions.weakestScore,
    Math.round(recurrence),
  );
  const modelDimensions = [
    candidate.scorecard.userImpact,
    candidate.scorecard.feasibility,
    candidate.scorecard.validationClarity,
  ];
  const scale = modelDimensions.every((score) => score <= 5) ? 20 : 1;
  const userImpact = candidate.scorecard.userImpact * scale;
  const feasibility = candidate.scorecard.feasibility * scale;
  const validationClarity = candidate.scorecard.validationClarity * scale;
  const total = Math.round(
    evidenceStrength * 0.35 +
      userImpact * 0.25 +
      feasibility * 0.2 +
      validationClarity * 0.2,
  );
  return EvidenceMutationCandidateSchema.parse({
    ...candidate,
    confidence: evidenceStrength / 100,
    scorecard: {
      ...candidate.scorecard,
      evidenceStrength,
      userImpact,
      feasibility,
      validationClarity,
      total,
    },
  });
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

async function callOpenAI(
  pack: EvidencePack,
  apiKey: string,
  model: string,
  timeoutMs: number,
  fetcher: typeof fetch,
  repositorySnapshot?: RepositorySnapshot,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        prompt_cache_key: `darwin-${evolutionReasoningContextVersion}-${repositorySnapshot?.context.sourceHash.slice(0, 12) ?? 'legacy'}`,
        prompt_cache_retention: '24h',
        reasoning: { effort: 'none' },
        input: [
          { role: 'system', content: evidenceAnalysisSystemPrompt },
          { role: 'developer', content: evolutionReasoningContext },
          ...(repositorySnapshot
            ? [
                {
                  role: 'developer' as const,
                  content: repositorySnapshot.developerContext,
                },
              ]
            : []),
          {
            role: 'user',
            content: JSON.stringify({
              evidenceHash: pack.evidenceHash,
              evidenceClass: pack.evidenceClass,
              evidenceQuality: pack.quality,
              taskSummaries: pack.tasks,
              frictionSignals: pack.frictionSignals,
              orderedJourneys: pack.journeys,
              applicationMap: pack.applicationMap,
            }),
          },
        ],
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'darwin_evidence_analysis',
            schema: evidenceAnalysisJsonSchema,
            strict: true,
          },
        },
        max_output_tokens: 3_500,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new EvidenceReasoningError(
        `OpenAI Responses API returned HTTP ${response.status}.`,
      );
    }
    const payload = (await response.json()) as {
      usage?: { input_tokens_details?: { cached_tokens?: number } };
    };
    const text = responseText(payload);
    if (!text) throw new EvidenceReasoningError('OpenAI returned no output.');
    return {
      output: JSON.parse(text) as unknown,
      cachedTokens: payload.usage?.input_tokens_details?.cached_tokens,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface EvidenceAnalysisOptions {
  requestedMode?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  createdAt?: string;
  repositorySnapshot?: RepositorySnapshot;
}

export async function analyseEvidence(
  pack: EvidencePack,
  options: EvidenceAnalysisOptions = {},
): Promise<EvidenceAnalysis> {
  const model = options.model || 'gpt-5.6';
  const repositorySourceHash =
    options.repositorySnapshot?.context.sourceHash ?? 'legacy';
  const repositoryBaseSha =
    options.repositorySnapshot?.context.baseSha ?? 'legacy';
  const cacheKey = await analysisCacheKey(
    pack.evidenceHash,
    model,
    repositorySourceHash,
    repositoryBaseSha,
  );
  const promptCacheKey = `darwin-${evolutionReasoningContextVersion}-${repositorySourceHash.slice(0, 12)}`;
  if (options.requestedMode !== 'live' || !options.apiKey) {
    throw new EvidenceReasoningError(
      'Live GPT reasoning is unavailable. Darwin will not substitute a recommendation.',
    );
  }
  let liveResult: Awaited<ReturnType<typeof callOpenAI>>;
  try {
    liveResult = await callOpenAI(
      pack,
      options.apiKey,
      model,
      options.timeoutMs ?? 30_000,
      options.fetch ?? fetch,
      options.repositorySnapshot,
    );
  } catch (error) {
    if (error instanceof EvidenceReasoningError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new EvidenceReasoningError(
        'Live GPT reasoning timed out; no recommendation was generated.',
      );
    }
    throw new EvidenceReasoningError(
      'Live GPT reasoning failed; no recommendation was generated.',
    );
  }
  let validated: ReturnType<typeof validateModelOutput>;
  try {
    validated = validateModelOutput(liveResult.output, pack);
  } catch (error) {
    if (error instanceof EvidenceReasoningError) throw error;
    throw new EvidenceReasoningError(
      'GPT returned an invalid structured analysis; no recommendation was generated.',
    );
  }

  return EvidenceAnalysisSchema.parse({
    analysisId: `analysis-${cacheKey.slice(0, 12)}`,
    evidenceId: pack.evidenceId,
    evidenceHash: pack.evidenceHash,
    cacheKey,
    promptVersion: evidencePromptVersion,
    mode: 'live',
    model,
    promptCache: {
      key: promptCacheKey,
      contextVersion: `${evolutionReasoningContextVersion}:${repositorySourceHash.slice(0, 16)}`,
      retention: '24h' as const,
      ...(liveResult.cachedTokens === undefined
        ? {}
        : { cachedTokens: liveResult.cachedTokens }),
    },
    createdAt: options.createdAt ?? new Date().toISOString(),
    ...(options.repositorySnapshot
      ? { repository: options.repositorySnapshot.context }
      : {}),
    evidenceAssessment: {
      ...validated.evidenceAssessment,
      quality: pack.quality,
    },
    selectedMutation: validated.selectedMutation,
    alternatives: validated.alternatives,
    unsupportedIdeasRejected: validated.unsupportedIdeasRejected,
  });
}

export async function buildCodexManifest(
  analysis: EvidenceAnalysis,
  repositoryCommit: string,
  createdAt = new Date().toISOString(),
  mutationSelection:
    | EvidenceMutationCandidate
    | EvidenceMutationCandidate[] = analysis.selectedMutation,
): Promise<CodexImplementationManifest> {
  const mutations = Array.isArray(mutationSelection)
    ? mutationSelection
    : [mutationSelection];
  const mutationIds = mutations.map((mutation) => mutation.id);
  const brief =
    mutations.length === 1
      ? mutations[0]!.codexBrief
      : mutations
          .map(
            (mutation, index) =>
              `${index + 1}. ${mutation.title}\n${mutation.codexBrief}`,
          )
          .join('\n\n');
  const payload = {
    analysisId: analysis.analysisId,
    mutationId: mutationIds[0]!,
    mutationIds,
    evidenceHash: analysis.evidenceHash,
    promptVersion: evidencePromptVersion,
    repositoryCommit: analysis.repository?.baseSha ?? repositoryCommit,
    ...(analysis.repository ? { repository: analysis.repository } : {}),
    brief,
    evidenceCitations: [
      ...new Set(mutations.flatMap((mutation) => mutation.evidenceIds)),
    ],
    allowedPaths: analysis.repository?.mutablePaths ?? [...codexAllowedPaths],
    protectedPaths: analysis.repository?.protectedPaths ?? [
      ...codexProtectedPaths,
    ],
    acceptanceCriteria: [
      ...new Set(mutations.flatMap((mutation) => mutation.acceptanceCriteria)),
    ],
    validationCommands: analysis.repository?.validationCommands ?? [
      'npm run typecheck',
      'npm run test',
      'npm run build',
    ],
  };
  const manifestHash = await sha256(canonicalStringify(payload));
  return CodexImplementationManifestSchema.parse({
    manifestId: `manifest-${manifestHash.slice(0, 12)}`,
    manifestHash,
    createdAt,
    ...payload,
  });
}

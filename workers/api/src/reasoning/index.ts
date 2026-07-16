import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidenceMutationCandidateSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
} from '@darwin/shared';
import { z } from 'zod';

export const evidencePromptVersion = '1.0.0' as const;
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

const modelOutputSchema = z.object({
  selectedMutation: EvidenceMutationCandidateSchema,
  alternatives: z.array(EvidenceMutationCandidateSchema).max(2),
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
    scope: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    acceptanceCriteria: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    codexBrief: { type: 'string', minLength: 1 },
  },
  required: [
    'id',
    'title',
    'problem',
    'evidenceIds',
    'hypothesis',
    'change',
    'predictedImpact',
    'confidence',
    'scope',
    'acceptanceCriteria',
    'codexBrief',
  ],
  additionalProperties: false,
} as const;

export const evidenceAnalysisJsonSchema = {
  type: 'object',
  properties: {
    selectedMutation: candidateJsonSchema,
    alternatives: {
      type: 'array',
      maxItems: 2,
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
  required: ['selectedMutation', 'alternatives', 'unsupportedIdeasRejected'],
  additionalProperties: false,
} as const;

export const evidenceAnalysisSystemPrompt = `You are Darwin's evidence analyst. Propose one selected mutation and no more than two alternatives for ProjectFlow.

First understand the supplied product, active variant, interface inventory, domain entities, user goals, and available capabilities. Use that application context to interpret the evidence, but make behavioral claims only from supplied evidence signals and cite their evidence IDs. Every scope value must come from mutableAreas. Never target protectedAreas. Keep changes small, testable, and human-approved. Predictions are hypotheses, not measured outcomes. The Codex brief must contain implementation intent and acceptance criteria, never raw telemetry or personal identifiers. Return only the requested structured output.`;

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

export const analysisCacheKey = (evidenceHash: string, model: string) =>
  sha256(
    canonicalStringify({
      evidenceHash,
      model,
      promptVersion: evidencePromptVersion,
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
  const mutableAreas = new Set(pack.applicationMap.mutableAreas);
  const protectedAreas = new Set(pack.applicationMap.protectedAreas);

  for (const candidate of candidates) {
    if (candidate.evidenceIds.some((id) => !knownEvidence.has(id))) {
      throw new EvidenceReasoningError(
        `Mutation ${candidate.id} cites an unknown evidence ID.`,
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
  return output;
}

const mockOutput = (pack: EvidencePack) => {
  const primary = pack.frictionSignals[0];
  if (!primary) {
    throw new EvidenceReasoningError(
      'Evidence analysis requires at least one friction signal.',
    );
  }
  const evidenceIds = [primary.evidenceId];
  return {
    selectedMutation: {
      id: 'promote-task-discovery',
      title: 'Promote task discovery',
      problem: primary.summary,
      evidenceIds,
      hypothesis:
        'A direct My Work entry point and global search will reduce the path required to find assigned work.',
      change:
        'Promote My Work in primary navigation and expose task search in the global header.',
      predictedImpact: {
        metric: 'navigation efficiency',
        direction: 'increase' as const,
        rationale:
          'The selected path removes intermediate project and task-list navigation.',
      },
      confidence: 0.82,
      scope: ['navigation', 'search', 'task-discovery'],
      acceptanceCriteria: [
        'Assigned tasks are reachable directly from My Work.',
        'Task search is available without first opening the Tasks page.',
        'The baseline workflow remains available behind the variant switch.',
      ],
      codexBrief:
        'Implement the evolved ProjectFlow variant by adding My Work to primary navigation and global task search. Preserve the baseline variant and existing telemetry semantics. Add focused tests for both paths.',
    },
    alternatives: [
      {
        id: 'task-quick-create',
        title: 'Add global task creation',
        problem: primary.summary,
        evidenceIds,
        hypothesis:
          'A global creation action may reduce navigation before task entry.',
        change:
          'Expose a compact task creation action in the application header.',
        predictedImpact: {
          metric: 'task duration',
          direction: 'decrease' as const,
          rationale:
            'The action removes route changes before opening task entry.',
        },
        confidence: 0.61,
        scope: ['navigation'],
        acceptanceCriteria: ['Task creation opens from every primary route.'],
        codexBrief:
          'Add a globally reachable task creation action while preserving current validation and telemetry targets.',
      },
    ],
    unsupportedIdeasRejected: [
      {
        idea: 'Rewrite the telemetry pipeline',
        reason:
          'Telemetry history is protected and the evidence supports a navigation mutation, not an instrumentation change.',
      },
    ],
  };
};

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
        input: [
          { role: 'system', content: evidenceAnalysisSystemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              evidenceHash: pack.evidenceHash,
              evidenceClass: pack.evidenceClass,
              taskSummaries: pack.tasks,
              frictionSignals: pack.frictionSignals,
              applicationMap: pack.applicationMap,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'darwin_evidence_analysis',
            schema: evidenceAnalysisJsonSchema,
            strict: true,
          },
        },
        max_output_tokens: 2_400,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new EvidenceReasoningError(
        `OpenAI Responses API returned HTTP ${response.status}.`,
      );
    }
    const text = responseText(await response.json());
    if (!text) throw new EvidenceReasoningError('OpenAI returned no output.');
    return JSON.parse(text) as unknown;
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
}

export async function analyseEvidence(
  pack: EvidencePack,
  options: EvidenceAnalysisOptions = {},
): Promise<EvidenceAnalysis> {
  const model = options.model || 'gpt-5.6';
  const cacheKey = await analysisCacheKey(pack.evidenceHash, model);
  let mode: EvidenceAnalysis['mode'] = 'mock';
  let output: unknown;

  if (options.requestedMode === 'live' && options.apiKey) {
    try {
      output = await callOpenAI(
        pack,
        options.apiKey,
        model,
        options.timeoutMs ?? 12_000,
        options.fetch ?? fetch,
      );
      mode = 'live';
    } catch {
      output = mockOutput(pack);
      mode = 'fallback';
    }
  } else {
    output = mockOutput(pack);
    mode = options.requestedMode === 'live' ? 'fallback' : 'mock';
  }

  const validated = validateModelOutput(output, pack);
  return EvidenceAnalysisSchema.parse({
    analysisId: `analysis-${cacheKey.slice(0, 12)}`,
    evidenceId: pack.evidenceId,
    evidenceHash: pack.evidenceHash,
    cacheKey,
    promptVersion: evidencePromptVersion,
    mode,
    model,
    createdAt: options.createdAt ?? new Date().toISOString(),
    ...validated,
  });
}

export async function buildCodexManifest(
  analysis: EvidenceAnalysis,
  repositoryCommit: string,
  createdAt = new Date().toISOString(),
): Promise<CodexImplementationManifest> {
  const payload = {
    analysisId: analysis.analysisId,
    mutationId: analysis.selectedMutation.id,
    evidenceHash: analysis.evidenceHash,
    promptVersion: evidencePromptVersion,
    repositoryCommit,
    brief: analysis.selectedMutation.codexBrief,
    evidenceCitations: analysis.selectedMutation.evidenceIds,
    allowedPaths: [...codexAllowedPaths],
    protectedPaths: [...codexProtectedPaths],
    acceptanceCriteria: analysis.selectedMutation.acceptanceCriteria,
    validationCommands: ['npm run typecheck', 'npm run test', 'npm run build'],
  };
  const manifestHash = await sha256(canonicalStringify(payload));
  return CodexImplementationManifestSchema.parse({
    manifestId: `manifest-${manifestHash.slice(0, 12)}`,
    manifestHash,
    createdAt,
    ...payload,
  });
}

import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidenceMutationCandidateSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidenceMutationCandidate,
  type EvidencePack,
} from '@darwin/shared';
import { z } from 'zod';

import {
  projectFlowReasoningContext,
  projectFlowReasoningContextVersion,
} from './generated-context';

export const evidencePromptVersion = '1.1.0' as const;
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

First understand the supplied product, active variant, interface inventory, domain entities, user goals, and available capabilities. Use that application context to interpret the evidence, but make behavioral claims only from supplied evidence signals and cite their evidence IDs.

Use these evidence-to-remediation priors when the corresponding signal is strongest:
- hover_hesitation: expose useful contextual stats or detail on that exact item on hover and keyboard focus;
- drag_expectation: make that exact item draggable with an accessible equivalent when the domain permits reordering;
- false_affordance: make the clicked surface navigate to the most useful related destination;
- browser_back_dependency: add a visible in-app Back control on the affected nested route;
- zoom_readability: increase base and compact-label font sizes while preserving responsive layout.

Every scope value must come from mutableAreas. Never target protectedAreas. Keep changes small, target-specific, testable, and human-approved. Predictions are hypotheses, not measured outcomes. The Codex brief must contain implementation intent and acceptance criteria, never raw telemetry or personal identifiers. Return only the requested structured output.`;

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

const targetedBehaviorMutation = (
  pack: EvidencePack,
): EvidenceMutationCandidate | null => {
  const primary = pack.frictionSignals[0];
  if (!primary) return null;
  const target = primary.trace.find((event) => event.targetId)?.targetId;
  const item = target ?? 'the affected item';
  const evidenceIds = [primary.evidenceId];
  const shared = { problem: primary.summary, evidenceIds };

  switch (primary.ruleId) {
    case 'hover_hesitation':
      return {
        ...shared,
        id: 'show-item-hover-context',
        title: `Show contextual stats for ${item}`,
        hypothesis:
          'Useful item-level detail on hover and keyboard focus will turn consideration into informed action.',
        change: `Expose contextual stats and relevant status directly on ${item} during hover and keyboard focus.`,
        predictedImpact: {
          metric: 'feature discovery',
          direction: 'increase',
          rationale:
            'The user can evaluate the item without guessing what it contains or leaving the current context.',
        },
        confidence: 0.78,
        scope: ['item-presentation', 'contextual-help'],
        acceptanceCriteria: [
          `${item} exposes useful contextual stats on hover and keyboard focus.`,
          'The detail surface does not shift surrounding layout or obscure the item action.',
          'The existing semantic telemetry target remains stable.',
        ],
        codexBrief: `Add a compact contextual stats surface to ${item} for hover and keyboard focus. Keep it accessible, responsive, and bound to the existing semantic target. Add focused interaction tests.`,
      };
    case 'drag_expectation':
      return {
        ...shared,
        id: 'enable-item-dragging',
        title: `Make ${item} draggable`,
        hypothesis:
          'Supporting the observed drag expectation will make item organization match the user’s interaction model.',
        change: `Make ${item} draggable with an explicit handle, reorder behavior, and an equivalent keyboard action.`,
        predictedImpact: {
          metric: 'interaction efficiency',
          direction: 'increase',
          rationale:
            'The attempted direct manipulation becomes a supported action instead of a dead gesture.',
        },
        confidence: 0.8,
        scope: ['interaction-behavior', 'drag-and-drop'],
        acceptanceCriteria: [
          `${item} can be reordered with pointer drag-and-drop.`,
          'A keyboard-accessible reorder action produces the same result.',
          'Drag state is visibly communicated and the new order is retained.',
        ],
        codexBrief: `Implement accessible drag-and-drop reordering for ${item}, including a visible handle, keyboard equivalent, retained ordering, semantic telemetry, and focused tests.`,
      };
    case 'false_affordance':
      return {
        ...shared,
        id: 'activate-false-affordance',
        title: `Make ${item} lead somewhere useful`,
        hypothesis:
          'Routing the clicked surface to its most relevant detail view will satisfy the action users already expect.',
        change: `Make ${item} an accessible link or button that opens the most useful related ProjectFlow destination.`,
        predictedImpact: {
          metric: 'navigation efficiency',
          direction: 'increase',
          rationale:
            'A currently dead click becomes a direct route to relevant work.',
        },
        confidence: 0.84,
        scope: ['navigation', 'interaction-behavior'],
        acceptanceCriteria: [
          `${item} opens the most relevant related route on click or keyboard activation.`,
          'Its visual affordance and accessible role accurately communicate the action.',
          'The destination preserves a clear route back to the originating context.',
        ],
        codexBrief: `Convert ${item} into a useful accessible navigation action. Choose the closest related ProjectFlow route from the supplied application map, retain its semantic target, and add click and keyboard tests.`,
      };
    case 'browser_back_dependency':
      return {
        ...shared,
        id: 'add-in-app-back-control',
        title: 'Add an in-app Back control',
        hypothesis:
          'A visible contextual Back control will reduce dependence on browser history for returning from nested work.',
        change:
          'Add a Back control to nested ProjectFlow routes that returns to the previous meaningful in-app view.',
        predictedImpact: {
          metric: 'navigation efficiency',
          direction: 'increase',
          rationale:
            'Return navigation becomes visible, predictable, and available inside the application.',
        },
        confidence: 0.86,
        scope: ['navigation', 'in-app-history'],
        acceptanceCriteria: [
          'Nested project and task routes expose a visible Back control.',
          'The control returns to the previous meaningful ProjectFlow view without leaving the application.',
          'Browser Back and the in-app control preserve coherent route history.',
        ],
        codexBrief:
          'Add an accessible in-app Back control to nested ProjectFlow views using the existing history state. Preserve browser Back behavior, emit semantic telemetry, and test both navigation paths.',
      };
    case 'zoom_readability':
      return {
        ...shared,
        id: 'increase-interface-type-scale',
        title: 'Increase interface font sizes',
        hypothesis:
          'A larger default type scale will reduce the need for users to increase browser zoom to read compact interface text.',
        change:
          'Increase base text, compact labels, metadata, and control font sizes while preserving information hierarchy.',
        predictedImpact: {
          metric: 'readability',
          direction: 'increase',
          rationale:
            'Frequently read interface text becomes legible at the default browser zoom.',
        },
        confidence: 0.76,
        scope: ['typography', 'item-presentation'],
        acceptanceCriteria: [
          'Base body text and compact metadata use a larger documented minimum size.',
          'Controls and labels remain unclipped at mobile widths and 200% browser zoom.',
          'Heading hierarchy and dense data layouts remain scannable.',
        ],
        codexBrief:
          'Raise the ProjectFlow base and compact-label type scale, then adjust spacing where required. Verify mobile layouts and 200% browser zoom with focused visual and overflow tests.',
      };
    default:
      return null;
  }
};

const mockOutput = (pack: EvidencePack) => {
  const primary = pack.frictionSignals[0];
  if (!primary) {
    throw new EvidenceReasoningError(
      'Evidence analysis requires at least one friction signal.',
    );
  }
  const targeted = targetedBehaviorMutation(pack);
  const evidenceIds = [primary.evidenceId];
  return {
    selectedMutation: targeted ?? {
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
    alternatives: targeted
      ? []
      : [
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
            acceptanceCriteria: [
              'Task creation opens from every primary route.',
            ],
            codexBrief:
              'Add a globally reachable task creation action while preserving current validation and telemetry targets.',
          },
        ],
    unsupportedIdeasRejected: [
      {
        idea: 'Rewrite the telemetry pipeline',
        reason:
          'Telemetry history is protected; the selected mutation stays inside the target application.',
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
        prompt_cache_key: `darwin-${projectFlowReasoningContextVersion}`,
        prompt_cache_retention: '24h',
        input: [
          { role: 'system', content: evidenceAnalysisSystemPrompt },
          { role: 'developer', content: projectFlowReasoningContext },
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
}

export async function analyseEvidence(
  pack: EvidencePack,
  options: EvidenceAnalysisOptions = {},
): Promise<EvidenceAnalysis> {
  const model = options.model || 'gpt-5.6';
  const cacheKey = await analysisCacheKey(pack.evidenceHash, model);
  let mode: EvidenceAnalysis['mode'] = 'mock';
  let output: unknown;
  let validated: z.infer<typeof modelOutputSchema>;
  let fallbackReason: string | undefined;
  let cachedTokens: number | undefined;
  const promptCacheKey = `darwin-${projectFlowReasoningContextVersion}`;

  if (options.requestedMode === 'live' && options.apiKey) {
    try {
      const liveResult = await callOpenAI(
        pack,
        options.apiKey,
        model,
        options.timeoutMs ?? 12_000,
        options.fetch ?? fetch,
      );
      output = liveResult.output;
      cachedTokens = liveResult.cachedTokens;
      validated = validateModelOutput(output, pack);
      mode = 'live';
    } catch (error) {
      output = mockOutput(pack);
      validated = validateModelOutput(output, pack);
      mode = 'fallback';
      fallbackReason =
        error instanceof EvidenceReasoningError
          ? error.message.slice(0, 240)
          : error instanceof Error && error.name === 'AbortError'
            ? 'OpenAI Responses API request timed out.'
            : 'OpenAI returned an invalid structured evidence analysis.';
    }
  } else {
    output = mockOutput(pack);
    validated = validateModelOutput(output, pack);
    mode = options.requestedMode === 'live' ? 'fallback' : 'mock';
    if (mode === 'fallback') {
      fallbackReason = 'Live analysis was requested without an API key.';
    }
  }

  return EvidenceAnalysisSchema.parse({
    analysisId: `analysis-${cacheKey.slice(0, 12)}`,
    evidenceId: pack.evidenceId,
    evidenceHash: pack.evidenceHash,
    cacheKey,
    promptVersion: evidencePromptVersion,
    mode,
    ...(fallbackReason ? { fallbackReason } : {}),
    model,
    ...(options.requestedMode === 'live'
      ? {
          promptCache: {
            key: promptCacheKey,
            contextVersion: projectFlowReasoningContextVersion,
            retention: '24h' as const,
            ...(cachedTokens === undefined ? {} : { cachedTokens }),
          },
        }
      : {}),
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

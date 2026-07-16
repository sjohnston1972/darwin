import { EvidencePackSchema } from '@darwin/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  EvidenceReasoningError,
  analyseEvidence,
  buildCodexManifest,
  validateModelOutput,
} from '.';

const pack = EvidencePackSchema.parse({
  evidenceId: 'evidence-test',
  evidenceHash: 'a'.repeat(64),
  generatedAt: '2026-07-16T12:00:00.000Z',
  parserVersion: '1.0.0',
  evidenceClass: 'measured',
  study: {
    studyId: 'projectflow-baseline-study',
    appVersion: '1.0.0',
    sourceEventCount: 8,
    participants: 1,
    sessions: 1,
    attempts: 1,
  },
  taskAttempts: [],
  tasks: [],
  frictionSignals: [
    {
      evidenceId: 'EV-001',
      ruleId: 'excess_path_length',
      ruleVersion: '1.0.0',
      severity: 'high',
      taskId: 'find-assigned-task',
      summary: 'Finding assigned work required seven interactions.',
      affectedAttemptIds: ['attempt-test'],
      supportingEventIds: ['00000000-0000-4000-8000-000000000001'],
      trace: [
        {
          eventId: '00000000-0000-4000-8000-000000000001',
          sequence: 1,
          eventType: 'element_clicked',
          route: '/study/dashboard',
          targetId: 'nav-projects',
        },
      ],
    },
  ],
  applicationMap: {
    product: {
      name: 'ProjectFlow',
      purpose: 'Project management workspace.',
      primaryUser: 'Knowledge worker.',
      domainEntities: ['project', 'task', 'user'],
      primaryGoals: ['find assigned work'],
    },
    activeVariant: {
      name: 'baseline',
      version: '1.0.0',
      navigation: ['Dashboard', 'Projects', 'Reports', 'Settings'],
      capabilities: ['project-scoped task search'],
    },
    interfaceInventory: [
      {
        area: 'task-discovery',
        purpose: 'Find assigned work.',
        primaryActions: ['open task'],
      },
    ],
    routes: ['/study/dashboard'],
    mutableAreas: [
      'navigation',
      'search',
      'task-discovery',
      'item-presentation',
      'contextual-help',
      'interaction-behavior',
      'drag-and-drop',
      'in-app-history',
      'typography',
    ],
    protectedAreas: ['telemetry-history', 'authentication', 'database-schema'],
  },
});

const candidate = {
  id: 'mutation-test',
  title: 'Promote My Work',
  problem: 'Assigned work takes too many interactions to reach.',
  evidenceIds: ['EV-001'],
  hypothesis: 'A direct route will improve discovery.',
  change: 'Add My Work to primary navigation.',
  predictedImpact: {
    metric: 'navigation efficiency',
    direction: 'increase' as const,
    rationale: 'It removes intermediate routes.',
  },
  confidence: 0.8,
  scope: ['navigation'],
  acceptanceCriteria: ['My Work is directly reachable.'],
  codexBrief: 'Add My Work while preserving baseline behavior.',
};

const behaviorPack = (
  ruleId:
    | 'hover_hesitation'
    | 'drag_expectation'
    | 'false_affordance'
    | 'browser_back_dependency'
    | 'zoom_readability',
) =>
  EvidencePackSchema.parse({
    ...pack,
    frictionSignals: [
      {
        ...pack.frictionSignals[0],
        ruleId,
        ruleVersion: '1.1.0',
        summary: `Observed ${ruleId} on task-card-apl-241.`,
        trace: [
          {
            ...pack.frictionSignals[0]!.trace[0],
            targetId:
              ruleId === 'browser_back_dependency' ||
              ruleId === 'zoom_readability'
                ? undefined
                : 'task-card-apl-241',
          },
        ],
      },
    ],
  });

describe('evidence-backed reasoning', () => {
  it('rejects unknown evidence citations and protected scope', () => {
    expect(() =>
      validateModelOutput(
        {
          selectedMutation: { ...candidate, evidenceIds: ['EV-999'] },
          alternatives: [],
          unsupportedIdeasRejected: [],
        },
        pack,
      ),
    ).toThrow(EvidenceReasoningError);

    expect(() =>
      validateModelOutput(
        {
          selectedMutation: { ...candidate, scope: ['telemetry-history'] },
          alternatives: [],
          unsupportedIdeasRejected: [],
        },
        pack,
      ),
    ).toThrow('exceeds the mutable application scope');
  });

  it('uses one structured OpenAI call and validates its citations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp-test',
          output_text: JSON.stringify({
            selectedMutation: candidate,
            alternatives: [],
            unsupportedIdeasRejected: [],
          }),
          usage: { input_tokens_details: { cached_tokens: 12_288 } },
        }),
        { status: 200 },
      ),
    );

    const analysis = await analyseEvidence(pack, {
      requestedMode: 'live',
      apiKey: 'test-key',
      model: 'gpt-5.6',
      fetch: fetcher,
      createdAt: '2026-07-16T12:01:00.000Z',
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(analysis.mode).toBe('live');
    expect(analysis.selectedMutation.evidenceIds).toEqual(['EV-001']);
    expect(analysis.promptCache).toMatchObject({
      retention: '24h',
      cachedTokens: 12_288,
    });
    const requestBody = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as {
      prompt_cache_key?: string;
      prompt_cache_retention?: string;
      input?: Array<{ role?: string; content?: string }>;
    };
    expect(requestBody.prompt_cache_key).toMatch(/^darwin-ctx-/);
    expect(requestBody.prompt_cache_retention).toBe('24h');
    expect(requestBody.input?.[1]).toMatchObject({ role: 'developer' });
    expect(requestBody.input?.[1]?.content).toContain(
      'Darwin Telemetry-to-Evolution Examples',
    );
    expect(requestBody.input?.[1]?.content).toContain(
      'Source: apps/projectflow/src/App.tsx',
    );
    expect(JSON.stringify(requestBody)).not.toContain(
      'participant-evidence-record',
    );
  });

  it('exposes a sanitized live fallback reason and retains a valid proposal', async () => {
    const analysis = await analyseEvidence(pack, {
      requestedMode: 'live',
      apiKey: 'test-key',
      model: 'gpt-5.6',
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 503 })),
      createdAt: '2026-07-16T12:01:00.000Z',
    });

    expect(analysis).toMatchObject({
      mode: 'fallback',
      fallbackReason: 'OpenAI Responses API returned HTTP 503.',
      selectedMutation: { id: 'promote-task-discovery' },
    });
    expect(JSON.stringify(analysis)).not.toContain('test-key');
  });

  it.each([
    ['hover_hesitation', 'show-item-hover-context', 'contextual stats'],
    ['drag_expectation', 'enable-item-dragging', 'draggable'],
    ['false_affordance', 'activate-false-affordance', 'most useful'],
    ['browser_back_dependency', 'add-in-app-back-control', 'Back control'],
    ['zoom_readability', 'increase-interface-type-scale', 'font sizes'],
  ] as const)(
    'maps %s evidence to the targeted %s mutation',
    async (ruleId, mutationId, expectedChange) => {
      const analysis = await analyseEvidence(behaviorPack(ruleId), {
        createdAt: '2026-07-16T12:01:00.000Z',
      });

      expect(analysis.mode).toBe('mock');
      expect(analysis.selectedMutation.id).toBe(mutationId);
      expect(analysis.selectedMutation.change).toContain(expectedChange);
      expect(analysis.selectedMutation.evidenceIds).toEqual(['EV-001']);
    },
  );

  it('builds a stable, raw-telemetry-free Codex manifest', async () => {
    const analysis = await analyseEvidence(pack, {
      createdAt: '2026-07-16T12:01:00.000Z',
    });
    const first = await buildCodexManifest(
      analysis,
      'c75e37d',
      '2026-07-16T12:02:00.000Z',
    );
    const second = await buildCodexManifest(
      analysis,
      'c75e37d',
      '2026-07-16T13:02:00.000Z',
    );
    const serialized = JSON.stringify(first);

    expect(first.manifestHash).toBe(second.manifestHash);
    expect(serialized).not.toContain('participantId');
    expect(serialized).not.toContain('sessionId');
    expect(serialized).not.toContain('trace');
    expect(first.protectedPaths).toContain('workers/api/src/evidence/**');
  });
});

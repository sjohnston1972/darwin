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
    routes: ['/study/dashboard'],
    mutableAreas: ['navigation', 'search', 'task-discovery'],
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
    expect(fetcher.mock.calls[0]?.[1]?.body).not.toContain('participantId');
  });

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

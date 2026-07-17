import { EvidencePackSchema } from '@darwin/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  EvidenceReasoningError,
  analysisCacheKey,
  analyseEvidence,
  buildCodexManifest,
  validateModelOutput,
} from '.';
import type { RepositorySnapshot } from '../repository/github-source';

const eventId = '00000000-0000-4000-8000-000000000001';
const quality = {
  strength: 'directional' as const,
  score: 60,
  eventCount: 80,
  sessionCount: 1,
  participantCount: 1,
  completedAttemptCount: 1,
  limitations: [
    'Fewer than three independent sessions were observed.',
    'Fewer than three anonymous participants were observed.',
  ],
};
const pack = EvidencePackSchema.parse({
  evidenceId: 'evidence-test',
  evidenceHash: 'a'.repeat(64),
  generatedAt: '2026-07-16T12:00:00.000Z',
  parserVersion: '1.2.0',
  evidenceClass: 'measured',
  study: {
    studyId: 'projectflow-baseline-study',
    appVersion: '1.0.0',
    sourceEventCount: 80,
    participants: 1,
    sessions: 1,
    attempts: 1,
  },
  taskAttempts: [],
  tasks: [],
  quality,
  journeys: [
    {
      journeyId: 'J-001',
      appVersion: '1.0.0',
      source: 'real_user',
      viewport: 'desktop',
      eventCount: 2,
      events: [
        {
          eventRef: 'E-001',
          sequence: 1,
          offsetMs: 0,
          eventType: 'element_clicked',
          route: '/study/dashboard',
          targetId: 'nav-projects',
          attributes: { pointerType: 'mouse' },
        },
        {
          eventRef: 'E-002',
          sequence: 2,
          offsetMs: 900,
          eventType: 'route_changed',
          route: '/study/projects',
          attributes: {},
        },
      ],
    },
  ],
  frictionSignals: [
    {
      evidenceId: 'EV-001',
      ruleId: 'excess_path_length',
      ruleVersion: '1.2.0',
      severity: 'high',
      taskId: 'find-assigned-task',
      summary: 'Finding assigned work required seven interactions.',
      affectedAttemptIds: ['attempt-test'],
      supportingEventIds: [eventId],
      trace: [
        {
          eventId,
          sequence: 1,
          eventType: 'element_clicked',
          route: '/study/dashboard',
          targetId: 'nav-projects',
        },
      ],
      support: { events: 4, attempts: 1, sessions: 1, participants: 1 },
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
    mutableAreas: ['navigation', 'search', 'task-discovery'],
    protectedAreas: ['telemetry-history', 'authentication'],
  },
});

const repositorySnapshot: RepositorySnapshot = {
  context: {
    owner: 'sjohnston1972',
    name: 'projectflow',
    fullName: 'sjohnston1972/projectflow',
    url: 'https://github.com/sjohnston1972/projectflow',
    branch: 'main',
    baseSha: 'b'.repeat(40),
    sourceHash: 'c'.repeat(64),
    capturedAt: '2026-07-16T12:00:30.000Z',
    mutablePaths: ['apps/projectflow/src/**'],
    protectedPaths: ['.github/**'],
    contextPaths: ['apps/projectflow/src/App.tsx'],
    validationCommands: ['npm run verify'],
    maximumChangedFiles: 8,
    maximumChangedLines: 700,
    productionUrl: 'https://darwin-projectflow.pages.dev/',
    studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
  },
  target: {
    targetId: 'projectflow',
    name: 'ProjectFlow',
    purpose: 'Project management workspace.',
    defaultBranch: 'main',
  },
  developerContext:
    '# Live ProjectFlow repository snapshot\n\nExact commit: ' +
    'b'.repeat(40) +
    '\n\n## apps/projectflow/src/App.tsx\n\n```\nexport function App() {}\n```',
};

const candidate = (id: string, score: number) => ({
  id,
  title: `Mutation ${id}`,
  problem: 'Assigned work takes too many interactions to reach.',
  evidenceIds: ['EV-001'],
  pressureClusterIds: ['task-discovery-pressure'],
  hypothesis: 'A direct route will improve discovery.',
  change: `Implement ${id} as a direct task-discovery capability.`,
  predictedImpact: {
    metric: 'navigation efficiency',
    direction: 'increase' as const,
    rationale: 'It removes intermediate routes.',
  },
  confidence: 0.99,
  scorecard: {
    evidenceStrength: 99,
    userImpact: score,
    feasibility: score,
    validationClarity: score,
    total: 99,
  },
  scope: ['navigation'],
  tradeoffs: ['Adds another persistent navigation choice.'],
  acceptanceCriteria: ['Assigned work is directly reachable.'],
  validationPlan: {
    primaryMetric: 'Median interactions to assigned task',
    baseline: 'Seven measured interactions',
    successThreshold: 'Four or fewer measured interactions',
    guardrails: ['Task completion rate does not decrease.'],
  },
  codexBrief: `Implement ${id} while preserving existing routes.`,
});

const modelOutput = {
  evidenceAssessment: {
    summary: 'The ordered journey shows repeated navigation before work.',
    pressureClusters: [
      {
        id: 'task-discovery-pressure',
        title: 'Assigned work is buried',
        interpretation: 'The current information architecture hides tasks.',
        evidenceIds: ['EV-001'],
        affectedTargets: ['nav-projects'],
        userConsequence: 'Users take a long route to assigned work.',
        competingExplanations: [
          'The participant may be unfamiliar with the app.',
        ],
        mutationOpportunity: 'Create a direct assigned-work destination.',
      },
    ],
    selectionRationale: 'The selected mutation has the clearest causal path.',
  },
  selectedMutation: candidate('direct-my-work', 90),
  alternatives: [
    candidate('dashboard-work-queue', 75),
    candidate('global-search', 70),
  ],
  unsupportedIdeasRejected: [
    { idea: 'Rewrite telemetry', reason: 'Telemetry is protected.' },
  ],
};

describe('evidence-backed reasoning v2', () => {
  it('invalidates analysis cache entries when the repository SHA changes', async () => {
    const sourceHash = 'a'.repeat(64);
    const first = await analysisCacheKey(
      pack.evidenceHash,
      'gpt-5.6',
      sourceHash,
      'b'.repeat(40),
    );
    const second = await analysisCacheKey(
      pack.evidenceHash,
      'gpt-5.6',
      sourceHash,
      'c'.repeat(40),
    );

    expect(second).not.toBe(first);
  });

  it('rejects invented evidence and scope while grounding target labels', () => {
    expect(() =>
      validateModelOutput(
        {
          ...modelOutput,
          selectedMutation: {
            ...modelOutput.selectedMutation,
            evidenceIds: ['EV-999'],
          },
        },
        pack,
      ),
    ).toThrow(EvidenceReasoningError);

    expect(() =>
      validateModelOutput(
        {
          ...modelOutput,
          selectedMutation: {
            ...modelOutput.selectedMutation,
            scope: ['telemetry-history'],
          },
        },
        pack,
      ),
    ).toThrow('exceeds the mutable application scope');

    const normalized = validateModelOutput(
      {
        ...modelOutput,
        evidenceAssessment: {
          ...modelOutput.evidenceAssessment,
          pressureClusters: [
            {
              ...modelOutput.evidenceAssessment.pressureClusters[0],
              affectedTargets: [
                'invented-control',
                '/study/projects/apollo',
                'Task row',
              ],
            },
          ],
        },
      },
      pack,
    );
    expect(
      normalized.evidenceAssessment.pressureClusters[0]?.affectedTargets,
    ).toEqual(['nav-projects']);
  });

  it('uses ordered journeys and returns an evidence-normalized portfolio', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp-test',
          output_text: JSON.stringify(modelOutput),
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
      repositorySnapshot,
    });

    expect(analysis.mode).toBe('live');
    expect(analysis.promptVersion).toBe('3.0.0');
    expect(analysis.repository).toEqual(repositorySnapshot.context);
    expect(analysis.alternatives).toHaveLength(2);
    expect(
      analysis.selectedMutation.scorecard.evidenceStrength,
    ).toBeLessThanOrEqual(quality.score);
    expect(analysis.selectedMutation.confidence).toBe(
      analysis.selectedMutation.scorecard.evidenceStrength / 100,
    );
    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(requestBody.reasoning).toEqual({ effort: 'none' });
    expect(requestBody.text.verbosity).toBe('low');
    expect(requestBody.max_output_tokens).toBe(3_500);
    expect(requestBody.prompt_cache_retention).toBe('24h');
    expect(requestBody.input[1].content).toContain(
      'Darwin Telemetry-to-Evolution Examples',
    );
    expect(requestBody.input[2].content).toContain(
      '# Live ProjectFlow repository snapshot',
    );
    expect(requestBody.input[3].content).toContain('orderedJourneys');
    expect(requestBody.input[3].content).toContain('offsetMs');
    expect(requestBody.prompt_cache_key).toContain(
      repositorySnapshot.context.sourceHash.slice(0, 12),
    );
  });

  it('normalizes a model-supplied five-point scorecard to percentages', () => {
    const fivePointCandidate = (id: string, score: number) => ({
      ...candidate(id, score),
      scorecard: {
        evidenceStrength: score,
        userImpact: score,
        feasibility: score,
        validationClarity: score,
        total: score,
      },
    });
    const normalized = validateModelOutput(
      {
        ...modelOutput,
        selectedMutation: fivePointCandidate('direct-my-work', 5),
        alternatives: [
          fivePointCandidate('dashboard-work-queue', 4),
          fivePointCandidate('global-search', 3),
        ],
      },
      pack,
    );

    expect(normalized.selectedMutation.scorecard).toMatchObject({
      userImpact: 100,
      feasibility: 100,
      validationClarity: 100,
    });
    expect(normalized.selectedMutation.scorecard.total).toBeGreaterThan(80);
  });

  it('fails closed without live GPT instead of returning a substitute mutation', async () => {
    await expect(analyseEvidence(pack)).rejects.toThrow(
      'will not substitute a recommendation',
    );
    await expect(
      analyseEvidence(pack, {
        requestedMode: 'live',
        apiKey: 'test-key',
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(null, { status: 503 })),
      }),
    ).rejects.toThrow('HTTP 503');
  });

  it('builds a stable raw-telemetry-free Codex manifest', async () => {
    const analysis = await analyseEvidence(pack, {
      requestedMode: 'live',
      apiKey: 'test-key',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({ output_text: JSON.stringify(modelOutput) }),
          {
            status: 200,
          },
        ),
      ),
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
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.mutationIds).toEqual([analysis.selectedMutation.id]);
    expect(JSON.stringify(first)).not.toContain('journeys');
    expect(first.protectedPaths).toContain('workers/api/src/evidence/**');
  });
});

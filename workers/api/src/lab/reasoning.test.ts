import {
  LabAgentDecisionRequestSchema,
  LabEvidencePackSchema,
  LabExperimentSchema,
} from '@darwin/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  LabReasoningError,
  analyseLabEvidence,
  decideLabAgentAction,
} from './reasoning';

const timestamp = '2026-07-18T10:00:00.000Z';
const taskHash = 'a'.repeat(64);
const provenance = {
  evidenceClass: 'darwin_lab' as const,
  label: 'Darwin Lab',
  labExperimentId: 'lab-exp-test',
  taskDefinitionId: 'lab-task-test',
  taskDefinitionHash: taskHash,
  evidencePackId: null,
  evidenceHash: null,
  runIds: [] as string[],
};
const decisionRequest = LabAgentDecisionRequestSchema.parse({
  experimentId: 'lab-exp-test',
  runId: 'lab-run-test',
  persona: 'novice',
  taskInstruction: 'Find everyone assigned to Project Apollo.',
  currentUrl: 'http://localhost:5174/',
  pageTitle: 'ProjectFlow',
  accessibilitySnapshot: '- button "Projects"',
  history: [],
  remainingActions: 12,
  elapsedMs: 500,
  viewport: 'desktop',
});

const experiment = LabExperimentSchema.parse({
  experimentId: 'lab-exp-test',
  studyId: 'projectflow-darwin-lab-test',
  name: 'Reasoning test',
  targetUrl: 'http://localhost:5174/',
  targetAppVersion: '1.0.0',
  task: {
    taskDefinitionId: 'lab-task-test',
    definitionVersion: 1,
    definitionHash: taskHash,
    taskId: 'find-apollo-assignees',
    name: 'Find Project Apollo assignees',
    instruction: 'Find everyone assigned to Project Apollo.',
    successDescription:
      'The agent identifies the complete Project Apollo assignment set.',
    startRoute: '/study/dashboard',
    successCriterion: {
      type: 'semantic_marker',
      markerId: 'apollo-assignees-complete',
    },
  },
  populationSize: 8,
  personaAllocation: [{ persona: 'novice', count: 8 }],
  maxActions: 12,
  maxDurationMs: 180_000,
  seed: 1859,
  status: 'completed',
  runnerId: 'lab-runner-test',
  createdAt: timestamp,
  startedAt: timestamp,
  completedAt: timestamp,
  runs: [],
  evidence: null,
  analysis: null,
  selection: null,
  error: null,
  evidenceError: null,
  archivedAt: null,
  version: 0,
  provenance,
});

const evidence = LabEvidencePackSchema.parse({
  evidencePackId: 'lab-pack-test',
  experimentId: experiment.experimentId,
  evidenceHash: 'a'.repeat(64),
  parserVersion: '1.0.0',
  evidenceClass: 'automated',
  provenance: {
    ...provenance,
    evidencePackId: 'lab-pack-test',
    evidenceHash: 'a'.repeat(64),
    runIds: ['lab-run-test'],
  },
  taskDefinitionId: 'lab-task-test',
  taskDefinitionHash: taskHash,
  generatedAt: timestamp,
  population: { planned: 8, completed: 8, successful: 2, abandoned: 2 },
  metrics: {
    completionRate: 0.25,
    medianActions: 10,
    medianDurationMs: 55_000,
    repeatedRouteRate: 0.5,
    searchFailureRate: 0.25,
  },
  signals: [
    {
      evidenceId: 'L-EV-001',
      detector: 'navigation_loop',
      severity: 'high',
      summary: 'Agents revisited the same route.',
      supportingRunIds: ['lab-run-test'],
      supportingActionIds: ['lab-action-test'],
      supportingTelemetryEventIds: [],
      support: { runs: 1, actions: 1, telemetryEvents: 0 },
    },
  ],
  runIds: ['lab-run-test'],
  limitations: ['Synthetic agents are not human participants.'],
});

const openAIResponse = (output: unknown) =>
  new Response(JSON.stringify({ output_text: JSON.stringify(output) }), {
    status: 200,
  });

describe('Darwin Lab live reasoning', () => {
  it('returns one bounded cheap-agent action and removes nullable target fields', async () => {
    const fetcher = vi.fn(async () =>
      openAIResponse({
        action: 'click',
        target: { semanticId: 'nav-projects', role: null, name: null },
        value: null,
        key: null,
        destination: null,
        expectation: 'The projects directory should open.',
      }),
    );
    const response = await decideLabAgentAction(decisionRequest, {
      apiKey: 'test-key',
      fetch: fetcher,
    });

    expect(response.model).toBe('gpt-5.6-luna');
    expect(response.decision.target).toEqual({ semanticId: 'nav-projects' });
    const calls = fetcher.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit]
    >;
    const request = JSON.parse(String(calls[0]?.[1]?.body));
    expect(request.store).toBe(false);
    expect(request.text.format.strict).toBe(true);
  });

  it('fails closed when a live API key is unavailable', async () => {
    await expect(decideLabAgentAction(decisionRequest)).rejects.toBeInstanceOf(
      LabReasoningError,
    );
  });

  it('accepts only mutations that cite records in the evidence pack', async () => {
    const mutation = {
      mutationId: 'lab-mutation-project-access',
      title: 'Expose project assignees in one view',
      problem: 'Repeated navigation blocks assignment discovery.',
      evidenceIds: ['L-EV-001'],
      hypothesis: 'A visible assignee summary will reduce route loops.',
      implementationBrief: 'Add a bounded assignee summary to Project Apollo.',
      tradeoffs: ['Adds density to the project overview.'],
      validationPlan:
        'Rerun the same seed and compare completion and path length.',
      confidence: 0.75,
    };
    const analysis = await analyseLabEvidence(experiment, evidence, {
      apiKey: 'test-key',
      fetch: vi.fn(async () =>
        openAIResponse({
          summary: 'Navigation loops are the dominant synthetic pressure.',
          selectedMutationId: mutation.mutationId,
          mutations: [mutation],
        }),
      ),
      createdAt: timestamp,
    });
    expect(analysis.mutations[0]?.evidenceIds).toEqual(['L-EV-001']);

    await expect(
      analyseLabEvidence(experiment, evidence, {
        apiKey: 'test-key',
        fetch: vi.fn(async () =>
          openAIResponse({
            summary: 'Unsupported output.',
            selectedMutationId: mutation.mutationId,
            mutations: [{ ...mutation, evidenceIds: ['L-EV-999'] }],
          }),
        ),
      }),
    ).rejects.toThrow('unsupported Lab evidence');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DarwinLabView } from './LabView';

const timestamp = '2026-07-18T10:00:00.000Z';
const taskHash = 'a'.repeat(64);
const draftExperiment = {
  experimentId: 'lab-exp-ui-test',
  studyId: 'projectflow-darwin-lab-ui-test',
  name: 'Apollo discovery study',
  targetUrl: 'http://localhost:5174/',
  targetAppVersion: '1.0.0',
  task: {
    taskDefinitionId: 'lab-task-ui-test',
    definitionVersion: 1,
    definitionHash: taskHash,
    taskId: 'find-apollo-assignees',
    name: 'Find Project Apollo assignees',
    instruction: 'Find everyone assigned to Project Apollo.',
    successDescription:
      'The agent identifies the complete Project Apollo assignment set.',
    startRoute: '/study/dashboard',
    successCriterion: { type: 'route_reached', route: '/study/my-work' },
  },
  populationSize: 8,
  personaAllocation: [{ persona: 'novice', count: 8 }],
  maxActions: 12,
  maxDurationMs: 180_000,
  seed: 1859,
  status: 'draft',
  runnerId: null,
  createdAt: timestamp,
  startedAt: null,
  completedAt: null,
  runs: [],
  evidence: null,
  analysis: null,
  selection: null,
  error: null,
  evidenceError: null,
  archivedAt: null,
  version: 0,
  provenance: {
    evidenceClass: 'darwin_lab',
    label: 'Darwin Lab',
    labExperimentId: 'lab-exp-ui-test',
    taskDefinitionId: 'lab-task-ui-test',
    taskDefinitionHash: taskHash,
    evidencePackId: null,
    evidenceHash: null,
    runIds: [],
  },
} as const;

const runningExperiment = {
  ...draftExperiment,
  status: 'running',
  runnerId: 'github-actions-123',
  startedAt: timestamp,
  runs: [
    {
      runId: 'lab-run-layout-test',
      experimentId: draftExperiment.experimentId,
      participantId: 'lab-agent-01',
      sessionId: 'lab-session-layout-test',
      persona: 'novice',
      viewport: { class: 'desktop', width: 1440, height: 960 },
      agentModel: 'gpt-5.6-luna',
      status: 'running',
      startedAt: timestamp,
      finishedAt: null,
      durationMs: null,
      taskOutcome: 'open',
      frictionLabels: [],
      telemetryEventIds: [],
      actions: [],
      error: null,
      populationOrdinal: 1,
      studyId: draftExperiment.studyId,
      taskDefinitionId: draftExperiment.task.taskDefinitionId,
      taskDefinitionHash: draftExperiment.task.definitionHash,
      appVersion: draftExperiment.targetAppVersion,
      provenance: {
        ...draftExperiment.provenance,
        runIds: ['lab-run-layout-test'],
      },
    },
  ],
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Darwin Lab view', () => {
  it('keeps Darwin Lab evidence separate and queues a bounded population', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === 'POST' ? draftExperiment : { experiments: [] },
          ),
          { status: init?.method === 'POST' ? 201 : 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DarwinLabView
        apiBaseUrl="http://localhost:8787"
        defaultTargetUrl="http://localhost:5174/"
        liveReasoningAvailable
      />,
    );

    expect(
      screen.queryByRole('heading', { level: 1, name: 'Darwin Lab' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Define a real task' }),
    ).toBeVisible();
    const experimentForm = screen
      .getByRole('button', { name: 'Create Lab task' })
      .closest('form');
    expect(experimentForm).not.toBeNull();
    const parameterLabels = [...experimentForm!.querySelectorAll('label')];
    expect(parameterLabels.length).toBeGreaterThanOrEqual(20);
    parameterLabels.forEach((label) => {
      expect(label).toHaveAttribute('data-explain');
      expect(label.getAttribute('data-explain')?.length).toBeGreaterThan(20);
    });
    expect(
      experimentForm!.querySelector('.lab-task-card > summary'),
    ).toHaveAttribute('data-explain', expect.stringContaining('population'));
    fireEvent.change(screen.getByLabelText('Action budget'), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Lab task' }));

    expect(
      await screen.findByRole('heading', { name: 'Apollo discovery study' }),
    ).toBeVisible();
    expect(screen.getByText('0/8')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Queue population/ }),
    ).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/api/lab/experiments',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const createRequest = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    );
    expect(JSON.parse(String(createRequest?.[1]?.body))).toMatchObject({
      maxActions: 12,
    });
  });

  it('renders the replay below a full-width population workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ experiments: [runningExperiment] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const { container } = render(
      <DarwinLabView
        apiBaseUrl="http://localhost:8787"
        defaultTargetUrl="http://localhost:5174/"
        liveReasoningAvailable
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Novice · open' }),
    ).toBeVisible();
    const population = screen.getByLabelText('Darwin Labs agent population');
    const populationWorkspace = container.querySelector(
      '.lab-population-workspace',
    );
    const replay = screen.getByText('Run replay').closest('section');
    expect(populationWorkspace).toContainElement(population);
    expect(populationWorkspace?.children).toHaveLength(1);
    expect(replay).not.toBeNull();
    expect(
      populationWorkspace!.compareDocumentPosition(replay!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

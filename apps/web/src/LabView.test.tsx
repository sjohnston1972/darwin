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
  });
});

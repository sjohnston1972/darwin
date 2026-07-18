import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DarwinLabView } from './LabView';

const timestamp = '2026-07-18T10:00:00.000Z';
const draftExperiment = {
  experimentId: 'lab-exp-ui-test',
  studyId: 'projectflow-darwin-lab-ui-test',
  name: 'Apollo discovery study',
  targetUrl: 'http://localhost:5174/',
  task: {
    taskId: 'find-apollo-assignees',
    name: 'Find Project Apollo assignees',
    instruction: 'Find everyone assigned to Project Apollo.',
    successDescription:
      'The agent identifies the complete Project Apollo assignment set.',
  },
  populationSize: 8,
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
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Darwin Lab view', () => {
  it('keeps synthetic evidence separate and queues a bounded population', async () => {
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
      screen.getByRole('heading', { level: 1, name: 'Darwin Lab' }),
    ).toBeVisible();
    expect(
      screen.getByText('Evolve software before real users arrive.'),
    ).toBeVisible();
    expect(screen.getByText('SYNTHETIC ONLY')).toBeVisible();
    expect(
      screen.getByText(/Never included in human cohorts or measured fitness/),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Create bounded experiment' }),
    );

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

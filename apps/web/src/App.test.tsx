import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const timestamp = '2026-07-16T12:00:00.000Z';
const run = {
  id: 'sim-baseline-1859',
  seed: 1859,
  variant: 'baseline',
  eventCount: 10_000,
  startedAt: timestamp,
  completedAt: timestamp,
} as const;
const summary = {
  run,
  fingerprint: '448efd59',
  personaCounts: {
    project_manager: 3_100,
    developer: 4_100,
    executive: 1_400,
    administrator: 1_400,
  },
  eventTypeCounts: {
    page_view: 4_900,
    click: 1_900,
    workflow_started: 845,
    workflow_completed: 670,
    workflow_abandoned: 175,
    search: 700,
    validation_error: 210,
    backtrack: 600,
  },
  goalCounts: { find_assigned_tasks: 10_000 },
  routeCounts: { '/dashboard': 4_000, '/projects': 3_000, '/tasks': 3_000 },
  metrics: {
    sessions: 845,
    workflowCompletionRate: 0.793,
    workflowAbandonmentRate: 0.207,
    averagePageViewsPerWorkflow: 5.18,
    averageBacktracksPerWorkflow: 0.59,
    searchUsageRate: 0.409,
    validationErrorRate: 0.12,
    medianWorkflowDurationMs: 76_300,
  },
  frictionSignals: [
    { key: 'backtracking', value: 0.59, unit: 'events_per_workflow' },
  ],
} as const;
const proposal = {
  id: 'mutation-global-task-discovery-v1',
  name: 'Promote global task discovery',
  observation: 'Assigned tasks are difficult to locate.',
  evidence: ['21% of assigned-task workflows were abandoned.'],
  hypothesis:
    'Promoting assigned work and search will reduce path length and abandonment.',
  implementationSummary:
    'Make My Work primary, promote global search, and add quick task creation.',
  predictedFitnessGain: 20.8,
  confidence: 0.86,
  risk: 'low',
  affectedFiles: [
    'apps/web/src/projectflow/ProjectFlow.tsx',
    'apps/web/src/projectflow/projectflow.css',
  ],
  status: 'proposed',
} as const;
const analysis = {
  mode: 'mock',
  fitness: {
    baseline: {
      score: 66.6,
      completionRate: 79.3,
      navigationEfficiency: 42.1,
      inverseErrorRate: 88,
      featureDiscovery: 61,
      inverseTaskDuration: 54,
    },
    evolved: {
      score: 87.4,
      completionRate: 94.5,
      navigationEfficiency: 83.3,
      inverseErrorRate: 96,
      featureDiscovery: 92,
      inverseTaskDuration: 77,
    },
    delta: 20.8,
  },
  findings: [
    {
      id: 'finding-task-discovery',
      title: 'Assigned tasks are difficult to locate',
      description: 'Users navigate indirectly.',
      impact: 100,
      confidence: 0.86,
      evidence: ['21% of assigned-task workflows were abandoned.'],
    },
  ],
  proposal,
} as const;

const baselineState = {
  variant: 'baseline',
  genomeVersion: 'v1.0',
  evolutionCycles: 0,
  activeMutationId: null,
  updatedAt: timestamp,
} as const;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const installApiMock = () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/health')) {
      return jsonResponse({
        status: 'ok',
        service: 'darwin-api',
        version: '0.5.0',
        timestamp,
      });
    }
    if (url.endsWith('/api/organism/state')) return jsonResponse(baselineState);
    if (url.endsWith('/api/simulations')) {
      return jsonResponse({ run, summary }, 201);
    }
    if (url.endsWith('/api/evolution/analyse')) return jsonResponse(analysis);
    if (url.endsWith('/approve')) {
      return jsonResponse({
        proposal: { ...proposal, status: 'approved' },
        organism: {
          ...baselineState,
          variant: 'evolved',
          genomeVersion: 'v1.1',
          evolutionCycles: 1,
          activeMutationId: proposal.id,
        },
      });
    }
    if (url.endsWith('/api/demo/reset')) {
      return jsonResponse({ status: 'reset', organism: baselineState });
    }
    return jsonResponse({ message: 'Unexpected test route' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Darwin control room', () => {
  it('renders and previews the connected organism variants', async () => {
    installApiMock();
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Darwin' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Software that evolves.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    ).toBeEnabled();
    expect(screen.getByTestId('projectflow')).toHaveAttribute(
      'data-variant',
      'baseline',
    );

    fireEvent.click(screen.getByRole('button', { name: /Evolved v1.1/ }));

    expect(
      await screen.findByPlaceholderText('Search tasks and projects'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('projectflow')).toHaveAttribute(
      'data-variant',
      'evolved',
    );
    expect(await screen.findByText('Online')).toBeInTheDocument();
  });

  it('runs the mock evolution cycle, approves the mutation, and resets', async () => {
    const fetchMock = installApiMock();
    render(<App />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'One controlled mutation proposed',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Assigned tasks are difficult to locate'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('10,000').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Approve mutation' }));

    expect(
      await screen.findByText('ProjectFlow v1.1 is now the active organism.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('projectflow')).toHaveAttribute(
        'data-variant',
        'evolved',
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset evolution demo' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('projectflow')).toHaveAttribute(
        'data-variant',
        'baseline',
      );
    });
    expect(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/demo/reset'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

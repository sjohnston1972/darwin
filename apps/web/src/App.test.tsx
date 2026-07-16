import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
    'apps/projectflow/src/App.tsx',
    'apps/projectflow/src/styles.css',
  ],
  status: 'proposed',
} as const;
const analysis = {
  mode: 'mock',
  model: 'deterministic-mock',
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
const baselineRecord = {
  id: 'record-baseline-1859',
  version: 'v1.0',
  outcome: 'baseline',
  fitness: analysis.fitness.baseline,
  recordedAt: timestamp,
} as const;
const survivedRecord = {
  id: 'record-survived-mutation-global-task-discovery-v1',
  version: 'v1.1',
  mutationId: proposal.id,
  outcome: 'survived',
  fitness: analysis.fitness.evolved,
  recordedAt: timestamp,
} as const;
const recordedValidation = {
  id: 'validation-global-task-discovery-v1',
  mutationId: proposal.id,
  status: 'passed',
  source: 'recorded_repository_run',
  commit: 'a25ed09',
  checks: [
    {
      name: 'TypeScript workspace check',
      status: 'passed',
      durationMs: 1_200,
      output: 'TypeScript workspace check passed.',
    },
    {
      name: 'Unit and UX component tests',
      status: 'passed',
      durationMs: 1_800,
      output: 'All component tests passed.',
    },
    {
      name: 'Production build',
      status: 'passed',
      durationMs: 2_100,
      output: 'Production build completed.',
    },
  ],
  fitness: analysis.fitness.evolved,
  recordedAt: timestamp,
} as const;
const evidencePack = {
  evidenceId: 'evidence-reset-test',
  evidenceHash: 'a'.repeat(64),
  generatedAt: timestamp,
  parserVersion: '1.1.0',
  evidenceClass: 'measured',
  study: {
    studyId: 'projectflow-baseline-study',
    appVersion: '1.0.0',
    sourceEventCount: 2,
    participants: 1,
    sessions: 1,
    attempts: 0,
  },
  taskAttempts: [],
  tasks: [],
  frictionSignals: [],
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
    mutableAreas: ['navigation'],
    protectedAreas: ['telemetry-history'],
  },
} as const;
const recordedOutcome = {
  validationId: 'outcome-reset-test',
  evidenceClass: 'automated',
  provenance: 'recorded_automated_run',
  generatedAt: timestamp,
  taskId: 'find-assigned-task',
  baseline: {
    cohortId: 'cohort-baseline-test',
    studyId: 'projectflow-baseline-automated-study',
    variant: 'baseline',
    appVersion: '1.0.0',
    source: 'automated',
    evidenceId: 'evidence-baseline-test',
    evidenceHash: 'b'.repeat(64),
    taskId: 'find-assigned-task',
    attempts: 1,
    successes: 1,
    completionRate: 1,
    medianInteractions: 8,
    medianDurationMs: 160,
  },
  evolved: {
    cohortId: 'cohort-evolved-test',
    studyId: 'projectflow-evolved-automated-study',
    variant: 'evolved',
    appVersion: '1.1.0',
    source: 'automated',
    evidenceId: 'evidence-evolved-test',
    evidenceHash: 'c'.repeat(64),
    taskId: 'find-assigned-task',
    attempts: 1,
    successes: 1,
    completionRate: 1,
    medianInteractions: 4,
    medianDurationMs: 90,
  },
  delta: { interactions: -4, durationMs: -70, completionRate: 0 },
  conclusion: 'Automated validation completed the evolved path.',
} as const;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const installApiMock = () => {
  let timeline: Array<typeof baselineRecord | typeof survivedRecord> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/studies/projectflow-baseline-study/events')) {
      return jsonResponse({
        studyId: 'projectflow-baseline-study',
        events: [],
        count: 0,
      });
    }
    if (url.includes('/evidence/latest?optional=true')) {
      return jsonResponse(evidencePack);
    }
    if (url.endsWith('/api/outcomes/automated-comparison')) {
      return jsonResponse(recordedOutcome);
    }
    if (url.endsWith('/api/health')) {
      return jsonResponse({
        status: 'ok',
        service: 'darwin-api',
        version: '0.7.0',
        analysis: {
          mode: 'mock',
          model: 'gpt-5.6',
          liveModelAvailable: false,
        },
        timestamp,
      });
    }
    if (url.endsWith('/api/organism/state')) return jsonResponse(baselineState);
    if (url.endsWith('/api/evolution/timeline')) {
      return jsonResponse({ records: timeline });
    }
    if (url.endsWith('/api/simulations')) {
      return jsonResponse({ run, summary }, 201);
    }
    if (url.endsWith('/api/evolution/analyse')) {
      timeline = [baselineRecord];
      return jsonResponse(analysis);
    }
    if (url.endsWith('/approve')) {
      return jsonResponse({
        proposal: { ...proposal, status: 'approved' },
        organism: baselineState,
      });
    }
    if (url.endsWith('/diff')) {
      return jsonResponse({
        mutationId: proposal.id,
        source: 'repository_source_comparison',
        baseRef: 'apps/web/src/projectflow/genomes/baseline.ts',
        targetRef: 'apps/web/src/projectflow/genomes/evolved.ts',
        patch:
          '--- baseline.ts\n+++ evolved.ts\n@@ -1 +1 @@\n-globalSearch: false\n+globalSearch: true',
        generatedAt: timestamp,
      });
    }
    if (url.endsWith('/validate')) {
      return jsonResponse({
        proposal: { ...proposal, status: 'validated' },
        validation: recordedValidation,
      });
    }
    if (url.endsWith('/release')) {
      timeline = [baselineRecord, survivedRecord];
      return jsonResponse({
        proposal: { ...proposal, status: 'released' },
        organism: {
          ...baselineState,
          variant: 'evolved',
          genomeVersion: 'v1.1',
          evolutionCycles: 1,
          activeMutationId: proposal.id,
        },
        record: survivedRecord,
      });
    }
    if (url.endsWith('/api/demo/reset')) {
      timeline = [];
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
  it('renders guidance and launches the standalone target variants', async () => {
    installApiMock();
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Darwin' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Helping your software evolve.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('link', {
        name: 'Open ProjectFlow baseline target application',
      }),
    ).toHaveAttribute('href', '/?view=target&variant=baseline');
    expect(
      screen.getByRole('link', { name: 'Target application' }),
    ).toHaveAttribute('href', '/?view=target&variant=baseline');
    expect(
      screen.getByRole('region', { name: 'Guided evolution cycle' }),
    ).toHaveTextContent('gpt-5.6 reasons');
    expect(screen.getByText('Start here')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Evolved v1.1/ }));

    expect(
      screen.getByRole('link', {
        name: 'Open ProjectFlow evolved target application',
      }),
    ).toHaveAttribute('href', '/?view=target&variant=evolved');
    expect(
      screen.getByRole('link', { name: 'Target application' }),
    ).toHaveAttribute('href', '/?view=target&variant=evolved');
    expect(screen.getByText('Evolved v1.1')).toBeInTheDocument();
    expect(await screen.findAllByText('v0.7.0 online')).toHaveLength(2);
    expect(screen.getByText('Five configured loci')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', { name: 'Configured genome comparison' }),
      ).getAllByText('my-work'),
    ).toHaveLength(2);
  });

  it('approves, validates, releases, records, and resets the mutation', async () => {
    const fetchMock = installApiMock();
    render(<App />);

    expect(
      await screen.findByText('Evidence pack evidence-reset-test'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Versioned outcome validation'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'One controlled mutation proposed',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Deterministic mock').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Assigned tasks are difficult to locate'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('10,000').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Approve mutation' }));

    expect(
      await screen.findByText(
        'The implementation artifact is ready for validation.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Open ProjectFlow baseline target application',
      }),
    ).toHaveAttribute('href', '/?view=target&variant=baseline');
    expect(
      screen.getByLabelText('ProjectFlow mutation diff'),
    ).toHaveTextContent('globalSearch: true');

    fireEvent.click(
      screen.getByRole('button', { name: 'Run recorded validation' }),
    );

    expect(
      await screen.findByText('All recorded repository checks passed.'),
    ).toBeInTheDocument();
    expect(screen.getByText('TypeScript workspace check')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Release evolved genome' }),
    );

    expect(
      await screen.findByText(
        'ProjectFlow v1.1 is now the active target application.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('link', {
          name: 'Open ProjectFlow evolved target application',
        }),
      ).toHaveAttribute('href', '/?view=target&variant=evolved');
    });
    expect(screen.getByText('Survived selection')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset evolution demo' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('link', {
          name: 'Open ProjectFlow baseline target application',
        }),
      ).toHaveAttribute('href', '/?view=target&variant=baseline');
    });
    expect(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    ).toBeEnabled();
    expect(
      screen.queryByText('Evidence pack evidence-reset-test'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Versioned outcome validation'),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/demo/reset'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

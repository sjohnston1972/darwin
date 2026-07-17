import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const timestamp = '2026-07-16T12:00:00.000Z';
const evidence = {
  evidenceId: 'evidence-measured-test',
  evidenceHash: 'a'.repeat(64),
  generatedAt: timestamp,
  parserVersion: '1.2.0',
  evidenceClass: 'measured',
  study: {
    studyId: 'projectflow-baseline-study',
    appVersion: '1.0.0',
    sourceEventCount: 14,
    participants: 1,
    sessions: 1,
    attempts: 1,
  },
  quality: {
    strength: 'directional',
    score: 60,
    eventCount: 14,
    sessionCount: 1,
    participantCount: 1,
    completedAttemptCount: 1,
    limitations: ['Fewer than three independent sessions were observed.'],
  },
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
          eventType: 'hover_intent',
          route: '/study/dashboard',
          targetId: 'capacity-member-1',
          attributes: { durationMs: 1800 },
        },
        {
          eventRef: 'E-002',
          sequence: 2,
          offsetMs: 1900,
          eventType: 'element_clicked',
          route: '/study/dashboard',
          targetId: 'capacity-member-1',
          attributes: { pointerType: 'mouse' },
        },
      ],
    },
  ],
  taskAttempts: [],
  tasks: [],
  frictionSignals: [
    {
      evidenceId: 'EV-001',
      ruleId: 'hover_hesitation',
      ruleVersion: '1.2.0',
      severity: 'medium',
      summary: 'Capacity required a long hover before selection.',
      affectedAttemptIds: [],
      supportingEventIds: ['00000000-0000-4000-8000-000000000001'],
      trace: [
        {
          eventId: '00000000-0000-4000-8000-000000000001',
          sequence: 1,
          eventType: 'hover_intent',
          route: '/study/dashboard',
          targetId: 'capacity-member-1',
        },
      ],
      support: { events: 1, attempts: 0, sessions: 1, participants: 1 },
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
        area: 'dashboard-capacity',
        purpose: 'Inspect workload allocation.',
        primaryActions: ['open capacity report'],
      },
    ],
    routes: ['/study/dashboard'],
    mutableAreas: ['navigation', 'dashboard-capacity'],
    protectedAreas: ['telemetry-history'],
  },
} as const;

const makeCandidate = (id: string, title: string, total: number) => ({
  id,
  title,
  problem: 'Capacity values are not clear before selection.',
  evidenceIds: ['EV-001'],
  pressureClusterIds: ['capacity-clarity'],
  hypothesis: 'Visible capacity details will reduce hesitation.',
  change: 'Expose allocation details on the capacity control itself.',
  predictedImpact: {
    metric: 'hover hesitation',
    direction: 'decrease',
    rationale: 'The value becomes understandable without exploration.',
  },
  confidence: 0.6,
  scorecard: {
    evidenceStrength: 60,
    userImpact: total,
    feasibility: total,
    validationClarity: total,
    total,
  },
  scope: ['dashboard-capacity'],
  tradeoffs: ['Adds information density to a compact chart.'],
  acceptanceCriteria: ['Allocation is visible on focus and hover.'],
  validationPlan: {
    primaryMetric: 'Median hover duration on capacity controls',
    baseline: '1.8 seconds in the measured journey',
    successThreshold: 'Below 1 second across three sessions',
    guardrails: ['Capacity report opens successfully.'],
  },
  codexBrief: 'Add accessible allocation detail to capacity controls.',
});

const analysis = {
  analysisId: 'analysis-measured-test',
  evidenceId: evidence.evidenceId,
  evidenceHash: evidence.evidenceHash,
  cacheKey: 'b'.repeat(64),
  promptVersion: '2.0.0',
  mode: 'live',
  model: 'gpt-5.6',
  createdAt: timestamp,
  evidenceAssessment: {
    summary: 'One measured journey suggests capacity labels need clarity.',
    quality: evidence.quality,
    pressureClusters: [
      {
        id: 'capacity-clarity',
        title: 'Capacity controls require interpretation',
        interpretation: 'The compact bars conceal their allocation values.',
        evidenceIds: ['EV-001'],
        affectedTargets: ['capacity-member-1'],
        userConsequence: 'The user hesitates before opening the report.',
        competingExplanations: ['The user may have been distracted.'],
        mutationOpportunity: 'Reveal allocation values before activation.',
      },
    ],
    selectionRationale: 'This change directly addresses the observed target.',
  },
  selectedMutation: makeCandidate(
    'capacity-context',
    'Reveal capacity context',
    82,
  ),
  alternatives: [
    makeCandidate('capacity-table', 'Replace bars with a table', 68),
    makeCandidate('capacity-preview', 'Add a capacity preview', 64),
  ],
  unsupportedIdeasRejected: [],
} as const;

const manifest = {
  manifestId: 'manifest-measured-test',
  manifestHash: 'c'.repeat(64),
  analysisId: analysis.analysisId,
  mutationId: analysis.selectedMutation.id,
  evidenceHash: evidence.evidenceHash,
  promptVersion: '2.0.0',
  repositoryCommit: 'test-commit',
  createdAt: timestamp,
  brief: analysis.selectedMutation.codexBrief,
  evidenceCitations: ['EV-001'],
  allowedPaths: ['apps/projectflow/src/App.tsx'],
  protectedPaths: ['workers/api/src/persistence'],
  acceptanceCriteria: analysis.selectedMutation.acceptanceCriteria,
  validationCommands: ['npm test'],
} as const;

const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

const installApi = (latestAnalysis: unknown = null) => {
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/events?limit=50')) {
        return response({
          studyId: 'projectflow-baseline-study',
          events: [],
          count: 14,
        });
      }
      if (url.includes('/evidence/latest')) return response(evidence);
      if (url.includes('/evidence-analysis/latest'))
        return latestAnalysis ? response(latestAnalysis) : response(null, 204);
      if (url.endsWith('/analyse-evidence')) return response(analysis, 201);
      if (url.includes('/codex-manifest')) {
        const requestBody =
          typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        const candidate = [
          analysis.selectedMutation,
          ...analysis.alternatives,
        ].find((entry) => entry.id === requestBody.mutationId);
        return response(
          candidate
            ? {
                ...manifest,
                mutationId: candidate.id,
                brief: candidate.codexBrief,
                evidenceCitations: candidate.evidenceIds,
                acceptanceCriteria: candidate.acceptanceCriteria,
              }
            : manifest,
          201,
        );
      }
      if (url.endsWith('/api/health')) {
        return response({
          status: 'ok',
          service: 'darwin-api',
          version: '0.19.1',
          analysis: {
            mode: 'live',
            model: 'gpt-5.6',
            liveModelAvailable: true,
          },
          timestamp,
        });
      }
      if (url.endsWith('/api/organism/state')) {
        return response({
          variant: 'baseline',
          genomeVersion: 'v1.0',
          evolutionCycles: 0,
          activeMutationId: null,
          updatedAt: timestamp,
        });
      }
      if (url.endsWith('/api/evolution/timeline'))
        return response({ records: [] });
      if (url.endsWith('/api/demo/reset')) {
        return response({
          status: 'reset',
          organism: {
            variant: 'baseline',
            genomeVersion: 'v1.0',
            evolutionCycles: 0,
            activeMutationId: null,
            updatedAt: timestamp,
          },
        });
      }
      return response({ error: 'unexpected_test_route', url }, 404);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.dataset.theme = 'dark';
});

describe('Darwin control room', () => {
  it('starts with the measured ProjectFlow workflow, not a synthetic demo', async () => {
    installApi();
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Darwin' }),
    ).toBeVisible();
    expect(screen.getByText('Helping your software evolve.')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Open measured study/ }),
    ).toHaveAttribute('href', expect.stringContaining('/study'));
    expect(
      screen.queryByText('Observe 10,000 interactions'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Versioned outcome validation'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Deterministic mock/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Live mutation portfolio ready'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Standalone ProjectFlow' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Active genome · v1.0' }),
    ).toBeVisible();
    expect(screen.queryByText('Evolved · v1.1')).not.toBeInTheDocument();
    document
      .querySelectorAll<HTMLImageElement>('.brand-mark')
      .forEach((mark) => {
        expect(mark.src).toContain('/assets/darwin-growth-mark.png');
      });
    expect(
      await screen.findByText('Evidence pack evidence-measured-test'),
    ).toBeVisible();
    expect(screen.getAllByText('14').length).toBeGreaterThan(0);
    expect(screen.getByText('directional')).toBeVisible();
  });

  it('shows live GPT pressure clusters, ranked mutations, and Codex handoff', async () => {
    const fetchMock = installApi();
    render(<App />);

    const ask = await screen.findByRole('button', { name: 'Ask gpt-5.6' });
    expect(ask).toBeEnabled();
    fireEvent.click(ask);

    expect(await screen.findByText('Reveal capacity context')).toBeVisible();
    expect(
      screen.getByText('Capacity controls require interpretation'),
    ).toBeVisible();
    expect(screen.getByText(/Alternatives considered/)).toBeVisible();
    expect(screen.getByText('Replace bars with a table')).toBeVisible();
    expect(screen.getByText('Measured validation plan')).toBeVisible();
    expect(screen.getByText('capacity-clarity')).toHaveAttribute(
      'data-explain',
      expect.stringContaining('Pressure Cluster'),
    );
    expect(
      screen.getAllByText('EV-001', { selector: '.evidence-chip' })[0],
    ).toHaveAttribute(
      'data-explain',
      expect.stringContaining('Support: 1 events'),
    );

    const alternative = screen.getByRole('radio', {
      name: /Replace bars with a table/,
    });
    fireEvent.click(alternative);
    expect(alternative).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Prepare manifest' }));
    expect(
      await screen.findByText('MANIFEST manifest-measured-test'),
    ).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analyse-evidence'),
        { method: 'POST' },
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/codex-manifest'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mutationId: 'capacity-table' }),
      }),
    );
  });

  it('does not restore reasoning produced from an older evidence pack', async () => {
    installApi({
      ...analysis,
      evidenceId: 'evidence-stale-test',
      evidenceHash: 'd'.repeat(64),
    });
    render(<App />);

    expect(
      await screen.findByText('Evidence pack evidence-measured-test'),
    ).toBeVisible();
    expect(
      screen.queryByText('Reveal capacity context'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask gpt-5.6' })).toBeEnabled();
  });

  it('persists the light theme from the header control', () => {
    installApi();
    render(<App />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    );

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('darwin-theme')).toBe('light');
    expect(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeVisible();
  });
});

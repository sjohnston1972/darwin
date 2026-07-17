import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const timestamp = '2026-07-16T12:00:00.000Z';
const repository = {
  owner: 'sjohnston1972',
  name: 'projectflow',
  fullName: 'sjohnston1972/projectflow',
  url: 'https://github.com/sjohnston1972/projectflow',
  branch: 'main',
  baseSha: 'd'.repeat(40),
  sourceHash: 'e'.repeat(64),
  capturedAt: timestamp,
  mutablePaths: ['apps/projectflow/src/App.tsx'],
  protectedPaths: ['.github/**'],
  contextPaths: ['apps/projectflow/src/App.tsx'],
  validationCommands: ['npm run verify'],
  maximumChangedFiles: 4,
  maximumChangedLines: 1200,
  productionUrl: 'https://darwin-projectflow.pages.dev/',
  studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
} as const;
const targetConnection = {
  connectionId: 'target-test',
  status: 'connected',
  connectedAt: timestamp,
  verifiedAt: timestamp,
  target: {
    targetId: 'projectflow',
    name: 'ProjectFlow',
    purpose:
      'Task management for creating projects, assigning work, and coordinating delivery.',
    defaultBranch: 'main',
  },
  repository,
  checks: [
    {
      id: 'repository',
      label: 'GitHub repository',
      status: 'passed',
      detail: 'sjohnston1972/projectflow at dddddddddddd',
    },
    {
      id: 'contract',
      label: 'Darwin target contract',
      status: 'passed',
      detail: '1 mutable paths, 1 validation commands',
    },
    {
      id: 'runtime',
      label: 'Cloudflare runtime',
      status: 'passed',
      detail: 'darwin-projectflow.pages.dev returned 200',
    },
    {
      id: 'telemetry',
      label: 'Measured study',
      status: 'passed',
      detail: 'Privacy-safe semantic telemetry endpoint configured',
    },
  ],
} as const;
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

const makeCandidate = (
  id: string,
  title: string,
  total: number,
  pressureClusterId = 'capacity-clarity',
) => ({
  id,
  title,
  problem: 'Capacity values are not clear before selection.',
  evidenceIds: ['EV-001'],
  pressureClusterIds: [pressureClusterId],
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
  promptVersion: '3.0.0',
  mode: 'live',
  model: 'gpt-5.6',
  createdAt: timestamp,
  repository,
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
      {
        id: 'capacity-density',
        title: 'Capacity presentation is too dense',
        interpretation: 'The chart makes comparison unnecessarily difficult.',
        evidenceIds: ['EV-001'],
        affectedTargets: ['capacity-member-1'],
        userConsequence: 'The user cannot compare allocations quickly.',
        competingExplanations: ['The labels may simply be too small.'],
        mutationOpportunity: 'Use a more scannable tabular presentation.',
      },
      {
        id: 'capacity-preview-pressure',
        title: 'Capacity lacks progressive disclosure',
        interpretation: 'Useful details are hidden until navigation.',
        evidenceIds: ['EV-001'],
        affectedTargets: ['capacity-member-1'],
        userConsequence: 'The user must leave the dashboard for basic context.',
        competingExplanations: [
          'The dashboard may not be the expected source.',
        ],
        mutationOpportunity: 'Add an inline capacity preview.',
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
    makeCandidate(
      'capacity-table',
      'Replace bars with a table',
      68,
      'capacity-density',
    ),
    makeCandidate(
      'capacity-preview',
      'Add a capacity preview',
      64,
      'capacity-preview-pressure',
    ),
  ],
  unsupportedIdeasRejected: [],
} as const;

const manifest = {
  manifestId: 'manifest-measured-test',
  manifestHash: 'c'.repeat(64),
  analysisId: analysis.analysisId,
  mutationId: analysis.selectedMutation.id,
  mutationIds: [analysis.selectedMutation.id],
  evidenceHash: evidence.evidenceHash,
  promptVersion: '3.0.0',
  repositoryCommit: repository.baseSha,
  repository,
  createdAt: timestamp,
  brief: analysis.selectedMutation.codexBrief,
  evidenceCitations: ['EV-001'],
  allowedPaths: ['apps/projectflow/src/App.tsx'],
  protectedPaths: ['.github/**'],
  acceptanceCriteria: analysis.selectedMutation.acceptanceCriteria,
  validationCommands: ['npm run verify'],
} as const;

const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

const installApi = (
  latestAnalysis: unknown = null,
  initialConnection: unknown = null,
) => {
  let liveExecution: Record<string, unknown> | null = null;
  let liveConnection: unknown = initialConnection;
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/events?limit=200')) {
        return response({
          studyId: 'projectflow-baseline-study',
          events: [],
          count: 14,
          sessionCounts: { 'session-test': 14 },
          participantCount: 1,
          behaviorSignalCount: 8,
        });
      }
      if (url.includes('/evidence/latest')) return response(evidence);
      if (url.includes('/evidence-analysis/latest'))
        return latestAnalysis ? response(latestAnalysis) : response(null, 204);
      if (url.endsWith('/analyse-evidence')) return response(analysis, 201);
      if (url.endsWith('/codex-manifest/execution')) {
        if (init?.method !== 'POST' && !liveExecution)
          return response(null, 204);
        liveExecution ??= {
          executionId: 'execution-measured-test',
          manifestId: manifest.manifestId,
          analysisId: analysis.analysisId,
          repository,
          status: 'preview_ready',
          branch: 'darwin/evolution-measured-test',
          baseSha: repository.baseSha,
          headSha: 'f'.repeat(40),
          workflowRunId: 123,
          workflowUrl:
            'https://github.com/sjohnston1972/projectflow/actions/runs/123',
          pullRequestNumber: 7,
          pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/7',
          previewUrl:
            'https://darwin-evolution-test.darwin-projectflow.pages.dev/?study=true',
          patch:
            '@@ live repository patch @@\n-old behavior\n+measured behavior',
          changedFiles: ['apps/projectflow/src/App.tsx'],
          checks: [
            {
              name: 'npm run verify',
              status: 'passed',
              durationMs: 1200,
              output: 'Typecheck, tests, and build passed.',
            },
          ],
          codex: {
            threadId: null,
            finalMessage: 'Implemented the approved measured mutation.',
            inputTokens: null,
            cachedInputTokens: null,
            outputTokens: null,
          },
          error: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          completedAt: null,
        };
        return response(liveExecution, 201);
      }
      if (url.endsWith('/api/repository-executions/execution-measured-test')) {
        return response(liveExecution);
      }
      if (
        url.endsWith(
          '/api/repository-executions/execution-measured-test/release',
        )
      ) {
        liveExecution = {
          ...liveExecution,
          status: 'released',
          headSha: '1'.repeat(40),
          previewUrl: repository.studyUrl,
          completedAt: timestamp,
        };
        return response(liveExecution);
      }
      if (url.includes('/codex-manifest')) {
        const requestBody =
          typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        const candidates = [
          analysis.selectedMutation,
          ...analysis.alternatives,
        ].filter((entry) => requestBody.mutationIds?.includes(entry.id));
        return response(
          candidates.length
            ? {
                ...manifest,
                mutationId: candidates[0]!.id,
                mutationIds: candidates.map((candidate) => candidate.id),
                brief: candidates
                  .map((candidate) => candidate.codexBrief)
                  .join('\n\n'),
                evidenceCitations: [
                  ...new Set(
                    candidates.flatMap((candidate) => candidate.evidenceIds),
                  ),
                ],
                acceptanceCriteria: candidates.flatMap(
                  (candidate) => candidate.acceptanceCriteria,
                ),
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
      if (url.endsWith('/api/target-connection/disconnect')) {
        liveConnection = null;
        return response(null, 204);
      }
      if (url.endsWith('/api/target-connection')) {
        if (init?.method === 'POST') {
          liveConnection = targetConnection;
          return response(targetConnection, 201);
        }
        return liveConnection ? response(liveConnection) : response(null, 204);
      }
      if (url.endsWith('/api/demo/reset')) {
        return response({
          status: 'reset',
          repositoryResetDispatched: true,
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
  window.history.replaceState({}, '', '/');
});

describe('Darwin control room', () => {
  it('starts with the measured ProjectFlow workflow, not a synthetic demo', async () => {
    const fetchMock = installApi();
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Darwin' }),
    ).toBeVisible();
    expect(screen.getByText('Helping your software evolve.')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Open measured study/ }),
    ).toHaveAttribute('href', expect.stringContaining('study=true'));
    expect(
      screen.getByRole('link', { name: 'Target application' }),
    ).toHaveAttribute('href', '/?view=target');
    expect(screen.getByRole('link', { name: 'Control room' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
      screen.getByRole('heading', { name: 'Repository genome · --' }),
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
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/events?limit=200'),
      ),
    );
  });

  it('shows live GPT pressure clusters, ranked mutations, and Codex handoff', async () => {
    const fetchMock = installApi();
    render(<App />);

    const ask = await screen.findByRole('button', { name: 'Ask gpt-5.6' });
    expect(ask).toBeEnabled();
    fireEvent.click(ask);

    expect(await screen.findByText('Reveal capacity context')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getAllByText('Capacity controls require interpretation').length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getByText('Ranked pressure portfolio')).toBeVisible();
    expect(screen.getAllByText('82%').length).toBeGreaterThan(0);
    expect(screen.getByText('68%')).toBeVisible();
    expect(screen.getByText('64%')).toBeVisible();
    expect(screen.getByText('Replace bars with a table')).toBeVisible();
    expect(await screen.findByText('Measured validation plan')).toBeVisible();
    expect(
      screen
        .getAllByText('capacity-clarity')
        .find((element) => element.hasAttribute('data-explain')),
    ).toHaveAttribute(
      'data-explain',
      expect.stringContaining('grouped selection pressure'),
    );
    expect(
      screen.getAllByText('EV-001', { selector: '.evidence-chip' })[0],
    ).toHaveAttribute(
      'data-explain',
      expect.stringContaining('Support: 1 events'),
    );

    const primary = screen.getByRole('checkbox', {
      name: 'Implement Reveal capacity context',
    });
    const alternative = screen.getByRole('checkbox', {
      name: 'Implement Replace bars with a table',
    });
    const secondAlternative = screen.getByRole('checkbox', {
      name: 'Implement Add a capacity preview',
    });
    await waitFor(() => expect(primary).toBeChecked());
    fireEvent.click(primary);
    expect(primary).not.toBeChecked();
    fireEvent.click(alternative);
    expect(alternative).toBeChecked();
    fireEvent.click(alternative);
    expect(alternative).not.toBeChecked();
    fireEvent.click(alternative);
    fireEvent.click(secondAlternative);
    expect(alternative).toBeChecked();
    expect(secondAlternative).toBeChecked();

    fireEvent.click(
      screen.getByRole('button', { name: /Replace bars with a table/ }),
    );
    expect(screen.getAllByText('Measured validation plan')).toHaveLength(2);
    expect(
      screen.getAllByText('Capacity presentation is too dense').length,
    ).toBeGreaterThanOrEqual(2);

    fireEvent.click(
      screen.getByRole('button', { name: 'Start controlled evolution' }),
    );
    expect(
      await screen.findByText('MANIFEST manifest-measured-test'),
    ).toBeVisible();
    expect(await screen.findByText('Codex execution')).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Release reviewed mutation' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Release reviewed mutation' }),
    );
    expect(await screen.findByText('Mutation released')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Open measured study/ }),
      ).toHaveAttribute('href', repository.studyUrl),
    );
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
        body: JSON.stringify({
          mutationIds: ['capacity-table', 'capacity-preview'],
        }),
      }),
    );
  });

  it('connects, verifies, and disconnects ProjectFlow from the target view', async () => {
    window.history.replaceState({}, '', '/?view=target');
    const fetchMock = installApi();
    render(<App />);

    expect(screen.queryByText(/Baseline v1\.0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evolved v1\.1/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Connect a target application' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Target application' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Control room' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByText('Darwin API')).toBeVisible();
    expect(await screen.findByText('No repository is connected')).toBeVisible();
    expect(screen.getByLabelText('GitHub repository')).toHaveValue(
      'sjohnston1972/projectflow',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect ProjectFlow' }),
    );

    expect(await screen.findByText('GitHub repository')).toBeVisible();
    expect(
      screen.getByText('darwin.target.json', { exact: false }),
    ).toBeVisible();
    expect(screen.getByText('Cloudflare runtime')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Open measured application/ }),
    ).toHaveAttribute('href', repository.studyUrl);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/target-connection'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          fullName: repository.fullName,
          branch: repository.branch,
          productionUrl: 'http://localhost:5174/',
          studyUrl: 'http://localhost:5174/?study=true',
        }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText('No repository is connected')).toBeVisible();
  });

  it('uses the connected repository snapshot as the active genome', async () => {
    installApi(null, targetConnection);
    render(<App />);

    expect(
      await screen.findByRole('heading', {
        name: `Repository genome · ${repository.baseSha.slice(0, 12)}`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Open measured study/ }),
    ).toHaveAttribute('href', repository.studyUrl);
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

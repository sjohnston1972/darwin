import type {
  EvidenceMutationCandidate,
  EvidencePack,
  RepositoryMutationExecution,
} from '@darwin/shared';

import {
  updateRepositoryExecution,
  updateRepositoryRollback,
} from '../repository/execution';

export const e2eBaselineSha = '1'.repeat(40);
export const e2eCandidateSha = '2'.repeat(40);
export const e2eReleasedSha = '3'.repeat(40);
export const e2eRollbackCandidateSha = '4'.repeat(40);
export const e2eRollbackReleasedSha = '5'.repeat(40);

export const e2eFixturesEnabled = (
  value: string | undefined,
  hostname: string,
) =>
  value === '1' &&
  (hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]');

const json = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

const targetContract = {
  schemaVersion: 1,
  targetId: 'projectflow',
  name: 'ProjectFlow',
  purpose: 'Project management workspace under controlled evolution.',
  defaultBranch: 'main',
  mutablePaths: [
    'apps/projectflow/src/App.tsx',
    'apps/projectflow/src/styles.css',
    'apps/projectflow/src/data.ts',
  ],
  protectedPaths: [
    '.github/**',
    'functions/**',
    'packages/telemetry-client/**',
  ],
  contextPaths: [
    'AGENTS.md',
    'apps/projectflow/src/App.tsx',
    'apps/projectflow/src/styles.css',
    'apps/projectflow/src/data.ts',
  ],
  validationCommands: ['npm run typecheck', 'npm run test', 'npm run build'],
  limits: { maximumChangedFiles: 3, maximumChangedLines: 500 },
};

const candidate = (
  id: string,
  title: string,
  scope: string,
  total: number,
  evidenceId: string,
): EvidenceMutationCandidate => ({
  id,
  title,
  problem: 'Assigned work is hidden behind a project-first navigation path.',
  evidenceIds: [evidenceId],
  pressureClusterIds: ['task-discovery-pressure'],
  hypothesis: 'A direct task entry point will reduce navigation friction.',
  change: `${title} while preserving the existing ProjectFlow routes.`,
  predictedImpact: {
    metric: 'navigation efficiency',
    direction: 'increase',
    rationale: 'The mutation removes avoidable project navigation steps.',
  },
  confidence: 0.86,
  scorecard: {
    evidenceStrength: 86,
    userImpact: total,
    feasibility: 90,
    validationClarity: 88,
    total,
  },
  scope: [scope],
  tradeoffs: ['Adds one more persistent task-discovery affordance.'],
  acceptanceCriteria: [
    'Assigned work is reachable without opening a project first.',
  ],
  validationPlan: {
    primaryMetric: 'Median interactions to assigned task',
    baseline: 'The measured path traverses Projects before Tasks.',
    successThreshold: 'The evolved path removes at least two interactions.',
    guardrails: ['Task completion remains available through project routes.'],
  },
  codexBrief: `Implement ${title} within the approved ProjectFlow source paths.`,
});

const analysisFixture = (pack: EvidencePack) => {
  const firstSignal = pack.frictionSignals[0];
  if (!firstSignal) {
    throw new Error('The E2E OpenAI fixture requires friction evidence.');
  }
  const affectedTargets = [
    ...new Set(
      firstSignal.trace.flatMap((event) =>
        event.targetId ? [event.targetId] : [],
      ),
    ),
  ].slice(0, 4);
  return {
    evidenceAssessment: {
      summary:
        'Measured journeys show repeated project-first navigation before assigned work can be opened.',
      pressureClusters: [
        {
          id: 'task-discovery-pressure',
          title: 'Assigned work is difficult to discover',
          interpretation:
            'The baseline information architecture makes users traverse project context before reaching an assigned task.',
          evidenceIds: [firstSignal.evidenceId],
          affectedTargets,
          userConsequence:
            'Routine task retrieval requires avoidable navigation and context switching.',
          competingExplanations: [
            'The fixed study task may overrepresent users who already know the project name.',
          ],
          mutationOpportunity:
            'Expose assigned tasks and search at the global navigation level.',
        },
      ],
      selectionRationale:
        'A direct task-discovery path addresses the strongest citable pressure with a bounded source change.',
    },
    selectedMutation: candidate(
      'direct-my-work',
      'Direct My Work navigation',
      'navigation',
      94,
      firstSignal.evidenceId,
    ),
    alternatives: [
      candidate(
        'global-task-search',
        'Global task search',
        'search',
        89,
        firstSignal.evidenceId,
      ),
      candidate(
        'task-discovery-cue',
        'Task discovery cue',
        'task-discovery',
        82,
        firstSignal.evidenceId,
      ),
    ],
    unsupportedIdeasRejected: [
      {
        idea: 'Rewrite the telemetry pipeline',
        reason: 'Telemetry infrastructure is protected and not implicated.',
      },
    ],
  };
};

export const createE2EBoundaryFetch =
  (pack?: EvidencePack): typeof fetch =>
  async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );

    if (url.href === 'https://api.openai.com/v1/responses') {
      if (!pack) throw new Error('OpenAI fixture was called without evidence.');
      return json({
        output_text: JSON.stringify(analysisFixture(pack)),
        usage: { input_tokens_details: { cached_tokens: 1_859 } },
      });
    }

    if (
      url.hostname === 'api.github.com' &&
      url.pathname.endsWith('/commits/main')
    ) {
      return json({ sha: e2eBaselineSha });
    }

    if (url.hostname === 'raw.githubusercontent.com') {
      if (url.pathname.endsWith('/darwin.target.json')) {
        return json(targetContract);
      }
      return new Response(
        `// Immutable E2E ProjectFlow context fixture\n// ${url.pathname}\n`,
        { headers: { 'Content-Type': 'text/plain' } },
      );
    }

    if (url.hostname === 'api.github.com' && url.pathname.endsWith('/merge')) {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      const rollback = String(body.commit_title ?? '').includes('rollback');
      return json({
        merged: true,
        sha: rollback ? e2eRollbackReleasedSha : e2eReleasedSha,
      });
    }

    if (
      url.hostname === 'api.github.com' &&
      url.pathname.includes('/actions/workflows/') &&
      url.pathname.endsWith('/dispatches')
    ) {
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected E2E provider request: ${url.href}`);
  };

const passedChecks = (execution: RepositoryMutationExecution) =>
  execution.checks.map((check, index) => ({
    ...check,
    status: 'passed' as const,
    durationMs: 350 + index * 125,
    output: `${check.name} passed in the hermetic ProjectFlow workflow fixture.`,
  }));

export const advanceE2EExecution = (
  execution: RepositoryMutationExecution,
): RepositoryMutationExecution => {
  if (execution.status === 'queued') {
    return updateRepositoryExecution(execution, {
      status: 'codex_running',
      workflowRunId: 1_859,
      workflowUrl:
        'https://github.com/sjohnston1972/projectflow/actions/runs/1859',
    });
  }
  if (execution.status === 'codex_running') {
    return updateRepositoryExecution(execution, {
      status: 'validating',
      headSha: e2eCandidateSha,
    });
  }
  if (execution.status === 'validating') {
    return updateRepositoryExecution(execution, {
      status: 'pull_request_open',
      headSha: e2eCandidateSha,
      pullRequestNumber: 1859,
      pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/1859',
      patch:
        'diff --git a/apps/projectflow/src/App.tsx b/apps/projectflow/src/App.tsx\n+@@ -1 +1 @@\n-// baseline\n+// evidence-led task discovery\n',
      changedFiles: ['apps/projectflow/src/App.tsx'],
      checks: passedChecks(execution),
      codex: {
        threadId: 'e2e-codex-thread',
        finalMessage:
          'Implemented the approved evidence-led mutation within repository policy.',
        inputTokens: 2_400,
        cachedInputTokens: 1_200,
        outputTokens: 640,
      },
    });
  }
  if (execution.status === 'pull_request_open') {
    const preview = new URL(execution.repository.studyUrl);
    preview.searchParams.set('candidate', 'true');
    return updateRepositoryExecution(execution, {
      status: 'preview_ready',
      previewUrl: preview.href,
    });
  }
  return execution;
};

export const advanceE2ERollback = (
  execution: RepositoryMutationExecution,
): RepositoryMutationExecution => {
  if (execution.rollback?.status === 'queued') {
    return updateRepositoryRollback(execution, {
      status: 'validating',
      workflowRunId: 1_860,
      workflowUrl:
        'https://github.com/sjohnston1972/projectflow/actions/runs/1860',
      headSha: e2eRollbackCandidateSha,
    });
  }
  if (execution.rollback?.status === 'validating') {
    return updateRepositoryRollback(execution, {
      status: 'pull_request_open',
      headSha: e2eRollbackCandidateSha,
      pullRequestNumber: 1860,
      pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/1860',
      patch:
        'diff --git a/apps/projectflow/src/App.tsx b/apps/projectflow/src/App.tsx\n+@@ -1 +1 @@\n-// evidence-led task discovery\n+// baseline\n',
      changedFiles: ['apps/projectflow/src/App.tsx'],
      checks: execution.rollback.checks.map((check, index) => ({
        ...check,
        status: 'passed' as const,
        durationMs: 300 + index * 100,
        output: `${check.name} passed for the reviewable inverse change.`,
      })),
    });
  }
  if (execution.rollback?.status === 'pull_request_open') {
    const preview = new URL(execution.repository.studyUrl);
    preview.searchParams.set('rollback', 'true');
    return updateRepositoryRollback(execution, {
      status: 'preview_ready',
      previewUrl: preview.href,
    });
  }
  return execution;
};

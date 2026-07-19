import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Miniflare } from 'miniflare';

import { handleRequest, type Env } from '../workers/api/src/index';
import {
  hashCallbackBodyForTest,
  signExecutionCallbackForTest,
} from '../workers/api/src/security/callback';

const port = 8787;
const callbackSecret = 'darwin-e2e-callback-secret';
const repositorySha = 'd'.repeat(40);
const nativeFetch = globalThis.fetch.bind(globalThis);

const targetConfig = {
  schemaVersion: 1,
  targetId: 'projectflow',
  name: 'ProjectFlow',
  purpose: 'Task management',
  defaultBranch: 'main',
  mutablePaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  contextPaths: ['apps/projectflow/src/App.tsx'],
  validationCommands: ['npm run verify'],
  limits: { maximumChangedFiles: 8, maximumChangedLines: 700 },
};

const candidate = (id: string, total: number) => ({
  id,
  title: `Mutation ${id}`,
  problem: 'Assigned work takes too many interactions to reach.',
  evidenceIds: ['EV-001'],
  pressureClusterIds: ['task-discovery-pressure'],
  hypothesis: 'A direct route will improve discovery.',
  change: `Implement ${id} as a direct task-discovery capability.`,
  predictedImpact: {
    metric: 'navigation efficiency',
    direction: 'increase',
    rationale: 'It removes intermediate routes.',
  },
  confidence: 0.8,
  scorecard: {
    evidenceStrength: 70,
    userImpact: total,
    feasibility: total,
    validationClarity: total,
    total,
  },
  scope: ['navigation'],
  tradeoffs: ['Adds a persistent navigation choice.'],
  acceptanceCriteria: ['Assigned work is directly reachable.'],
  validationPlan: {
    primaryMetric: 'Median interactions to assigned task',
    baseline: 'Measured path contains seven interactions',
    successThreshold: 'Four or fewer measured interactions',
    guardrails: ['Task completion rate does not decrease.'],
  },
  codexBrief: `Implement ${id} while preserving existing routes.`,
});

const evidenceModelOutput = {
  evidenceAssessment: {
    summary: 'The ordered journey shows indirect assigned-work navigation.',
    pressureClusters: [
      {
        id: 'task-discovery-pressure',
        title: 'Assigned work is buried',
        interpretation: 'The information architecture hides assigned tasks.',
        evidenceIds: ['EV-001'],
        affectedTargets: ['nav-projects'],
        userConsequence: 'Users take a long route to assigned work.',
        competingExplanations: ['The participant may be unfamiliar.'],
        mutationOpportunity: 'Create a direct assigned-work destination.',
      },
    ],
    selectionRationale: 'The direct route has the clearest causal path.',
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

interface WorkflowDispatch {
  execution_id: string;
  manifest_hash: string;
  repository: string;
  callback_nonce: string;
  callback_url: string;
}

let evolutionDispatch: WorkflowDispatch | null = null;
let rollbackDispatch: WorkflowDispatch | null = null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
  if (url.hostname === 'api.openai.com') {
    return Response.json({
      output_text: JSON.stringify(evidenceModelOutput),
      usage: { input_tokens_details: { cached_tokens: 128 } },
    });
  }
  if (url.hostname === 'api.github.com' && /\/commits\//.test(url.pathname)) {
    return Response.json({ sha: repositorySha });
  }
  if (url.hostname === 'raw.githubusercontent.com') {
    if (url.pathname.endsWith('/darwin.target.json')) {
      return Response.json(targetConfig);
    }
    return new Response(
      "export function ProjectFlow() { return 'instrumented target'; }",
      { headers: { 'Content-Type': 'text/plain' } },
    );
  }
  if (
    url.hostname === 'api.github.com' &&
    url.pathname.endsWith('/darwin-evolve.yml/dispatches')
  ) {
    const payload = JSON.parse(String(init?.body)) as {
      inputs: WorkflowDispatch;
    };
    evolutionDispatch = payload.inputs;
    return new Response(null, { status: 204 });
  }
  if (
    url.hostname === 'api.github.com' &&
    url.pathname.endsWith('/darwin-rollback.yml/dispatches')
  ) {
    const payload = JSON.parse(String(init?.body)) as {
      inputs: WorkflowDispatch;
    };
    rollbackDispatch = payload.inputs;
    return new Response(null, { status: 204 });
  }
  if (
    url.hostname === 'api.github.com' &&
    url.pathname.endsWith('/darwin-reset.yml/dispatches')
  ) {
    evolutionDispatch = null;
    rollbackDispatch = null;
    return new Response(null, { status: 204 });
  }
  if (
    url.hostname === 'api.github.com' &&
    /\/pulls\/\d+\/merge$/.test(url.pathname)
  ) {
    return Response.json({ merged: true, sha: 'f'.repeat(40) });
  }
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return nativeFetch(input, init);
  }
  throw new Error(`Unexpected external request in E2E fixture: ${url.href}`);
}) as typeof fetch;

const miniflare = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  d1Databases: { DB: crypto.randomUUID() },
});
const database = (await miniflare.getD1Database('DB')) as unknown as D1Database;
const migrationsPath = join(process.cwd(), 'workers', 'api', 'migrations');
for (const filename of (await readdir(migrationsPath))
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  const migration = await readFile(join(migrationsPath, filename), 'utf8');
  await database.exec(
    migration.replace(/--.*$/gm, '').replace(/\s*\r?\n\s*/g, ' '),
  );
}

const env: Partial<Env> = {
  DB: database,
  ALLOWED_ORIGINS:
    'http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174',
  DARWIN_AI_MODE: 'live',
  OPENAI_API_KEY: 'e2e-openai-boundary-token',
  OPENAI_MODEL: 'gpt-5.6',
  OPENAI_TIMEOUT_MS: '5000',
  DARWIN_DEMO_SEED: '1859',
  DARWIN_EVENT_COUNT: '10000',
  PROJECTFLOW_REPOSITORY: 'sjohnston1972/projectflow',
  PROJECTFLOW_BRANCH: 'main',
  PROJECTFLOW_PRODUCTION_URL: 'http://127.0.0.1:5174/',
  PROJECTFLOW_STUDY_URL: 'http://127.0.0.1:5174/?study=true',
  PROJECTFLOW_STUDY_ID: 'projectflow-baseline-study',
  PROJECTFLOW_AUTOMATED_STUDY_ID: 'projectflow-baseline-automated-study',
  PROJECTFLOW_LAB_STUDY_ID: 'projectflow-darwin-lab',
  DARWIN_LAB_ALLOWED_ORIGINS: 'http://127.0.0.1:5174',
  GITHUB_TOKEN: 'e2e-github-boundary-token',
  DARWIN_CALLBACK_TOKEN: callbackSecret,
  DARWIN_OPERATOR_TOKEN: 'e2e-token',
  DARWIN_STUDY_EVENT_QUOTA: '100000',
  DARWIN_TARGET_EVENT_QUOTA: '1000000',
  DARWIN_RELEASE_VERSION: '0.25.0-e2e',
  DARWIN_BUILD_SHA: '0123456789abcdef0123456789abcdef01234567',
};

let callbackOrdinal = 0;
const postCallback = async (
  dispatch: WorkflowDispatch,
  pathSuffix: 'callback' | 'rollback/callback',
  bodyValue: Record<string, unknown>,
) => {
  const body = JSON.stringify(bodyValue);
  const path = `/api/repository-executions/${dispatch.execution_id}/${pathSuffix}`;
  const timestamp = String(Date.now() + callbackOrdinal++);
  const canonical = [
    'POST',
    path,
    timestamp,
    dispatch.callback_nonce,
    dispatch.execution_id,
    dispatch.repository,
    dispatch.manifest_hash,
    await hashCallbackBodyForTest(body),
  ].join('\n');
  const signature = await signExecutionCallbackForTest(
    callbackSecret,
    canonical,
  );
  const response = await handleRequest(
    new Request(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Darwin-Timestamp': timestamp,
        'X-Darwin-Execution-Nonce': dispatch.callback_nonce,
        'X-Darwin-Repository': dispatch.repository,
        'X-Darwin-Manifest-Hash': dispatch.manifest_hash,
        'X-Darwin-Signature': signature,
      },
      body,
    }),
    env,
  );
  if (!response.ok) {
    throw new Error(
      `Callback failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json();
};

const completeEvolution = async () => {
  if (!evolutionDispatch) throw new Error('Evolution was not dispatched.');
  await postCallback(evolutionDispatch, 'callback', {
    status: 'codex_running',
    workflowRunId: 123,
    workflowUrl:
      'https://github.com/sjohnston1972/projectflow/actions/runs/123',
  });
  await postCallback(evolutionDispatch, 'callback', { status: 'validating' });
  await postCallback(evolutionDispatch, 'callback', {
    status: 'pull_request_open',
    headSha: 'e'.repeat(40),
    pullRequestNumber: 7,
    pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/7',
    patch:
      'diff --git a/apps/projectflow/src/App.tsx b/apps/projectflow/src/App.tsx\n@@ -1 +1 @@\n-old navigation\n+direct assigned-work navigation',
    changedFiles: ['apps/projectflow/src/App.tsx'],
    codex: {
      threadId: 'thread-e2e',
      finalMessage: 'Added the evidence-backed direct assigned-work route.',
      inputTokens: 800,
      cachedInputTokens: 128,
      outputTokens: 220,
    },
  });
  return postCallback(evolutionDispatch, 'callback', {
    status: 'preview_ready',
    previewUrl: 'http://127.0.0.1:5174/?study=true',
    checks: [
      {
        name: 'npm run verify',
        status: 'passed',
        durationMs: 1200,
        output: 'All checks passed.',
      },
    ],
  });
};

const completeRollback = async () => {
  if (!rollbackDispatch) throw new Error('Rollback was not dispatched.');
  await postCallback(rollbackDispatch, 'rollback/callback', {
    status: 'validating',
  });
  await postCallback(rollbackDispatch, 'rollback/callback', {
    status: 'pull_request_open',
    headSha: 'a'.repeat(40),
    pullRequestNumber: 19,
    pullRequestUrl: 'https://github.com/sjohnston1972/projectflow/pull/19',
    patch:
      'diff --git a/apps/projectflow/src/App.tsx b/apps/projectflow/src/App.tsx\n@@ -1 +1 @@\n-direct assigned-work navigation\n+old navigation',
    changedFiles: ['apps/projectflow/src/App.tsx'],
    checks: [
      {
        name: 'Git revert generation',
        status: 'passed',
        durationMs: 400,
        output: 'Exact inverse patch generated.',
      },
    ],
  });
  return postCallback(rollbackDispatch, 'rollback/callback', {
    status: 'preview_ready',
    previewUrl: 'http://127.0.0.1:5174/?study=true',
  });
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const path = new URL(incoming.url ?? '/', `http://127.0.0.1:${port}`)
      .pathname;
    if (path === '/__e2e/complete-evolution') {
      const result = await completeEvolution();
      outgoing.writeHead(200, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify(result));
      return;
    }
    if (path === '/__e2e/complete-rollback') {
      const result = await completeRollback();
      outgoing.writeHead(200, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify(result));
      return;
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Uint8Array);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(', '));
      else if (value !== undefined) headers.set(name, value);
    }
    const request = new Request(
      `http://127.0.0.1:${port}${incoming.url ?? '/'}`,
      {
        method: incoming.method,
        headers,
        ...(body.byteLength ? { body } : {}),
      },
    );
    const response = await handleRequest(request, env);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    outgoing.writeHead(response.status, responseHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { 'Content-Type': 'application/json' });
    outgoing.end(
      JSON.stringify({
        error: 'e2e_server_failure',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Darwin E2E API listening on http://127.0.0.1:${port}\n`,
  );
});

const shutdown = async () => {
  server.close();
  await miniflare.dispose();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

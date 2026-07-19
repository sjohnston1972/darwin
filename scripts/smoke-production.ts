import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch {
  // CI can provide the credential directly without a local .env file.
}

const apiUrl = 'https://darwin-api.stevie-johnston.workers.dev';
const controlRoomUrl = 'https://darwin-control-room.pages.dev';
const projectFlowUrl = 'https://darwin-projectflow.pages.dev';
const expectedRelease = process.env.DARWIN_RELEASE?.trim();
const expectedCommit = process.env.DARWIN_COMMIT_SHA?.trim();
if (!expectedRelease || !expectedCommit) {
  throw new Error(
    'DARWIN_RELEASE and DARWIN_COMMIT_SHA are required for production smoke tests.',
  );
}
const operatorToken = process.env.DARWIN_OPERATOR_TOKEN?.trim();
if (!operatorToken) {
  throw new Error(
    'DARWIN_OPERATOR_TOKEN is required for the production smoke test.',
  );
}
const operatorHeaders = { Authorization: `Bearer ${operatorToken}` };
const expectedCommit = process.env.DARWIN_BUILD_SHA?.trim();
const expectedRelease = process.env.DARWIN_RELEASE_VERSION?.trim();
if (!expectedCommit || !expectedRelease) {
  throw new Error(
    'DARWIN_BUILD_SHA and DARWIN_RELEASE_VERSION are required for the production smoke test.',
  );
}

const requireOk = async (response: Response, label: string) => {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return response;
};

const sleep = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const expectedSecurityHeaders = {
  'content-security-policy': [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ],
  'permissions-policy': ['camera=()', 'microphone=()', 'geolocation=()'],
  'referrer-policy': ['no-referrer'],
  'strict-transport-security': ['max-age=31536000'],
  'x-content-type-options': ['nosniff'],
  'x-frame-options': ['DENY'],
} as const;

const requireSecurityHeaders = (
  response: Response,
  label: string,
  connectSource: string,
) => {
  for (const [name, expectedValues] of Object.entries(
    expectedSecurityHeaders,
  )) {
    const value = response.headers.get(name) ?? '';
    for (const expected of expectedValues) {
      if (!value.includes(expected)) {
        throw new Error(`${label} is missing ${name}: ${expected}.`);
      }
    }
  }
  const policy = response.headers.get('content-security-policy') ?? '';
  if (!policy.includes(connectSource)) {
    throw new Error(`${label} is missing CSP directive: ${connectSource}.`);
  }
};

const fetchPageWithSecurityPolicy = async (
  url: string,
  label: string,
  connectSource: string,
) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await requireOk(await fetch(url), label);
    try {
      requireSecurityHeaders(response, label, connectSource);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 6) await sleep(2_000);
    }
  }
  throw lastError;
};

type HealthResponse = {
  status: string;
  version: string;
  commitSha: string;
  buildId: string;
};

const expectedBuildId = `v${expectedRelease}@${expectedCommit.slice(0, 7)}`;
const fetchExpectedHealth = async () => {
  let lastHealth: HealthResponse | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      const response = await requireOk(
        await fetch(`${apiUrl}/api/health`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        }),
        'API health',
      );
      lastHealth = (await response.json()) as HealthResponse;
      if (
        lastHealth.status === 'ok' &&
        lastHealth.version === expectedRelease &&
        lastHealth.commitSha === expectedCommit &&
        lastHealth.buildId === expectedBuildId
      ) {
        return lastHealth;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < 15) await sleep(2_000);
  }
  if (lastHealth) {
    throw new Error(
      `Unexpected API health response after deployment propagation window: ${JSON.stringify(lastHealth)}`,
    );
  }
  throw lastError;
};

const health = await fetchExpectedHealth();

const targetConnectionResponse = await requireOk(
  await fetch(`${apiUrl}/api/target-connection`, {
    headers: operatorHeaders,
  }),
  'Target connection',
);
if (targetConnectionResponse.status === 204) {
  throw new Error('ProjectFlow target connection is not configured.');
}
const targetConnection = (await targetConnectionResponse.json()) as {
  status: string;
  repository: {
    fullName: string;
    baseSha: string;
    productionUrl: string;
  };
};
if (
  targetConnection.status !== 'connected' ||
  targetConnection.repository.fullName !== 'sjohnston1972/projectflow' ||
  !/^[a-f0-9]{40}$/.test(targetConnection.repository.baseSha) ||
  targetConnection.repository.productionUrl !== `${projectFlowUrl}/`
) {
  throw new Error(
    `Unexpected target connection: ${JSON.stringify(targetConnection)}`,
  );
}

for (const [label, url, title, connectSource] of [
  [
    'Darwin control room',
    controlRoomUrl,
    '<title>Darwin',
    "connect-src 'self' https://darwin-api.stevie-johnston.workers.dev",
  ],
  ['ProjectFlow', projectFlowUrl, '<title>ProjectFlow', "connect-src 'self'"],
] as const) {
  const response = await fetchPageWithSecurityPolicy(url, label, connectSource);
  const html = await response.text();
  if (!html.includes(title)) throw new Error(`${label} HTML title is missing.`);
}

const eventId = '00000000-0000-4000-8000-000000001859';
const studyId = 'projectflow-baseline-automated-study';
const participantId = 'participant-production-smoke';
await requireOk(
  await fetch(`${projectFlowUrl}/api/darwin/telemetry/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      events: [
        {
          schemaVersion: 1,
          eventId,
          sessionId: 'session-production-smoke',
          participantId,
          studyId,
          appVersion: '1.0.0',
          source: 'automated',
          occurredAt: new Date().toISOString(),
          sequence: 0,
          route: '/study/dashboard',
          viewport: 'desktop',
          eventType: 'page_view',
        },
      ],
    }),
  }),
  'Telemetry ingestion',
);

const stored = (await (
  await requireOk(
    await fetch(`${apiUrl}/api/studies/${studyId}/events/raw?limit=50`, {
      headers: operatorHeaders,
    }),
    'D1 telemetry query',
  )
).json()) as {
  events: Array<{ eventId: string }>;
  count: number;
  sessionCounts: Record<string, number>;
  participantCount: number;
};
if (!stored.events.some((event) => event.eventId === eventId)) {
  throw new Error('The smoke telemetry event was not returned from D1.');
}
if (
  stored.count < 1 ||
  Object.values(stored.sessionCounts).reduce((sum, count) => sum + count, 0) !==
    stored.count ||
  stored.participantCount < 1
) {
  throw new Error(
    'D1 telemetry aggregates did not match the persisted events.',
  );
}

const smokeDeletion = (await (
  await requireOk(
    await fetch(
      `${apiUrl}/api/studies/${studyId}/participants/${participantId}`,
      { method: 'DELETE', headers: operatorHeaders },
    ),
    'Smoke telemetry cleanup',
  )
).json()) as { deleted: { telemetryEvents: number } };
if (smokeDeletion.deleted.telemetryEvents < 1) {
  throw new Error(
    'The deterministic smoke telemetry event was not cleaned up.',
  );
}

const simulation = (await (
  await requireOk(
    await fetch(`${apiUrl}/api/simulations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...operatorHeaders,
      },
      body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
    }),
    '10,000-event scale simulation',
  )
).json()) as { run: { eventCount: number } };
if (simulation.run.eventCount !== 10_000) {
  throw new Error(
    'Production simulation did not create exactly 10,000 events.',
  );
}

console.log(
  JSON.stringify(
    {
      api: health,
      controlRoomUrl,
      projectFlowUrl,
      targetCommit: targetConnection.repository.baseSha,
      d1EventId: eventId,
      d1EventDeleted: smokeDeletion.deleted.telemetryEvents,
      simulationEvents: simulation.run.eventCount,
    },
    null,
    2,
  ),
);

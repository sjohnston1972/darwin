const apiUrl = 'https://darwin-api.stevie-johnston.workers.dev';
const controlRoomUrl = 'https://darwin-control-room.pages.dev';
const projectFlowUrl = 'https://darwin-projectflow.pages.dev';

const requireOk = async (response: Response, label: string) => {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return response;
};

const health = (await (
  await requireOk(await fetch(`${apiUrl}/api/health`), 'API health')
).json()) as { status: string; version: string };
if (health.status !== 'ok' || health.version !== '0.21.0') {
  throw new Error(`Unexpected API health response: ${JSON.stringify(health)}`);
}

for (const [label, url, title] of [
  ['Darwin control room', controlRoomUrl, '<title>Darwin'],
  ['ProjectFlow', projectFlowUrl, '<title>ProjectFlow'],
] as const) {
  const html = await (await requireOk(await fetch(url), label)).text();
  if (!html.includes(title)) throw new Error(`${label} HTML title is missing.`);
}

const eventId = crypto.randomUUID();
const studyId = 'production-smoke-study';
await requireOk(
  await fetch(`${apiUrl}/api/telemetry/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: projectFlowUrl,
    },
    body: JSON.stringify({
      events: [
        {
          schemaVersion: 1,
          eventId,
          sessionId: `session-${eventId.slice(0, 8)}`,
          participantId: `participant-${eventId.slice(9, 17)}`,
          studyId,
          appVersion: '1.1.0',
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
    await fetch(`${apiUrl}/api/studies/${studyId}/events?limit=50`),
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

const simulation = (await (
  await requireOk(
    await fetch(`${apiUrl}/api/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: controlRoomUrl },
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
      d1EventId: eventId,
      simulationEvents: simulation.run.eventCount,
    },
    null,
    2,
  ),
);

import {
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  TelemetryReceiptSchema,
} from '@darwin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleRequest } from '../index';
import { resetInMemoryLab } from './lab-repository';

const request = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(async () => {
  await resetInMemoryLab();
  vi.unstubAllGlobals();
});

describe('Darwin Lab API', () => {
  it('runs a bounded population into separately labelled evidence', async () => {
    const forbidden = await handleRequest(
      request('/api/lab/experiments', 'POST', {
        name: 'Production attempt',
        targetUrl: 'https://darwin-projectflow.pages.dev/',
        populationSize: 8,
        maxActions: 12,
        maxDurationMs: 180_000,
        seed: 1859,
      }),
    );
    expect(forbidden.status).toBe(403);

    const createdResponse = await handleRequest(
      request('/api/lab/experiments', 'POST', {
        name: 'Apollo population',
        targetUrl: 'http://localhost:5174/',
        populationSize: 8,
        maxActions: 12,
        maxDurationMs: 180_000,
        seed: 1859,
      }),
    );
    const created = LabExperimentSchema.parse(await createdResponse.json());
    expect(createdResponse.status).toBe(201);
    expect(created.studyId).toMatch(/^projectflow-darwin-lab-/);

    const automatedEvent = {
      schemaVersion: 1,
      eventId: '00000000-0000-4000-8000-000000000901',
      sessionId: 'lab-session-telemetry',
      participantId: 'lab-agent-telemetry',
      studyId: created.studyId,
      appVersion: 'baseline',
      source: 'automated',
      provenance: created.provenance,
      occurredAt: '2026-07-18T10:00:00.000Z',
      sequence: 0,
      route: '/lab/dashboard',
      viewport: 'desktop',
      eventType: 'session_started',
    };
    const telemetryResponse = await handleRequest(
      request('/api/telemetry/events', 'POST', { events: [automatedEvent] }),
    );
    expect(
      TelemetryReceiptSchema.parse(await telemetryResponse.json()),
    ).toMatchObject({
      accepted: 1,
      rejected: 0,
    });
    const crossedBoundary = await handleRequest(
      request(`/api/studies/${created.studyId}/evidence`, 'POST'),
    );
    expect(crossedBoundary.status).toBe(409);
    await expect(crossedBoundary.json()).resolves.toMatchObject({
      error: 'lab_evidence_boundary',
    });

    await handleRequest(
      request(`/api/lab/experiments/${created.experimentId}/start`, 'POST'),
    );
    await handleRequest(
      request(`/api/lab/experiments/${created.experimentId}/claim`, 'POST', {
        runnerId: 'lab-runner-test',
      }),
    );

    for (let index = 1; index <= 8; index += 1) {
      const runId = `lab-run-${index}`;
      await handleRequest(
        request(`/api/lab/experiments/${created.experimentId}/runs`, 'POST', {
          runId,
          participantId: `lab-agent-${index}`,
          sessionId: `lab-session-${index}`,
          persona: index % 2 ? 'novice' : 'search_first',
          viewport: { class: 'desktop', width: 1440, height: 960 },
          agentModel: 'gpt-5.6-luna',
          startedAt: '2026-07-18T10:00:00.000Z',
          populationOrdinal: index,
          studyId: created.studyId,
          taskDefinitionId: created.task.taskDefinitionId,
          taskDefinitionHash: created.task.definitionHash,
          appVersion: created.targetAppVersion,
        }),
      );
      await handleRequest(
        request(
          `/api/lab/experiments/${created.experimentId}/runs/${runId}/actions`,
          'POST',
          {
            action: {
              actionId: `lab-action-${index}`,
              ordinal: 1,
              occurredAt: '2026-07-18T10:00:01.000Z',
              action: 'click',
              targetId: 'nav-projects',
              targetRole: 'button',
              inputLength: null,
              key: null,
              expectation: 'The projects directory should open.',
              fromUrl: 'http://localhost:5174/?lab=true',
              toUrl: 'http://localhost:5174/?lab=true',
              durationMs: 200,
              outcome: 'unchanged',
              accessibilityNodeCount: 80,
              telemetryEventIds: [],
              error: null,
              provenance: { ...created.provenance, runIds: [runId] },
            },
          },
        ),
      );
      await handleRequest(
        request(
          `/api/lab/experiments/${created.experimentId}/runs/${runId}/finish`,
          'POST',
          {
            status: 'abandoned',
            finishedAt: '2026-07-18T10:01:00.000Z',
            durationMs: 60_000,
            taskOutcome: 'abandoned',
            frictionLabels: ['abandonment'],
            telemetryEventIds: [],
            error: null,
          },
        ),
      );
    }

    const completedResponse = await handleRequest(
      request(`/api/lab/experiments/${created.experimentId}`),
    );
    const completed = LabExperimentSchema.parse(await completedResponse.json());
    expect(completed.status).toBe('completed');
    expect(completed.evidence?.evidenceClass).toBe('automated');
    expect(completed.evidence?.provenance).toMatchObject({
      evidenceClass: 'darwin_lab',
      labExperimentId: created.experimentId,
      taskDefinitionHash: created.task.definitionHash,
    });
    expect(completed.evidence?.population.completed).toBe(8);
    expect(completed.evidence?.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detector: 'abandonment' }),
        expect.objectContaining({ detector: 'dead_click' }),
      ]),
    );

    const promotedResponse = await handleRequest(
      request(
        `/api/lab/experiments/${created.experimentId}/promote-eval`,
        'POST',
      ),
    );
    const promoted = LabExperimentSchema.parse(await promotedResponse.json());
    expect(promotedResponse.status).toBe(201);
    expect(promoted.behaviouralEval).toMatchObject({
      evalId: 'BE-001',
      sourceExperimentId: created.experimentId,
      status: 'active',
      evidencePackId: promoted.evidence?.evidencePackId,
    });
    const evalsResponse = await handleRequest(
      request('/api/behavioural-evals'),
    );
    const evalPayload = (await evalsResponse.json()) as { evals: unknown[] };
    expect(evalPayload.evals).toHaveLength(1);

    const listResponse = await handleRequest(request('/api/lab/experiments'));
    expect(
      LabExperimentsResponseSchema.parse(await listResponse.json()).experiments,
    ).toHaveLength(1);
  });
});

import {
  CodexImplementationManifestSchema,
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  RepositoryMutationExecutionSchema,
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
    const task = {
      taskId: 'find-assigned-work',
      name: 'Find assigned work',
      instruction: 'Find and open the work assigned to you.',
      startRoute: '/study/dashboard',
      successCriterion: {
        type: 'route_reached',
        route: '/study/my-work',
      },
      successDescription: 'The browser reaches My Work.',
    } as const;
    const forbidden = await handleRequest(
      request('/api/lab/experiments', 'POST', {
        name: 'Production attempt',
        targetUrl: 'https://darwin-projectflow.pages.dev/',
        targetAppVersion: '1.0.0',
        task,
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
        targetAppVersion: '1.0.0',
        task,
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
      appVersion: '1.0.0',
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
      error: 'darwin_lab_evidence_boundary',
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
              provenance: {
                ...created.provenance,
                runIds: [runId],
              },
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
    expect(completed.evidence?.provenance.evidenceClass).toBe('darwin_lab');
    expect(completed.evidence?.population.completed).toBe(8);
    expect(completed.evidence?.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detector: 'abandonment' }),
        expect.objectContaining({ detector: 'dead_click' }),
      ]),
    );

    const listResponse = await handleRequest(request('/api/lab/experiments'));
    expect(
      LabExperimentsResponseSchema.parse(await listResponse.json()).experiments,
    ).toHaveLength(1);

    const evidenceId = completed.evidence!.signals[0]!.evidenceId;
    const mutation = {
      mutationId: 'lab-mutation-direct-work',
      title: 'Expose assigned work directly',
      problem: 'Automated runs abandon the indirect route.',
      evidenceIds: [evidenceId],
      hypothesis: 'A direct route will reduce automated abandonment.',
      implementationBrief: 'Add a bounded assigned-work navigation entry.',
      tradeoffs: ['Adds one navigation item.'],
      validationPlan: 'Rerun the same bounded Lab task.',
      confidence: 0.8,
    };
    const targetContract = {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('api.openai.com')) {
          return Response.json({
            output_text: JSON.stringify({
              summary: 'Abandonment is the dominant automated pressure.',
              selectedMutationId: mutation.mutationId,
              mutations: [mutation],
            }),
          });
        }
        if (url.includes('/commits/'))
          return Response.json({ sha: 'd'.repeat(40) });
        if (url.endsWith('/darwin.target.json'))
          return Response.json(targetContract);
        if (url.includes('raw.githubusercontent.com')) {
          return new Response('export const ProjectFlow = true;');
        }
        if (url.includes('/actions/workflows/darwin-evolve.yml/dispatches')) {
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected Lab test request: ${url}`);
      }),
    );
    const environment = {
      DARWIN_AI_MODE: 'live',
      OPENAI_API_KEY: 'lab-test-key',
      OPENAI_MODEL: 'gpt-5.6',
      PROJECTFLOW_REPOSITORY: 'sjohnston1972/projectflow',
      PROJECTFLOW_BRANCH: 'main',
      PROJECTFLOW_PRODUCTION_URL: 'http://localhost:5174/',
      PROJECTFLOW_STUDY_URL: 'http://localhost:5174/?study=true',
      GITHUB_TOKEN: 'github-test-token',
      DARWIN_CALLBACK_TOKEN: 'callback-test-token',
    } as const;
    const analysedResponse = await handleRequest(
      request(`/api/lab/experiments/${created.experimentId}/analyse`, 'POST'),
      environment,
    );
    const analysed = LabExperimentSchema.parse(await analysedResponse.json());
    expect(analysed.status).toBe('analysed');
    expect(analysed.analysis?.provenance.evidenceClass).toBe('darwin_lab');

    const selectedResponse = await handleRequest(
      request(
        `/api/lab/experiments/${created.experimentId}/mutations/select`,
        'POST',
        { mutationId: mutation.mutationId },
      ),
      environment,
    );
    const selected = LabExperimentSchema.parse(await selectedResponse.json());
    expect(selected.selection?.provenance.evidenceClass).toBe('darwin_lab');

    const manifestResponse = await handleRequest(
      request(
        `/api/lab/experiments/${created.experimentId}/codex-manifest`,
        'POST',
      ),
      environment,
    );
    const manifest = CodexImplementationManifestSchema.parse(
      await manifestResponse.json(),
    );
    expect(manifest.provenance).toMatchObject({
      evidenceClass: 'darwin_lab',
      labExperimentId: created.experimentId,
      evidencePackId: completed.evidence?.evidencePackId,
      evidenceHash: completed.evidence?.evidenceHash,
    });

    const executionResponse = await handleRequest(
      request(
        `/api/evidence-analyses/${manifest.analysisId}/codex-manifest/execution`,
        'POST',
      ),
      environment,
    );
    const execution = RepositoryMutationExecutionSchema.parse(
      await executionResponse.json(),
    );
    expect(execution.status).toBe('queued');
    expect(execution.provenance).toEqual(manifest.provenance);
  });
});

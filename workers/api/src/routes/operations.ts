import {
  DiagnosticsResponseSchema,
  OperationalTelemetryMetricsSchema,
  RetentionDeletionResponseSchema,
  RetentionSweepResultSchema,
  StudyIdentifierSchema,
  type HealthResponse,
  type RetentionPolicy,
} from '@darwin/shared';

import type { TelemetryRepository } from '../persistence/telemetry-repository';

type JsonResponder = (body: unknown, init?: ResponseInit) => Response;

interface OperationalRouteContext {
  request: Request;
  url: URL;
  repository: TelemetryRepository;
  json: JsonResponder;
  requestId: string;
  retentionPolicy: RetentionPolicy;
  release: string;
  commitSha: string;
  model: string;
  liveModelAvailable: boolean;
}

export async function handleOperationalRoutes({
  request,
  url,
  repository,
  json,
  requestId,
  retentionPolicy,
  release,
  commitSha,
  model,
  liveModelAvailable,
}: OperationalRouteContext): Promise<Response | null> {
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/health') {
    const response: HealthResponse = {
      status: 'ok',
      service: 'darwin-api',
      version: release,
      commitSha,
      buildId: `v${release}@${commitSha.slice(0, 7)}`,
      retention: await repository.getRetentionHealth(
        retentionPolicy,
        new Date().toISOString(),
      ),
      analysis: { mode: 'live', model, liveModelAvailable },
      timestamp: new Date().toISOString(),
    };
    return json(response);
  }

  if (request.method === 'GET' && pathname === '/api/diagnostics') {
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.round(requestedLimit)))
      : 50;
    const [events, metrics] = await Promise.all([
      repository.listOperationalAuditEvents(limit),
      repository.summarizeOperationalMetrics(100),
    ]);
    return json(
      DiagnosticsResponseSchema.parse({
        requestId,
        generatedAt: new Date().toISOString(),
        retentionDays: 30,
        events,
        metrics,
      }),
    );
  }

  if (request.method === 'GET' && pathname === '/api/operations/metrics') {
    const metrics = await repository.getOperationalMetrics();
    return json(
      OperationalTelemetryMetricsSchema.parse({
        updatedAt: metrics.updatedAt,
        ...metrics.counts,
      }),
    );
  }

  if (request.method === 'POST' && pathname === '/api/retention/sweep') {
    return json(
      RetentionSweepResultSchema.parse(
        await repository.runRetentionSweep(
          retentionPolicy,
          new Date().toISOString(),
        ),
      ),
    );
  }

  const participantDeletionMatch = pathname.match(
    /^\/api\/studies\/([^/]+)\/participants\/([^/]+)$/,
  );
  if (request.method === 'DELETE' && participantDeletionMatch) {
    const studyId = StudyIdentifierSchema.safeParse(
      decodeURIComponent(participantDeletionMatch[1]!),
    );
    const participantId = StudyIdentifierSchema.safeParse(
      decodeURIComponent(participantDeletionMatch[2]!),
    );
    if (!studyId.success || !participantId.success) {
      return json(
        {
          error: 'invalid_request',
          message: 'Study and participant identifiers are invalid.',
        },
        { status: 400 },
      );
    }
    return json(
      RetentionDeletionResponseSchema.parse({
        status: 'deleted',
        scope: 'participant',
        studyId: studyId.data,
        participantId: participantId.data,
        deleted: await repository.deleteParticipant(
          studyId.data,
          participantId.data,
        ),
      }),
    );
  }

  const studyDeletionMatch = pathname.match(/^\/api\/studies\/([^/]+)$/);
  if (request.method === 'DELETE' && studyDeletionMatch) {
    const studyId = StudyIdentifierSchema.safeParse(
      decodeURIComponent(studyDeletionMatch[1]!),
    );
    if (!studyId.success) {
      return json(
        { error: 'invalid_request', message: 'Study identifier is invalid.' },
        { status: 400 },
      );
    }
    return json(
      RetentionDeletionResponseSchema.parse({
        status: 'deleted',
        scope: 'study',
        studyId: studyId.data,
        deleted: await repository.deleteStudy(studyId.data),
      }),
    );
  }

  const executionDeletionMatch = pathname.match(
    /^\/api\/repository-executions\/([^/]+)\/artifacts$/,
  );
  if (request.method !== 'DELETE' || !executionDeletionMatch) return null;

  const executionId = StudyIdentifierSchema.safeParse(
    decodeURIComponent(executionDeletionMatch[1]!),
  );
  if (!executionId.success) {
    return json(
      {
        error: 'invalid_request',
        message: 'Execution identifier is invalid.',
      },
      { status: 400 },
    );
  }
  return json(
    RetentionDeletionResponseSchema.parse({
      status: 'deleted',
      scope: 'execution',
      executionId: executionId.data,
      deleted: await repository.deleteExecutionArtifacts(executionId.data),
    }),
  );
}

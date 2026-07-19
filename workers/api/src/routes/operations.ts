import {
  DiagnosticsResponseSchema,
  RetentionDeleteRequestSchema,
  type HealthResponse,
} from '@darwin/shared';

import type { TelemetryRepository } from '../persistence/telemetry-repository';
import { timeOperation } from '../observability';
import {
  PayloadTooLargeError,
  readBoundedBody,
} from '../security/bounded-body';

type JsonResponder = (body: unknown, init?: ResponseInit) => Response;

interface OperationalRouteContext {
  request: Request;
  url: URL;
  repository: TelemetryRepository;
  json: JsonResponder;
  requestId: string;
  operatorActor: string | null;
  eventQuotaPerStudy: number;
  eventQuotaPerTarget: number;
  build: { release: string; commit: string };
  analysis: { model: string; liveModelAvailable: boolean };
}

export async function handleOperationalRoutes({
  request,
  url,
  repository,
  json,
  requestId,
  operatorActor,
  eventQuotaPerStudy,
  eventQuotaPerTarget,
  build,
  analysis,
}: OperationalRouteContext): Promise<Response | null> {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const response: HealthResponse = {
      status: 'ok',
      service: 'darwin-api',
      version: build.release,
      build: {
        ...build,
        identifier: `${build.release}+${build.commit.slice(0, 7)}`,
      },
      analysis: { mode: 'live', ...analysis },
      storage: await repository.getStorageHealth(
        eventQuotaPerStudy,
        eventQuotaPerTarget,
      ),
      timestamp: new Date().toISOString(),
    };
    return json(response);
  }

  if (request.method === 'GET' && url.pathname === '/api/diagnostics') {
    const limit = Number(url.searchParams.get('limit') ?? 30);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return json(
        {
          error: 'invalid_request',
          message: 'Diagnostics limit must be 1 to 100.',
        },
        { status: 400 },
      );
    }
    const [auditEvents, storage] = await timeOperation(
      'd1',
      'load_diagnostics',
      () =>
        Promise.all([
          repository.listAuditEvents(limit),
          repository.getStorageHealth(eventQuotaPerStudy, eventQuotaPerTarget),
        ]),
      requestId,
    );
    return json(
      DiagnosticsResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        auditEvents,
        storage,
      }),
    );
  }

  if (request.method === 'POST' && url.pathname === '/api/retention/run') {
    const result = await repository.compactRetention();
    return json({ status: 'completed', ...result });
  }

  if (request.method !== 'DELETE' || url.pathname !== '/api/retention/delete') {
    return null;
  }

  let input: unknown;
  try {
    input = JSON.parse(await readBoundedBody(request, 16_384));
  } catch (error) {
    return json(
      {
        error:
          error instanceof PayloadTooLargeError
            ? 'payload_too_large'
            : 'invalid_request',
        message: 'Retention deletion request is invalid.',
      },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
  const parsed = RetentionDeleteRequestSchema.safeParse(input);
  if (!parsed.success) {
    return json(
      {
        error: 'confirmation_required',
        message: 'A valid deletion scope and DELETE confirmation are required.',
      },
      { status: 400 },
    );
  }
  const deletedRecords =
    parsed.data.scope === 'participant'
      ? await repository.deleteParticipant(
          parsed.data.studyId,
          parsed.data.participantId,
        )
      : parsed.data.scope === 'study'
        ? await repository.deleteStudy(parsed.data.studyId)
        : await repository.deleteExecution(parsed.data.executionId);
  console.info(
    '[darwin:audit]',
    JSON.stringify({
      event: 'retention_deletion_completed',
      actor: operatorActor,
      scope: parsed.data.scope,
      deletedRecords,
    }),
  );
  return json({ status: 'deleted', scope: parsed.data.scope, deletedRecords });
}

const requestIds = new WeakMap<Request, string>();
const safeRequestId = /^[a-zA-Z0-9._:-]{1,128}$/;

export const requestIdFor = (request: Request) => {
  const existing = requestIds.get(request);
  if (existing) return existing;
  const supplied = request.headers.get('X-Darwin-Request-ID')?.trim();
  const requestId =
    supplied && safeRequestId.test(supplied)
      ? supplied
      : `request-${crypto.randomUUID()}`;
  requestIds.set(request, requestId);
  return requestId;
};

type LogValue = string | number | boolean | null | undefined;

export const operationalLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, LogValue>,
) => {
  const payload = JSON.stringify({
    event,
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ),
  });
  if (level === 'error') console.error('[darwin:ops]', payload);
  else if (level === 'warn') console.warn('[darwin:ops]', payload);
  else console.info('[darwin:ops]', payload);
};

export const timeOperation = async <T>(
  provider: 'd1' | 'openai' | 'github' | 'target',
  operation: string,
  run: () => Promise<T>,
  requestId?: string,
) => {
  const started = performance.now();
  try {
    const result = await run();
    operationalLog('info', 'external_operation', {
      requestId,
      provider,
      operation,
      outcome: 'succeeded',
      durationMs: Math.round(performance.now() - started),
    });
    return result;
  } catch (error) {
    operationalLog('error', 'external_operation', {
      requestId,
      provider,
      operation,
      outcome: 'failed',
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
};

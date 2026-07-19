export class PayloadTooLargeError extends Error {
  constructor(readonly maximumBytes: number) {
    super(`Request body exceeds the ${maximumBytes} byte limit.`);
    this.name = 'PayloadTooLargeError';
  }
}

export class InvalidBodyEncodingError extends Error {
  constructor() {
    super('Request body is not valid UTF-8.');
    this.name = 'InvalidBodyEncodingError';
  }
}

export const readBoundedBody = async (
  request: Request,
  maximumBytes: number,
) => {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new InvalidBodyEncodingError();
    }
    if (parsedLength > maximumBytes) {
      throw new PayloadTooLargeError(maximumBytes);
    }
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader
          .cancel('request body limit exceeded')
          .catch(() => undefined);
        throw new PayloadTooLargeError(maximumBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidBodyEncodingError();
  }
};

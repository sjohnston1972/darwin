import type { ExecutionCallbackCredential } from '../persistence/telemetry-repository';

const encoder = new TextEncoder();

const toHex = (value: ArrayBuffer | Uint8Array) =>
  [...(value instanceof Uint8Array ? value : new Uint8Array(value))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const sha256 = async (value: string) =>
  toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

const hmac = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
};

const secureEqual = async (left: string, right: string) => {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
};

export const issueExecutionCallbackCredential = async (
  executionId: string,
  now = new Date(),
) => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const nonce = toHex(bytes);
  const createdAt = now.toISOString();
  const credential: ExecutionCallbackCredential = {
    executionId,
    nonceHash: await sha256(nonce),
    createdAt,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
  };
  return { nonce, credential };
};

export interface CallbackVerificationInput {
  request: Request;
  body: string;
  callbackSecret: string | undefined;
  credential: ExecutionCallbackCredential | null;
  executionId: string;
  repository: string;
  manifestHash: string;
  now?: Date;
}

export type CallbackVerification =
  | { ok: true; signature: string }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error:
        | 'callback_authentication_unavailable'
        | 'callback_authentication_required'
        | 'callback_authentication_failed'
        | 'callback_credential_expired';
      message: string;
    };

export const verifyExecutionCallback = async ({
  request,
  body,
  callbackSecret,
  credential,
  executionId,
  repository,
  manifestHash,
  now = new Date(),
}: CallbackVerificationInput): Promise<CallbackVerification> => {
  if (!callbackSecret || !credential) {
    return {
      ok: false,
      status: 503,
      error: 'callback_authentication_unavailable',
      message: 'Execution callback authentication is not configured.',
    };
  }
  const timestamp = request.headers.get('X-Darwin-Timestamp');
  const nonce = request.headers.get('X-Darwin-Execution-Nonce');
  const signedRepository = request.headers.get('X-Darwin-Repository');
  const signedManifestHash = request.headers.get('X-Darwin-Manifest-Hash');
  const signature = request.headers.get('X-Darwin-Signature');
  if (
    !timestamp ||
    !nonce ||
    !signedRepository ||
    !signedManifestHash ||
    !signature
  ) {
    return {
      ok: false,
      status: 401,
      error: 'callback_authentication_required',
      message: 'An execution-scoped signed callback is required.',
    };
  }
  if (
    signedRepository !== repository ||
    signedManifestHash !== manifestHash ||
    !(await secureEqual(await sha256(nonce), credential.nonceHash))
  ) {
    return {
      ok: false,
      status: 403,
      error: 'callback_authentication_failed',
      message: 'The callback is not bound to this execution.',
    };
  }
  const issuedAt = Number(timestamp);
  if (
    !Number.isSafeInteger(issuedAt) ||
    Math.abs(now.getTime() - issuedAt) > 5 * 60 * 1_000
  ) {
    return {
      ok: false,
      status: 401,
      error: 'callback_authentication_failed',
      message: 'The callback signature timestamp is invalid.',
    };
  }
  if (new Date(credential.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      status: 401,
      error: 'callback_credential_expired',
      message: 'The execution callback credential has expired.',
    };
  }
  const bodyDigest = await sha256(body);
  const canonical = [
    request.method,
    new URL(request.url).pathname,
    timestamp,
    nonce,
    executionId,
    repository,
    manifestHash,
    bodyDigest,
  ].join('\n');
  const expected = await hmac(callbackSecret, canonical);
  if (!(await secureEqual(signature.toLowerCase(), expected))) {
    return {
      ok: false,
      status: 401,
      error: 'callback_authentication_failed',
      message: 'The callback signature is invalid.',
    };
  }
  return { ok: true, signature: signature.toLowerCase() };
};

export const signExecutionCallbackForTest = hmac;
export const hashCallbackBodyForTest = sha256;

export const operatorCapabilities = [
  'observe',
  'inspect_evidence',
  'reason',
  'execute',
  'release',
  'reset',
  'connect',
  'simulate',
] as const;

export type OperatorCapability = (typeof operatorCapabilities)[number];

export interface AuthenticationEnvironment {
  DARWIN_OPERATOR_TOKEN?: string;
  DARWIN_VIEWER_TOKEN?: string;
  PROJECTFLOW_INGESTION_SECRET?: string;
  PROJECTFLOW_PRODUCTION_URL?: string;
}

export interface OperatorIdentity {
  actor: 'operator' | 'viewer' | 'local-development';
  capabilities: readonly OperatorCapability[];
}

export type OperatorAuthorization =
  | { ok: true; identity: OperatorIdentity }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error: 'unauthorized' | 'forbidden' | 'authentication_unavailable';
      message: string;
    };

export interface TargetRequestIdentity {
  targetId: 'projectflow';
  sourceOrigin: string;
  clientKey: string;
}

export type TargetAuthorization =
  | { ok: true; identity: TargetRequestIdentity }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error:
        | 'target_authentication_required'
        | 'target_authentication_failed'
        | 'target_authentication_unavailable'
        | 'target_origin_forbidden';
      message: string;
    };

const viewerCapabilities = ['observe'] as const;
const textEncoder = new TextEncoder();

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const digest = async (value: string) =>
  new Uint8Array(
    await crypto.subtle.digest('SHA-256', textEncoder.encode(value)),
  );

const constantTimeEqual = async (left: string, right: string) => {
  const [leftDigest, rightDigest] = await Promise.all([
    digest(left),
    digest(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index]! ^ rightDigest[index]!;
  }
  return difference === 0;
};

const bearerToken = (request: Request) => {
  const authorization = request.headers.get('Authorization') ?? '';
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
};

export const authorizeOperator = async (
  request: Request,
  env: AuthenticationEnvironment | undefined,
  requiredCapability: OperatorCapability,
): Promise<OperatorAuthorization> => {
  const url = new URL(request.url);
  const configuredOperatorToken = env?.DARWIN_OPERATOR_TOKEN?.trim();
  const configuredViewerToken = env?.DARWIN_VIEWER_TOKEN?.trim();

  if (!configuredOperatorToken && !configuredViewerToken) {
    if (isLocalHostname(url.hostname)) {
      return {
        ok: true,
        identity: {
          actor: 'local-development',
          capabilities: operatorCapabilities,
        },
      };
    }
    return {
      ok: false,
      status: 503,
      error: 'authentication_unavailable',
      message: 'Operator authentication is not configured.',
    };
  }

  const suppliedToken = bearerToken(request);
  if (!suppliedToken) {
    return {
      ok: false,
      status: 401,
      error: 'unauthorized',
      message: 'An operator bearer token is required.',
    };
  }

  if (
    configuredOperatorToken &&
    (await constantTimeEqual(suppliedToken, configuredOperatorToken))
  ) {
    return {
      ok: true,
      identity: { actor: 'operator', capabilities: operatorCapabilities },
    };
  }

  if (
    configuredViewerToken &&
    (await constantTimeEqual(suppliedToken, configuredViewerToken))
  ) {
    if (!viewerCapabilities.includes(requiredCapability as 'observe')) {
      return {
        ok: false,
        status: 403,
        error: 'forbidden',
        message: `The viewer credential cannot perform ${requiredCapability}.`,
      };
    }
    return {
      ok: true,
      identity: { actor: 'viewer', capabilities: viewerCapabilities },
    };
  }

  return {
    ok: false,
    status: 401,
    error: 'unauthorized',
    message: 'Operator authorization failed.',
  };
};

const hexadecimal = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const targetSignature = async (secret: string, canonical: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hexadecimal(
    await crypto.subtle.sign('HMAC', key, textEncoder.encode(canonical)),
  );
};

const targetOriginAllowed = (sourceOrigin: string, productionUrl?: string) => {
  let source: URL;
  try {
    source = new URL(sourceOrigin);
  } catch {
    return false;
  }
  if (isLocalHostname(source.hostname)) return true;
  const production = new URL(
    productionUrl || 'https://darwin-projectflow.pages.dev/',
  );
  return (
    source.origin === production.origin ||
    (source.protocol === 'https:' &&
      source.hostname.endsWith(`.${production.hostname}`))
  );
};

export const authorizeTargetRequest = async (
  request: Request,
  body: string,
  env?: AuthenticationEnvironment,
): Promise<TargetAuthorization> => {
  const url = new URL(request.url);
  const secret = env?.PROJECTFLOW_INGESTION_SECRET?.trim();
  if (!secret) {
    if (isLocalHostname(url.hostname)) {
      return {
        ok: true,
        identity: {
          targetId: 'projectflow',
          sourceOrigin: url.origin,
          clientKey: 'local-development',
        },
      };
    }
    return {
      ok: false,
      status: 503,
      error: 'target_authentication_unavailable',
      message: 'Target ingestion authentication is not configured.',
    };
  }

  const timestamp = request.headers.get('X-Darwin-Timestamp');
  const targetId = request.headers.get('X-Darwin-Target');
  const sourceOrigin = request.headers.get('X-Darwin-Source-Origin');
  const clientKey = request.headers.get('X-Darwin-Client-Key');
  const signature = request.headers.get('X-Darwin-Signature');
  if (!timestamp || !targetId || !sourceOrigin || !clientKey || !signature) {
    return {
      ok: false,
      status: 401,
      error: 'target_authentication_required',
      message: 'A signed target request is required.',
    };
  }
  if (targetId !== 'projectflow') {
    return {
      ok: false,
      status: 403,
      error: 'target_authentication_failed',
      message: 'The target credential is not valid for this application.',
    };
  }
  if (!targetOriginAllowed(sourceOrigin, env?.PROJECTFLOW_PRODUCTION_URL)) {
    return {
      ok: false,
      status: 403,
      error: 'target_origin_forbidden',
      message: 'The signed target deployment is not allowed.',
    };
  }

  const issuedAt = Number(timestamp);
  if (
    !Number.isSafeInteger(issuedAt) ||
    Math.abs(Date.now() - issuedAt) > 5 * 60 * 1_000
  ) {
    return {
      ok: false,
      status: 401,
      error: 'target_authentication_failed',
      message: 'The target request signature has expired.',
    };
  }
  const canonical = [timestamp, targetId, sourceOrigin, clientKey, body].join(
    '\n',
  );
  const expected = await targetSignature(secret, canonical);
  if (!(await constantTimeEqual(signature.toLowerCase(), expected))) {
    return {
      ok: false,
      status: 401,
      error: 'target_authentication_failed',
      message: 'The target request signature is invalid.',
    };
  }

  return {
    ok: true,
    identity: { targetId: 'projectflow', sourceOrigin, clientKey },
  };
};

export const signTargetRequestForTest = targetSignature;

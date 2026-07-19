import { describe, expect, it } from 'vitest';

import {
  authorizeOperator,
  authorizeTargetRequest,
  signTargetRequestForTest,
} from './auth';

const encoder = new TextEncoder();
const secret = 'target-auth-test-secret';
const environment = {
  PROJECTFLOW_INGESTION_SECRET: secret,
  PROJECTFLOW_PRODUCTION_URL: 'https://darwin-projectflow.pages.dev/',
};

const signedRequest = async (
  pathname: string,
  method: string,
  body: string,
  timestamp = String(Date.now()),
) => {
  const bodyDigest = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(body)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const canonical = [
    method,
    pathname,
    timestamp,
    'projectflow',
    'https://darwin-projectflow.pages.dev',
    'anonymous-edge-subject',
    bodyDigest,
  ].join('\n');
  const signature = await signTargetRequestForTest(secret, canonical);
  return new Request(`https://darwin-api.example${pathname}`, {
    method,
    headers: {
      'X-Darwin-Timestamp': timestamp,
      'X-Darwin-Target': 'projectflow',
      'X-Darwin-Source-Origin': 'https://darwin-projectflow.pages.dev',
      'X-Darwin-Client-Key': 'anonymous-edge-subject',
      'X-Darwin-Signature': signature,
    },
    ...(body ? { body } : {}),
  });
};

describe('authorization boundaries', () => {
  it('binds target HMACs to method, path, body, and deployment', async () => {
    const body = JSON.stringify({ events: [] });
    const signed = await signedRequest('/api/telemetry/events', 'POST', body);
    await expect(
      authorizeTargetRequest(signed, body, environment),
    ).resolves.toMatchObject({
      ok: true,
    });

    const crossRoute = new Request(
      'https://darwin-api.example/api/study-sessions',
      signed,
    );
    await expect(
      authorizeTargetRequest(crossRoute, body, environment),
    ).resolves.toMatchObject({
      ok: false,
      error: 'target_authentication_failed',
    });

    const crossMethod = new Request(signed, { method: 'PUT' });
    await expect(
      authorizeTargetRequest(crossMethod, body, environment),
    ).resolves.toMatchObject({
      ok: false,
      error: 'target_authentication_failed',
    });
  });

  it('rejects expired target signatures and wrong deployment origins', async () => {
    const expired = await signedRequest(
      '/api/telemetry/events',
      'POST',
      '{}',
      String(Date.now() - 6 * 60_000),
    );
    await expect(
      authorizeTargetRequest(expired, '{}', environment),
    ).resolves.toMatchObject({
      ok: false,
      error: 'target_authentication_failed',
    });

    const wrongOrigin = new Request(expired, {
      headers: {
        ...Object.fromEntries(expired.headers),
        'X-Darwin-Timestamp': String(Date.now()),
        'X-Darwin-Source-Origin': 'https://attacker.example',
      },
    });
    await expect(
      authorizeTargetRequest(wrongOrigin, '{}', environment),
    ).resolves.toMatchObject({ ok: false, error: 'target_origin_forbidden' });
  });

  it('enforces operator capability and viewer subject boundaries', async () => {
    const env = {
      DARWIN_OPERATOR_TOKEN: 'operator-secret',
      DARWIN_VIEWER_TOKEN: 'viewer-secret',
    };
    await expect(
      authorizeOperator(
        new Request('https://darwin-api.example/api/genome', {
          headers: { Authorization: 'Bearer viewer-secret' },
        }),
        env,
        'observe',
      ),
    ).resolves.toMatchObject({ ok: true, identity: { actor: 'viewer' } });
    await expect(
      authorizeOperator(
        new Request('https://darwin-api.example/api/demo/reset', {
          headers: { Authorization: 'Bearer viewer-secret' },
        }),
        env,
        'delete_data',
      ),
    ).resolves.toMatchObject({ ok: false, error: 'forbidden' });
  });
});

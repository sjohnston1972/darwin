import { beforeEach, describe, expect, it } from 'vitest';

import {
  getTelemetryRepository,
  resetInMemoryTelemetry,
} from '../persistence/telemetry-repository';
import {
  hashCallbackBodyForTest,
  issueExecutionCallbackCredential,
  signExecutionCallbackForTest,
  verifyExecutionCallback,
} from './callback';

const secret = 'callback-boundary-secret';
const executionId = 'execution-callback-test';
const repository = 'sjohnston1972/projectflow';
const manifestHash = 'a'.repeat(64);
const body = JSON.stringify({ status: 'validating' });
const now = new Date('2026-07-19T08:00:00.000Z');

const signedCallback = async (
  nonce: string,
  overrides: {
    executionId?: string;
    repository?: string;
    timestamp?: number;
  } = {},
) => {
  const boundExecution = overrides.executionId ?? executionId;
  const boundRepository = overrides.repository ?? repository;
  const timestamp = String(overrides.timestamp ?? now.getTime());
  const path = `/api/repository-executions/${boundExecution}/callback`;
  const canonical = [
    'POST',
    path,
    timestamp,
    nonce,
    boundExecution,
    boundRepository,
    manifestHash,
    await hashCallbackBodyForTest(body),
  ].join('\n');
  const signature = await signExecutionCallbackForTest(secret, canonical);
  return {
    signature,
    request: new Request(`https://darwin.example${path}`, {
      method: 'POST',
      headers: {
        'X-Darwin-Timestamp': timestamp,
        'X-Darwin-Execution-Nonce': nonce,
        'X-Darwin-Repository': boundRepository,
        'X-Darwin-Manifest-Hash': manifestHash,
        'X-Darwin-Signature': signature,
      },
      body,
    }),
  };
};

describe('execution callback boundary', () => {
  beforeEach(resetInMemoryTelemetry);

  it('accepts one execution-bound signature and rejects its replay', async () => {
    const issued = await issueExecutionCallbackCredential(executionId, now);
    const signed = await signedCallback(issued.nonce);
    await expect(
      verifyExecutionCallback({
        request: signed.request,
        body,
        callbackSecret: secret,
        credential: issued.credential,
        executionId,
        repository,
        manifestHash,
        now,
      }),
    ).resolves.toEqual({ ok: true, signature: signed.signature });

    const repositoryStore = getTelemetryRepository();
    await repositoryStore.saveExecutionCallbackCredential(issued.credential);
    await expect(
      repositoryStore.consumeExecutionCallbackSignature(
        executionId,
        signed.signature,
        now.toISOString(),
      ),
    ).resolves.toBe(true);
    await expect(
      repositoryStore.consumeExecutionCallbackSignature(
        executionId,
        signed.signature,
        now.toISOString(),
      ),
    ).resolves.toBe(false);
  });

  it('rejects wrong execution, wrong repository, and expired credentials', async () => {
    const issued = await issueExecutionCallbackCredential(executionId, now);
    const wrongExecution = await signedCallback(issued.nonce, {
      executionId: 'execution-other',
    });
    await expect(
      verifyExecutionCallback({
        request: wrongExecution.request,
        body,
        callbackSecret: secret,
        credential: issued.credential,
        executionId,
        repository,
        manifestHash,
        now,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'callback_authentication_failed',
    });

    const wrongRepository = await signedCallback(issued.nonce, {
      repository: 'attacker/projectflow',
    });
    await expect(
      verifyExecutionCallback({
        request: wrongRepository.request,
        body,
        callbackSecret: secret,
        credential: issued.credential,
        executionId,
        repository,
        manifestHash,
        now,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'callback_authentication_failed',
    });

    const valid = await signedCallback(issued.nonce, {
      timestamp: now.getTime() + 24 * 60 * 60 * 1_000,
    });
    await expect(
      verifyExecutionCallback({
        request: valid.request,
        body,
        callbackSecret: secret,
        credential: issued.credential,
        executionId,
        repository,
        manifestHash,
        now: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'callback_credential_expired',
    });
  });
});

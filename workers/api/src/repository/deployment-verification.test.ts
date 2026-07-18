import { describe, expect, it, vi } from 'vitest';

import {
  parseProjectFlowDeploymentIdentity,
  verifyProjectFlowDeployment,
} from './deployment-verification';

const html = (commitSha: string, appVersion = commitSha.slice(0, 12)) => `
  <!doctype html>
  <html><head>
    <meta content="${appVersion}" name="darwin-app-version" />
    <meta name="darwin-commit-sha" content="${commitSha}" />
    <title>ProjectFlow</title>
  </head></html>`;

describe('ProjectFlow deployment verification', () => {
  it('parses the immutable commit and measured application version', () => {
    const commitSha = 'a'.repeat(40);
    expect(parseProjectFlowDeploymentIdentity(html(commitSha))).toEqual({
      commitSha,
      appVersion: commitSha.slice(0, 12),
    });
    expect(
      parseProjectFlowDeploymentIdentity('<title>ProjectFlow</title>'),
    ).toBeNull();
  });

  it('waits through a stale deployment and verifies the released commit', async () => {
    const previousCommit = 'a'.repeat(40);
    const releasedCommit = 'b'.repeat(40);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html(previousCommit)))
      .mockResolvedValueOnce(new Response(html(releasedCommit)));
    const wait = vi.fn(async () => undefined);

    const verified = await verifyProjectFlowDeployment({
      studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
      expectedCommit: releasedCommit,
      timeoutMs: 500,
      pollIntervalMs: 0,
      fetcher,
      wait,
      now: () => new Date('2026-07-18T12:00:00.000Z'),
    });

    expect(verified).toEqual({
      commitSha: releasedCommit,
      appVersion: releasedCommit.slice(0, 12),
      attempts: 2,
      verifiedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(wait).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]?.[0].toString()).toContain(
      'darwin_deployment_verify=',
    );
  });

  it('returns bounded pending evidence without retaining response bodies', async () => {
    const previousCommit = 'a'.repeat(40);
    const releasedCommit = 'b'.repeat(40);
    await expect(
      verifyProjectFlowDeployment({
        studyUrl: 'https://darwin-projectflow.pages.dev/?study=true',
        expectedCommit: releasedCommit,
        timeoutMs: 500,
        pollIntervalMs: 0,
        fetcher: vi.fn(async () => new Response(html(previousCommit))),
        wait: async () => undefined,
      }),
    ).rejects.toMatchObject({
      name: 'DeploymentVerificationPendingError',
      attempts: 2,
      errorCode: 'deployment_version_mismatch',
      observed: {
        commitSha: previousCommit,
        appVersion: previousCommit.slice(0, 12),
      },
    });
  });
});

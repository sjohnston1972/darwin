import { describe, expect, it, vi } from 'vitest';

import { captureRepositorySnapshot } from './github-source';

const commitSha = 'a'.repeat(40);
const targetConfig = {
  schemaVersion: 1,
  targetId: 'projectflow',
  name: 'ProjectFlow',
  purpose: 'Task management',
  defaultBranch: 'main',
  mutablePaths: ['apps/projectflow/src/**'],
  protectedPaths: ['.github/**'],
  contextPaths: ['AGENTS.md', 'apps/projectflow/src/App.tsx'],
  validationCommands: ['npm run verify'],
  limits: { maximumChangedFiles: 8, maximumChangedLines: 700 },
};

describe('captureRepositorySnapshot', () => {
  it('captures target policy and source at an immutable GitHub commit', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/commits/main')) {
        return Response.json({ sha: commitSha });
      }
      if (url.endsWith(`/${commitSha}/darwin.target.json`)) {
        return new Response(JSON.stringify(targetConfig));
      }
      if (url.endsWith(`/${commitSha}/AGENTS.md`)) {
        return new Response('# ProjectFlow constraints\r\n');
      }
      if (url.endsWith(`/${commitSha}/apps/projectflow/src/App.tsx`)) {
        return new Response('export function App() { return null; }\r\n');
      }
      return new Response('not found', { status: 404 });
    });

    const snapshot = await captureRepositorySnapshot({
      fetch: fetcher,
      capturedAt: '2026-07-17T10:00:00.000Z',
    });

    expect(snapshot.context.baseSha).toBe(commitSha);
    expect(snapshot.context.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.context.mutablePaths).toEqual([
      'apps/projectflow/src/**',
    ]);
    expect(snapshot.context.validationCommands).toEqual(['npm run verify']);
    expect(snapshot.developerContext).toContain(`Exact commit: ${commitSha}`);
    expect(snapshot.developerContext).toContain(
      'export function App() { return null; }',
    );
    expect(
      fetcher.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.includes('raw.githubusercontent.com')),
    ).toEqual([
      `https://raw.githubusercontent.com/sjohnston1972/projectflow/${commitSha}/darwin.target.json`,
      `https://raw.githubusercontent.com/sjohnston1972/projectflow/${commitSha}/AGENTS.md`,
      `https://raw.githubusercontent.com/sjohnston1972/projectflow/${commitSha}/apps/projectflow/src/App.tsx`,
    ]);
  });

  it('fails closed when repository source cannot be fetched', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('unavailable', { status: 503 }),
    );

    await expect(captureRepositorySnapshot({ fetch: fetcher })).rejects.toThrow(
      'GitHub commit lookup failed with 503',
    );
  });
});

import { describe, expect, it } from 'vitest';

import { apiRouteContract, findApiRoute } from './api-route-contract';

describe('API route contract', () => {
  it('contains unique method and path entries', () => {
    const keys = apiRouteContract.map(
      (route) => `${route.method} ${route.path}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(30);
  });

  it('resolves every declared route and requires capabilities on operator routes', () => {
    for (const route of apiRouteContract) {
      const examplePath = route.path.replace(/:[^/]+/g, 'contract-test');
      expect(
        findApiRoute(route.method, examplePath),
        `${route.method} ${route.path}`,
      ).toBe(route);
      if (route.access === 'operator') {
        expect(
          route.capability,
          `${route.method} ${route.path}`,
        ).not.toBeNull();
      } else {
        expect(route.capability, `${route.method} ${route.path}`).toBeNull();
      }
    }
  });

  it('matches parameterized routes to their access boundary', () => {
    expect(
      findApiRoute(
        'POST',
        '/api/repository-executions/execution-1/rollback/callback',
      ),
    ).toMatchObject({ access: 'callback', capability: null });
    expect(
      findApiRoute('GET', '/api/studies/study-1/sessions/session-1'),
    ).toMatchObject({ access: 'operator', capability: 'inspect_evidence' });
    expect(
      findApiRoute(
        'PUT',
        '/api/studies/study-1/participants/participant-1/workspace',
      ),
    ).toMatchObject({ access: 'target', capability: null });
  });

  it('keeps release and reasoning authority explicit', () => {
    expect(
      findApiRoute('POST', '/api/repository-executions/execution-1/release'),
    ).toMatchObject({ capability: 'release' });
    expect(
      findApiRoute('POST', '/api/studies/study-1/analyse-evidence'),
    ).toMatchObject({ capability: 'reason' });
  });

  it('reserves destructive maintenance for delete-data authority', () => {
    for (const [method, path] of [
      ['POST', '/api/retention/sweep'],
      ['DELETE', '/api/studies/study-1'],
      ['DELETE', '/api/studies/study-1/participants/participant-1'],
      ['DELETE', '/api/repository-executions/execution-1/artifacts'],
      ['POST', '/api/demo/reset'],
    ] as const) {
      expect(findApiRoute(method, path)).toMatchObject({
        capability: 'delete_data',
      });
    }
  });

  it('does not let observe-only viewers mutate Darwin Lab state', () => {
    for (const [method, path] of [
      ['PUT', '/api/lab/experiments/lab-exp-1'],
      ['POST', '/api/lab/experiments/lab-exp-1/cancel'],
      ['POST', '/api/lab/experiments/lab-exp-1/rebuild-evidence'],
      ['POST', '/api/lab/experiments/lab-exp-1/codex-manifest'],
    ] as const) {
      expect(findApiRoute(method, path)?.capability).not.toBe('observe');
    }
  });
});

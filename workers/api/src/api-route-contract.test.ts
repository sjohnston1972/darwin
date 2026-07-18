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
});

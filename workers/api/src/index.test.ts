import { HealthResponseSchema } from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { handleRequest } from './index';

describe('Darwin API', () => {
  it('returns a schema-valid health response', async () => {
    const response = handleRequest(new Request('http://localhost/api/health'));
    const body = HealthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(body.service).toBe('darwin-api');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const response = handleRequest(new Request('http://localhost/api/missing'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'not_found',
    });
  });
});

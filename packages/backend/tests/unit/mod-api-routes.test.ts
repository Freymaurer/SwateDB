import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index';
import { createMockModApiService, modApiPathChecks } from './mod-api-contract-data';

describe('MOD API route coverage', () => {
  it('serves all required MOD and docs endpoints', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    for (const check of modApiPathChecks) {
      const target = check.query === undefined ? check.path : `${check.path}?${check.query}`;
      const response =
        check.path === '/doc/api'
          ? await request(app).get(target).redirects(1)
          : await request(app).get(target);
      expect(response.status, `Expected 200 for GET ${target}`).toBe(200);
    }
  });

  it('returns 406 for runtime-unsupported serialization format', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app).get('/artefacts?format=ttl');

    expect(response.status).toBe(406);
    expect(response.body.error.code).toBe('unsupported_format');
  });

  it('returns 400 when search query q is missing', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app).get('/search?format=jsonld');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });

  it('returns hydra pagination view fields for out-of-range page requests', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app).get('/artefacts?format=jsonld&page=99&pagesize=10');

    expect(response.status).toBe(200);
    expect(response.body.view).toBeDefined();
    expect(response.body.view['hydra:first']).toBeDefined();
    expect(response.body.view['hydra:last']).toBeDefined();
  });
});

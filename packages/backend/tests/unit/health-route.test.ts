import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createHealthRouter } from '../../src/routes/health';

describe('createHealthRouter', () => {
  it('returns 200 when all component probes are healthy', async () => {
    const app = express();
    app.use(
      '/health',
      createHealthRouter({
        neo4jProbe: async () => ({ status: 'up' }),
        redisProbe: async () => ({ status: 'up' }),
        jvmProbe: async () => ({ status: 'up' }),
      }),
    );

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns 503 when at least one component probe fails', async () => {
    const app = express();
    app.use(
      '/health',
      createHealthRouter({
        neo4jProbe: async () => ({ status: 'down', detail: 'db offline' }),
        redisProbe: async () => ({ status: 'up' }),
        jvmProbe: async () => ({ status: 'up' }),
      }),
    );

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.components.neo4j.detail).toContain('db offline');
  });
});

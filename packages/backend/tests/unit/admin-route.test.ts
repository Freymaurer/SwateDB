import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAdminAuthMiddleware } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error-handler';
import { createAdminRouter } from '../../src/routes/admin';

describe('createAdminRouter', () => {
  it('requires admin bearer token for sync route', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin',
      createAdminRouter({
        authMiddleware: createAdminAuthMiddleware({ token: 'admin-token' }),
        importService: {
          enqueueManualSync: vi.fn(),
        },
      }),
    );
    app.use(errorHandler);

    const response = await request(app).post('/api/admin/sync').send({
      owner: 'acme',
      repo: 'ontologies',
      ref: 'main',
      installationId: 42,
    });

    expect(response.status).toBe(401);
  });

  it('queues manual sync when authenticated', async () => {
    const enqueueManualSync = vi.fn(async () => ({
      jobId: 'job-1',
      matchedFiles: 2,
      externals: 1,
    }));

    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin',
      createAdminRouter({
        authMiddleware: createAdminAuthMiddleware({ token: 'admin-token' }),
        importService: {
          enqueueManualSync,
        },
      }),
    );
    app.use(errorHandler);

    const response = await request(app)
      .post('/api/admin/sync')
      .set('authorization', 'Bearer admin-token')
      .send({
        owner: 'acme',
        repo: 'ontologies',
        ref: 'main',
        installationId: 42,
      });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('queued');
    expect(response.body.jobId).toBe('job-1');
    expect(enqueueManualSync).toHaveBeenCalledTimes(1);
  });
});

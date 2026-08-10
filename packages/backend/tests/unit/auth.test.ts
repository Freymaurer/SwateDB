import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAdminAuthMiddleware } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error-handler';

describe('createAdminAuthMiddleware', () => {
  it('rejects requests without bearer token', async () => {
    const app = express();
    app.use(createAdminAuthMiddleware({ token: 'top-secret' }));
    app.get('/secure', (_request, response) => {
      response.status(200).json({ ok: true });
    });
    app.use(errorHandler);

    const response = await request(app).get('/secure');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('missing_bearer_token');
  });

  it('accepts requests with valid bearer token', async () => {
    const app = express();
    app.use(createAdminAuthMiddleware({ token: 'top-secret' }));
    app.get('/secure', (_request, response) => {
      response.status(200).json({ ok: true });
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/secure')
      .set('authorization', 'Bearer top-secret');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

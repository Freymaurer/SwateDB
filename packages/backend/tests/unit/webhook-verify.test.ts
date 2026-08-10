import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler';
import {
  createGitHubSignature,
  createWebhookVerificationMiddleware,
  resetWebhookReplayCacheForTests,
} from '../../src/middleware/webhook-verify';

afterEach(() => {
  resetWebhookReplayCacheForTests();
});

describe('createWebhookVerificationMiddleware', () => {
  it('returns 401 for invalid signatures', async () => {
    const app = express();
    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      createWebhookVerificationMiddleware({ secret: 'secret-key' }),
      (_request, response) => {
        response.status(200).json({ ok: true });
      },
    );
    app.use(errorHandler);

    const payload = JSON.stringify({ hello: 'world' });

    const response = await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-github-delivery', 'delivery-1')
      .set('x-hub-signature-256', 'sha256=invalid')
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('invalid_signature');
  });

  it('rejects replayed delivery IDs', async () => {
    const app = express();
    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      createWebhookVerificationMiddleware({ secret: 'secret-key' }),
      (_request, response) => {
        response.status(200).json({ ok: true });
      },
    );
    app.use(errorHandler);

    const payload = JSON.stringify({ hello: 'world' });
    const signature = createGitHubSignature('secret-key', Buffer.from(payload));

    const first = await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-github-delivery', 'delivery-1')
      .set('x-hub-signature-256', signature)
      .send(payload);

    const second = await request(app)
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-github-delivery', 'delivery-1')
      .set('x-hub-signature-256', signature)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('replayed_delivery');
  });
});

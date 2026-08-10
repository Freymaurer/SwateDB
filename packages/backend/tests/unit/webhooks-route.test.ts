import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler';
import {
  createGitHubSignature,
  createWebhookVerificationMiddleware,
  resetWebhookReplayCacheForTests,
} from '../../src/middleware/webhook-verify';
import { createWebhookRouter } from '../../src/routes/webhooks';

describe('createWebhookRouter', () => {
  it('queues job for valid push webhook', async () => {
    resetWebhookReplayCacheForTests();

    const enqueueFromPushEvent = vi.fn(async () => ({
      jobId: 'job-123',
      matchedFiles: 1,
      externals: 0,
    }));

    const app = express();
    app.use(
      '/api/github/webhooks',
      createWebhookRouter({
        importService: { enqueueFromPushEvent },
        verificationMiddleware: createWebhookVerificationMiddleware({ secret: 'test-secret' }),
      }),
    );
    app.use(errorHandler);

    const payload = {
      ref: 'refs/heads/main',
      installation: { id: 99 },
      repository: {
        name: 'ontologies',
        owner: { login: 'acme' },
      },
      commits: [
        {
          added: ['ontologies/core.owl'],
          modified: [],
        },
      ],
    };

    const payloadJson = JSON.stringify(payload);
    const signature = createGitHubSignature('test-secret', Buffer.from(payloadJson));

    const response = await request(app)
      .post('/api/github/webhooks')
      .set('content-type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', 'delivery-webhooks-1')
      .set('x-hub-signature-256', signature)
      .send(payloadJson);

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('queued');
    expect(response.body.jobId).toBe('job-123');
    expect(enqueueFromPushEvent).toHaveBeenCalledTimes(1);
  });
});

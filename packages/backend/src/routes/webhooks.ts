import express, { Router } from 'express';
import type { RequestHandler } from 'express';
import { HttpError } from '../middleware/error-handler';
import {
	createWebhookVerificationMiddleware,
	parseWebhookJsonPayload,
} from '../middleware/webhook-verify';
import type { ImportService } from '../services/import-service';

export interface WebhookRouterOptions {
	importService: Pick<ImportService, 'enqueueFromPushEvent'>;
	verificationMiddleware?: RequestHandler;
}

export function createWebhookRouter(options: WebhookRouterOptions): Router {
	const router = Router();
	const verify = options.verificationMiddleware ?? createWebhookVerificationMiddleware();

	router.post(
		'/',
		express.raw({ type: 'application/json' }),
		verify,
		async (request, response, next) => {
			try {
				const event = request.header('x-github-event')?.toLowerCase();
				const deliveryId = request.header('x-github-delivery') ?? undefined;

				if (event === undefined) {
					throw new HttpError(400, 'missing_event_type', 'Missing X-GitHub-Event header.');
				}

				if (event === 'ping') {
					response.status(200).json({ status: 'ok' });
					return;
				}

				if (event !== 'push') {
					response.status(202).json({
						status: 'ignored',
						reason: `Unsupported event type: ${event}`,
					});
					return;
				}

				if (!Buffer.isBuffer(request.body)) {
					throw new HttpError(400, 'invalid_payload', 'Webhook payload body must be raw bytes.');
				}

				const payload = parseWebhookJsonPayload(request.body);
				const queued = await options.importService.enqueueFromPushEvent(payload, deliveryId);

				response.status(202).json({
					status: 'queued',
					jobId: queued.jobId,
					matchedFiles: queued.matchedFiles,
					externals: queued.externals,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

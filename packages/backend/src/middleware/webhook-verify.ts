import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './error-handler';

const DEFAULT_REPLAY_TTL_MS = 10 * 60 * 1000;

interface ReplayCacheEntry {
	expiresAt: number;
}

export interface WebhookVerificationOptions {
	secret?: string;
	replayTtlMs?: number;
	now?: () => number;
}

export interface VerifiedWebhook {
	deliveryId: string;
	signature: string;
}

const replayCache = new Map<string, ReplayCacheEntry>();

export function createWebhookVerificationMiddleware(
	options: WebhookVerificationOptions = {},
): RequestHandler {
	const secret = options.secret ?? resolveWebhookSecret();
	const replayTtlMs = options.replayTtlMs ?? DEFAULT_REPLAY_TTL_MS;
	const now = options.now ?? Date.now;

	return (request, _response, next) => {
		const signature = request.header('x-hub-signature-256');
		if (signature === undefined || signature.trim().length === 0) {
			next(new HttpError(401, 'missing_signature', 'Missing X-Hub-Signature-256 header.'));
			return;
		}

		const deliveryId = request.header('x-github-delivery');
		if (deliveryId === undefined || deliveryId.trim().length === 0) {
			next(new HttpError(400, 'missing_delivery_id', 'Missing X-GitHub-Delivery header.'));
			return;
		}

		const payload = request.body;
		if (!Buffer.isBuffer(payload)) {
			next(
				new HttpError(
					400,
					'invalid_webhook_body',
					'Webhook payload must be parsed as a raw Buffer before signature verification.',
				),
			);
			return;
		}

		pruneReplayCache(now());
		if (isDeliveryIdReplayed(deliveryId, now())) {
			next(new HttpError(409, 'replayed_delivery', `Delivery ID has already been processed: ${deliveryId}`));
			return;
		}

		const expected = createGitHubSignature(secret, payload);
		if (!safeCompare(signature, expected)) {
			next(new HttpError(401, 'invalid_signature', 'Webhook signature verification failed.'));
			return;
		}

		rememberDeliveryId(deliveryId, now(), replayTtlMs);
		next();
	};
}

export function parseWebhookJsonPayload(payload: Buffer): unknown {
	const raw = payload.toString('utf8');

	try {
		return JSON.parse(raw) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new HttpError(400, 'invalid_payload_json', `Webhook payload JSON is invalid: ${message}`);
	}
}

export function resolveWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
	const secret = env.GITHUB_WEBHOOK_SECRET;
	if (secret === undefined || secret.trim().length === 0) {
		throw new Error('Missing required environment variable: GITHUB_WEBHOOK_SECRET');
	}

	return secret;
}

export function createGitHubSignature(secret: string, payload: Buffer): string {
	const digest = createHmac('sha256', secret).update(payload).digest('hex');
	return `sha256=${digest}`;
}

export function resetWebhookReplayCacheForTests(): void {
	replayCache.clear();
}

function rememberDeliveryId(deliveryId: string, now: number, replayTtlMs: number): void {
	replayCache.set(deliveryId, {
		expiresAt: now + replayTtlMs,
	});
}

function isDeliveryIdReplayed(deliveryId: string, now: number): boolean {
	const entry = replayCache.get(deliveryId);
	if (entry === undefined) {
		return false;
	}

	if (entry.expiresAt <= now) {
		replayCache.delete(deliveryId);
		return false;
	}

	return true;
}

function pruneReplayCache(now: number): void {
	for (const [deliveryId, entry] of replayCache.entries()) {
		if (entry.expiresAt <= now) {
			replayCache.delete(deliveryId);
		}
	}
}

function safeCompare(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return timingSafeEqual(leftBuffer, rightBuffer);
}

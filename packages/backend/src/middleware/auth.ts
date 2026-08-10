import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './error-handler';

export interface AdminAuthOptions {
	token?: string;
}

export function resolveAdminToken(env: NodeJS.ProcessEnv = process.env): string {
	const token = env.ADMIN_TOKEN;
	if (token === undefined || token.trim().length === 0) {
		throw new Error('Missing required environment variable: ADMIN_TOKEN');
	}

	return token;
}

export function createAdminAuthMiddleware(options: AdminAuthOptions = {}): RequestHandler {
	const expectedToken = options.token ?? resolveAdminToken();

	return (request, _response, next) => {
		const header = request.header('authorization');
		if (header === undefined || !header.startsWith('Bearer ')) {
			next(new HttpError(401, 'missing_bearer_token', 'Bearer token is required.'));
			return;
		}

		const token = header.slice('Bearer '.length).trim();
		if (token.length === 0) {
			next(new HttpError(401, 'invalid_bearer_token', 'Bearer token is required.'));
			return;
		}

		if (!isTokenMatch(expectedToken, token)) {
			next(new HttpError(403, 'forbidden', 'Admin token is invalid.'));
			return;
		}

		next();
	};
}

function isTokenMatch(expectedToken: string, candidateToken: string): boolean {
	const expected = Buffer.from(expectedToken);
	const candidate = Buffer.from(candidateToken);

	if (expected.length !== candidate.length) {
		return false;
	}

	return timingSafeEqual(expected, candidate);
}

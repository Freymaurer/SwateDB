import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export interface ErrorResponseBody {
	error: {
		code: string;
		message: string;
		details?: unknown;
	};
}

export class HttpError extends Error {
	public readonly statusCode: number;
	public readonly code: string;
	public readonly details?: unknown;

	public constructor(
		statusCode: number,
		code: string,
		message: string,
		details?: unknown,
	) {
		super(message);
		this.name = 'HttpError';
		this.statusCode = statusCode;
		this.code = code;
		this.details = details;
	}
}

export const notFoundHandler: RequestHandler = (request, response) => {
	const payload: ErrorResponseBody = {
		error: {
			code: 'not_found',
			message: `Route ${request.method} ${request.originalUrl} was not found.`,
		},
	};

	response.status(404).json(payload);
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
	void _next;
	const normalizedError = toHttpError(error);

	const payload: ErrorResponseBody = {
		error: {
			code: normalizedError.code,
			message: normalizedError.message,
			details: normalizedError.details,
		},
	};

	response.status(normalizedError.statusCode).json(payload);
};

function toHttpError(error: unknown): HttpError {
	if (error instanceof HttpError) {
		return error;
	}

	if (error instanceof ZodError) {
		return new HttpError(400, 'validation_error', 'Request validation failed.', error.issues);
	}

	if (error instanceof Error) {
		return new HttpError(500, 'internal_error', error.message);
	}

	return new HttpError(500, 'internal_error', 'An unexpected error occurred.');
}

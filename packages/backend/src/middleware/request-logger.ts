import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { RequestHandler } from 'express';
import pino from 'pino';

const HEADER_REQUEST_ID = 'x-request-id';
const ATTRIBUTE_REQUEST_ID = 'requestId';
const ATTRIBUTE_START_TIME = 'requestStartTime';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-hub-signature-256',
  'cookie',
  'set-cookie',
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'api_key',
  'apikey',
  'api-key',
  'secret',
  'password',
  'admin_token',
  'admin-token',
]);

const SENSITIVE_BODY_FIELDS = new Set([
  'token',
  'secret',
  'password',
  'privateKey',
  'private_key',
  'apiKey',
  'api_key',
  'adminToken',
  'admin_token',
  'accessToken',
  'access_token',
]);

let sharedLogger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (sharedLogger === null) {
    sharedLogger = pino({
      name: 'swatedb-backend',
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-hub-signature-256"]',
          'req.headers.cookie',
          'req.remoteAddress',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req) => {
          if (req === undefined || req === null) {
            return req;
          }

          return {
            method: req.method,
            url: req.url,
            headers: redactSensitiveHeaders(req.headers),
            remoteAddress: req.remoteAddress,
          };
        },
        res: (res) => {
          if (res === undefined || res === null) {
            return res;
          }

          return {
            statusCode: res.statusCode,
            headers: res.getHeaders ? redactSensitiveHeaders(res.getHeaders()) : undefined,
          };
        },
      },
    });
  }

  return sharedLogger;
}

export function getRequestId(req: IncomingMessage): string | undefined {
  return (req as unknown as Record<string, unknown>)[ATTRIBUTE_REQUEST_ID] as string | undefined;
}

export function assignRequestId(req: IncomingMessage): string {
  const existing = (req as unknown as Record<string, unknown>)[ATTRIBUTE_REQUEST_ID] as string | undefined;
  if (existing !== undefined) {
    return existing;
  }

  const id = randomUUID();
  (req as unknown as Record<string, unknown>)[ATTRIBUTE_REQUEST_ID] = id;
  return id;
}

export function createRequestLoggerMiddleware(): RequestHandler {
  const logger = getLogger();

  return (req, res, next) => {
    const requestId = (req.headers[HEADER_REQUEST_ID] as string | undefined) ?? randomUUID();
    (req as unknown as Record<string, unknown>)[ATTRIBUTE_REQUEST_ID] = requestId;
    (req as unknown as Record<string, unknown>)[ATTRIBUTE_START_TIME] = Date.now();

    res.setHeader(HEADER_REQUEST_ID, requestId);

    res.once('finish', () => {
      const startTime = (req as unknown as Record<string, unknown>)[ATTRIBUTE_START_TIME] as number;
      const responseTimeMs = Date.now() - startTime;

      if (res.statusCode >= 500) {
        logger.error(
          {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTimeMs,
            requestId,
          },
          `request completed: ${req.method} ${req.url} ${res.statusCode}`,
        );
      } else if (res.statusCode >= 400) {
        logger.warn(
          {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTimeMs,
            requestId,
          },
          `request completed: ${req.method} ${req.url} ${res.statusCode}`,
        );
      } else {
        logger.info(
          {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTimeMs,
            requestId,
          },
          `request completed: ${req.method} ${req.url} ${res.statusCode}`,
        );
      }
    });

    next();
  };
}

function redactSensitiveHeaders(headers: Record<string, string | string[] | undefined> | undefined): Record<string, string | string[] | undefined> | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const sanitized: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function isSensitiveQueryParam(param: string): boolean {
  return SENSITIVE_QUERY_PARAMS.has(param.toLowerCase());
}

export function isSensitiveBodyField(field: string): boolean {
  return SENSITIVE_BODY_FIELDS.has(field);
}

export function sanitizeBodyForLogging(body: unknown): unknown {
  if (body === null || body === undefined) {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBodyForLogging(item));
  }

  if (typeof body === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_BODY_FIELDS.has(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  return body;
}

export function resetLoggerForTests(): void {
  sharedLogger = null;
}

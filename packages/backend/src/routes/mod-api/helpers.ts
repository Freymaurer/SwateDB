import type { Request } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/error-handler';

export type ResponseFormat = 'html' | 'jsonld' | 'ttl' | 'rdfxml';

const supportedFormats: ResponseFormat[] = ['html', 'jsonld'];

export interface ParsedCollectionQuery {
  page: number;
  pageSize: number;
  format: ResponseFormat;
  display: string[] | 'all';
}

const baseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pagesize: z.coerce.number().int().positive().max(200).default(50),
  format: z.enum(['html', 'jsonld', 'ttl', 'rdfxml']).optional(),
  display: z.union([z.string(), z.array(z.string())]).optional(),
});

const searchQuerySchema = baseQuerySchema.extend({
  q: z.string().min(1, 'Query parameter q is required.'),
});

export interface ParsedSearchQuery extends ParsedCollectionQuery {
  q: string;
}

export function parseCollectionQuery(request: Request): ParsedCollectionQuery {
  const parsed = baseQuerySchema.parse(request.query);
  const format = resolveFormat(request, parsed.format);

  return {
    page: parsed.page,
    pageSize: parsed.pagesize,
    format,
    display: parseDisplayParam(parsed.display),
  };
}

export function parseSearchQuery(request: Request): ParsedSearchQuery {
  const parsed = searchQuerySchema.parse(request.query);
  const format = resolveFormat(request, parsed.format);

  return {
    q: parsed.q,
    page: parsed.page,
    pageSize: parsed.pagesize,
    format,
    display: parseDisplayParam(parsed.display),
  };
}

export function paginate<T>(
  request: Request,
  members: readonly T[],
  totalItems: number,
  page: number,
  pageSize: number,
): {
  '@id': string;
  '@type': string;
  totalItems: number;
  itemsPerPage: number;
  member: readonly T[];
  view: {
    '@id': string;
    '@type': string;
    'hydra:first': string;
    'hydra:last': string;
    'hydra:previous'?: string;
    'hydra:next'?: string;
  };
} {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const boundedPage = Math.min(page, totalPages);

  const firstUrl = withPage(request, 1, pageSize);
  const lastUrl = withPage(request, totalPages, pageSize);
  const currentUrl = withPage(request, boundedPage, pageSize);

  return {
    '@id': currentUrl,
    '@type': 'hydra:Collection',
    totalItems,
    itemsPerPage: pageSize,
    member: members,
    view: {
      '@id': currentUrl,
      '@type': 'hydra:PartialCollectionView',
      'hydra:first': firstUrl,
      'hydra:last': lastUrl,
      ...(boundedPage > 1
        ? {
            'hydra:previous': withPage(request, boundedPage - 1, pageSize),
          }
        : {}),
      ...(boundedPage < totalPages
        ? {
            'hydra:next': withPage(request, boundedPage + 1, pageSize),
          }
        : {}),
    },
  };
}

export function toJsonLd<T extends Record<string, unknown>>(
  body: T,
  display: string[] | 'all',
): Record<string, unknown> {
  if (display === 'all') {
    return body;
  }

  const preserved = new Set<string>(['@context', '@id', '@type']);
  const requested = new Set(display.map((entry) => entry.trim()).filter((entry) => entry.length > 0));

  if (requested.size === 0) {
    return body;
  }

  const selected: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (preserved.has(key) || requested.has(key)) {
      selected[key] = value;
    }
  }

  return selected;
}

export function sendByFormat(
  request: Request,
  responseBody: Record<string, unknown>,
  format: ResponseFormat,
): {
  contentType: string;
  body: string | Record<string, unknown>;
} {
  switch (format) {
    case 'jsonld':
      return {
        contentType: 'application/ld+json',
        body: responseBody,
      };
    case 'html':
      return {
        contentType: 'text/html',
        body: renderHtmlPayload(request.path, responseBody),
      };
    case 'ttl':
    case 'rdfxml':
      throw new HttpError(
        406,
        'unsupported_format',
        `Requested format '${format}' is recognized but not supported at runtime.`,
      );
    default:
      throw new HttpError(406, 'unsupported_format', `Unsupported format: ${String(format)}`);
  }
}

export function parseDisplayParam(value: string | string[] | undefined): string[] | 'all' {
  if (value === undefined) {
    return 'all';
  }

  const entries = Array.isArray(value)
    ? value.flatMap((entry) => entry.split(','))
    : value.split(',');

  const normalized = entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  if (normalized.length === 0 || normalized.includes('all')) {
    return 'all';
  }

  return normalized;
}

function resolveFormat(request: Request, explicit: ResponseFormat | undefined): ResponseFormat {
  const format = explicit ?? fromAcceptHeader(request.header('accept'));

  if (!supportedFormats.includes(format) && (format === 'ttl' || format === 'rdfxml')) {
    return format;
  }

  if (!supportedFormats.includes(format)) {
    throw new HttpError(406, 'unsupported_format', `Unsupported format requested: ${format}`);
  }

  return format;
}

function fromAcceptHeader(header: string | undefined): ResponseFormat {
  if (header === undefined || header.trim().length === 0 || header.includes('*/*')) {
    return 'jsonld';
  }

  const normalized = header.toLowerCase();

  if (normalized.includes('text/html')) {
    return 'html';
  }

  if (normalized.includes('application/ld+json') || normalized.includes('application/json')) {
    return 'jsonld';
  }

  if (normalized.includes('text/turtle')) {
    return 'ttl';
  }

  if (normalized.includes('application/rdf+xml')) {
    return 'rdfxml';
  }

  return 'jsonld';
}

function withPage(request: Request, page: number, pageSize: number): string {
  const url = new URL(`${request.protocol}://${request.get('host')}${request.baseUrl}${request.path}`);

  for (const [key, value] of Object.entries(request.query)) {
    if (key !== 'page' && key !== 'pagesize') {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  url.searchParams.set('page', String(page));
  url.searchParams.set('pagesize', String(pageSize));

  return url.toString();
}

function renderHtmlPayload(pathname: string, payload: Record<string, unknown>): string {
  const escaped = JSON.stringify(payload, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SwateDB MOD API - ${pathname}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin: 24px; background: #f6f8fa; color: #1f2328; }
    h1 { font-size: 18px; margin-bottom: 12px; }
    pre { background: white; border: 1px solid #d1d9e0; border-radius: 8px; padding: 16px; overflow: auto; }
  </style>
</head>
<body>
  <h1>SwateDB MOD API response</h1>
  <pre>${escaped}</pre>
</body>
</html>`;
}

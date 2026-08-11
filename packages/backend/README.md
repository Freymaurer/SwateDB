# @swatedb/backend

Backend microservice package for ingestion, indexing, and MOD-API delivery.

Status: Phase 3a + 3b + 3c + 3d + 7 implemented.

## Implemented in Phase 3a

- Express server bootstrap with graceful startup and shutdown.
- Neo4j driver lifecycle helpers and connectivity checks.
- Schema bootstrap for required constraints and fulltext indexes.
- Transactional chunked ontology import with idempotent MERGE behavior.
- Health endpoint with component status for Neo4j, Redis, and JVM parser availability.
- BullMQ and Redis resource lifecycle setup.
- Centralized JSON error middleware.
- Unit tests and Neo4j integration tests (testcontainers).

## Implemented in Phase 3b

- GitHub App repository client with installation-scoped authentication.
- Webhook endpoint at /api/github/webhooks with signature verification and replay protection.
- Import planning service that reads .swatedb.yml include/exclude and externals.
- BullMQ queue APIs for enqueueing, listing, and reading job status.
- Queue worker startup with progress reporting and concurrency set to 2.
- Admin API routes:
	- POST /api/admin/sync
	- GET /api/admin/jobs
	- GET /api/admin/jobs/:id
- Bearer token auth middleware for admin routes.
- Unit tests for webhook auth failures, valid push queueing, include/exclude filtering, and import pipeline flow.

## Implemented in Phase 3c

- MOD API endpoints implemented:
	- /
	- /records
	- /records/:artefactID
	- /doc/api
	- /artefacts
	- /artefacts/:artefactID
	- /artefacts/:artefactID/distributions
	- /artefacts/:artefactID/distributions/:distributionID
	- /artefacts/:artefactID/distributions/latest
	- /artefacts/:artefactID/record
	- /artefacts/:artefactID/resources
	- /artefacts/:artefactID/resources/:resourceID
	- /artefacts/:artefactID/resources/classes
	- /artefacts/:artefactID/resources/concepts
	- /artefacts/:artefactID/resources/properties
	- /artefacts/:artefactID/resources/individuals
	- /artefacts/:artefactID/resources/schemes
	- /artefacts/:artefactID/resources/collections
	- /artefacts/:artefactID/resources/labels
	- /search
	- /search/content
	- /search/metadata
- Swagger UI is served at /doc/api with auto-generated OpenAPI spec from @openapi JSDoc annotations on route handlers.
- Format/query helpers added for format/display/page/pagesize/q parsing.
- JSON-LD response helpers with Hydra pagination view fields.
- Runtime 406 handling for recognized but unsupported formats (ttl, rdfxml).
- Unit tests include path coverage for all required MOD API endpoints.

## Implemented in Phase 3d

- Dedicated backend contract test suite command: `npm run test:contract`.
- OpenAPI drift gate that compares auto-generated endpoint coverage against `docs/openapi.yaml` reference path definitions.
- Snapshot fixtures for representative JSON-LD responses (`artefacts` collection and `search` collection).
- CI contract-gate job that fails on route coverage drift, schema mismatch, or snapshot mismatch.

## Implemented in Phase 7

- Structured JSON request logging with pino (request IDs, latency, method/url/status).
- Sensitive headers and body fields redacted from log output (Authorization, webhook signatures, tokens).
- Rate limiting for webhook routes (60 req/min), admin routes (30 req/min), and public API (1000 req/min).
- Helmet security headers enabled (HSTS, CSP, X-Frame-Options, etc.).
- Neo4j connectivity retry with capped exponential backoff (5 attempts, 500ms base, 10s max).
- Connection pool configuration for Neo4j driver (max 100 connections, 30s acquisition timeout).
- Error responses include `requestId` field for log correlation.
- Worker event logging migrated from `console` to structured pino output.

## Environment Variables

- PORT
- NEO4J_URI
- NEO4J_USER
- NEO4J_PASSWORD
- REDIS_URL
- JAVA_BRIDGE_JAR_PATH
- LOG_LEVEL (optional)
- GITHUB_API_BASE_URL (optional, defaults to https://api.github.com)
- GITHUB_APP_ID
- GITHUB_PRIVATE_KEY
- GITHUB_WEBHOOK_SECRET
- ADMIN_TOKEN

## Error Response Shape

All error responses follow this structure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [...]
  },
  "requestId": "a1b2c3d4-..."
}
```

The `requestId` matches the `x-request-id` response header and the request log entry for troubleshooting.

## Current Commands

```bash
npm run lint
npm run build
npm run dev
npm run start
npm run test
npm run test:contract
npm run test:unit
npm run test:integration
```

`npm run dev` runs the backend directly from TypeScript source with hot reload using `tsx watch`.

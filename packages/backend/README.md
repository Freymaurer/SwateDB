# @swatedb/backend

Backend microservice package for ingestion, indexing, and MOD-API delivery.

Status: Phase 3a + 3b implemented.

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

## Current Commands

```bash
npm run lint
npm run build
npm run test
npm run test:unit
npm run test:integration
```

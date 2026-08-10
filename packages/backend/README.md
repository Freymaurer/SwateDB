# @swatedb/backend

Backend microservice package for ingestion, indexing, and MOD-API delivery.

Status: Phase 3a + 3b + 3c implemented.

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
- Swagger UI is exposed at /doc/api from root openapi.yaml.
- Format/query helpers added for format/display/page/pagesize/q parsing.
- JSON-LD response helpers with Hydra pagination view fields.
- Runtime 406 handling for recognized but unsupported formats (ttl, rdfxml).
- Unit tests include path coverage for all required MOD API endpoints.

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
npm run dev
npm run start
npm run test
npm run test:unit
npm run test:integration
```

`npm run dev` runs the backend directly from TypeScript source with hot reload using `tsx watch`.

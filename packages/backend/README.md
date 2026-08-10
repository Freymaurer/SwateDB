# @swatedb/backend

Backend microservice package for ingestion, indexing, and MOD-API delivery.

Status: Phase 3a core implemented.

## Implemented in Phase 3a

- Express server bootstrap with graceful startup and shutdown.
- Neo4j driver lifecycle helpers and connectivity checks.
- Schema bootstrap for required constraints and fulltext indexes.
- Transactional chunked ontology import with idempotent MERGE behavior.
- Health endpoint with component status for Neo4j, Redis, and JVM parser availability.
- BullMQ and Redis resource lifecycle setup.
- Centralized JSON error middleware.
- Unit tests and Neo4j integration tests (testcontainers).

## Environment Variables

- PORT
- NEO4J_URI
- NEO4J_USER
- NEO4J_PASSWORD
- REDIS_URL
- JAVA_BRIDGE_JAR_PATH
- LOG_LEVEL (optional)

## Current Commands

```bash
npm run lint
npm run build
npm run test
npm run test:unit
npm run test:integration
```

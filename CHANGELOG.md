# Changelog

All notable changes to the SwateDB project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- Monorepo scaffolding with npm workspaces, TypeScript strict config, ESLint, and Prettier (Phase 0)
- Java OWL/OBO parser producing shaded fat JAR with CLI entrypoint (Phase 1)
- TypeScript ontology library wrapping Java parser via java-bridge with Zod validation (Phase 2)
- Backend Express server with Neo4j driver, schema initialization, and chunked idempotent imports (Phase 3a)
- GitHub App integration for installation-scoped repository access (Phase 3b)
- Webhook endpoint with signature verification and replay protection (Phase 3b)
- Admin API routes (sync, jobs list, job detail) with bearer token authentication (Phase 3b)
- BullMQ job queue with Redis-backed workers, progress reporting, and exponential retry (Phase 3b)
- Full MOD-API endpoint implementation (22 endpoints) with JSON-LD output (Phase 3c)
- Swagger UI serving openapi.yaml at /doc/api (Phase 3c)
- Format negotiation (HTML, JSON-LD) with runtime 406 for unsupported formats (Phase 3c)
- Hydra pagination helpers (Phase 3c)
- MOD-API contract test suite with AJV schema validation and OpenAPI drift gates (Phase 3d)
- React + Vite admin frontend with daisyUI (Dashboard, Import Log, Manual Sync) (Phase 4)
- Docker Compose stack with Neo4j, Redis, backend, and frontend services (Phase 5)
- Development compose override with hot reload and debug ports (Phase 5)
- CI tools CLI (validate, validate-all, check-duplicates, setup-templates) (Phase 6)
- Reusable ontology CI template workflow and issue templates (Phase 6)
- Structured pino request logging with request IDs and latency fields (Phase 7)
- Rate limiting for webhook, admin, and public API routes (Phase 7)
- Neo4j retry policy with capped exponential backoff for transient failures (Phase 7)
- Secrets redaction in logs for sensitive headers and body fields (Phase 7)
- Docker publish workflow for tag-based GHCR publishing (Phase 7)

## Plan: SwateDB Ontology Microservice (Revised)

> Design source: Microservice.md
> API source: openapi.yaml
> Execution rule: complete phases in order; each phase must pass its own verification gate before continuing.

## 1. Objective

Build an open-source, docker-compose deployable microservice platform that:

1. Imports and maintains ontology data in Neo4j from GitHub repositories.
2. Parses .owl and .obo using a Java parser wrapped by TypeScript.
3. Implements the MOD-API endpoints defined in openapi.yaml.
4. Exposes OpenAPI documentation.
5. Provides CI tooling for ontology repositories.
6. Provides a minimal admin frontend for sync visibility and control.

## 2. Requirements Traceability

Use these requirement IDs in commits, PRs, and test names.

| ID | Requirement | Covered In |
|---|---|---|
| REQ-01 | Full stack deployable with docker-compose | Phases 5, 7 |
| REQ-02 | Parse .owl and .obo reliably | Phases 1, 2 |
| REQ-03 | Shared parsing logic for service and CI | Phases 2, 6 |
| REQ-04 | GitHub webhook-driven imports | Phase 3b |
| REQ-05 | Config-driven include/exclude + externals | Phases 2, 3b |
| REQ-06 | Neo4j schema and efficient import process | Phase 3a |
| REQ-07 | MOD-API endpoint compatibility | Phases 3c, 3d |
| REQ-08 | OpenAPI docs endpoint | Phase 3c |
| REQ-09 | Minimal frontend status UI | Phase 4 |
| REQ-10 | Repository bootstrap from GitHub source of truth | Phases 3b, 5 |
| REQ-11 | Security controls for admin and webhooks | Phases 3b, 7 |
| REQ-12 | CI template + issue templates for ontology repos | Phase 6 |

## 3. Global Engineering Rules

1. No use of any in TypeScript production code.
2. Every public function in ontology-lib and backend/src/db has at least one test.
3. Every phase updates relevant README files and .env.example.
4. Every phase has a commit: phase N: short description.
5. Never commit .env, private keys, or tokens.
6. Root quality gate after each phase: npm run lint && npm run build && npm test.
7. If root commands are not yet available in early scaffolding, add temporary scripts so the gate still runs.

## 4. Target Repository Layout

SwateDB/
|- .github/
|  |- workflows/
|  |  |- ci.yml
|  |  |- docker-publish.yml
|  |  |- ontology-ci-template.yml
|  |- ISSUE_TEMPLATE/
|  |  |- new-term-request.yml
|  |  |- bug-report.yml
|  |- PULL_REQUEST_TEMPLATE.md
|- packages/
|  |- java-parser/
|  |  |- src/main/java/com/swatedb/parser/
|  |  |  |- OntologyParser.java
|  |  |  |- OntologyParserCli.java
|  |  |  |- model/
|  |  |  |- format/
|  |  |- src/test/java/
|  |  |- pom.xml
|  |  |- README.md
|  |- ontology-lib/
|  |  |- src/
|  |  |  |- bridge.ts
|  |  |  |- parser.ts
|  |  |  |- model.ts
|  |  |  |- validator.ts
|  |  |  |- config.ts
|  |  |- tests/
|  |  |- package.json
|  |  |- README.md
|  |- backend/
|  |  |- src/
|  |  |  |- index.ts
|  |  |  |- db/
|  |  |  |- routes/
|  |  |  |  |- mod-api/
|  |  |  |- services/
|  |  |  |- middleware/
|  |  |  |- openapi/
|  |  |- tests/unit/
|  |  |- tests/integration/
|  |  |- Dockerfile
|  |  |- README.md
|  |- frontend/
|     |- src/
|     |- Dockerfile
|     |- README.md
|- ci-tools/
|  |- src/cli.ts
|  |- package.json
|  |- README.md
|- test-fixtures/
|- docker-compose.yml
|- docker-compose.dev.yml
|- .env.example
|- .eslintrc.cjs
|- .prettierrc
|- tsconfig.base.json
|- package.json
|- Plan.md
|- Microservice.md
|- openapi.yaml
|- README.md

## 5. Phase Plan

### Phase 0: Monorepo Scaffolding and Tooling

Goal:
Create a stable monorepo foundation with repeatable lint/build/test workflows.

Steps:
1. Initialize root package.json with npm workspaces for packages/* and ci-tools.
2. Add root scripts: lint, build, test, check, format.
3. Add tsconfig.base.json with strict compiler settings and project references.
4. Add ESLint and Prettier configuration for TypeScript.
5. Stub each package with package.json, tsconfig.json, and README.md placeholders.
6. Add CI workflow for Node 20 and Java 17 with npm and Maven caching.
7. Add pull request template and issue templates.
8. Add .gitignore for node_modules, dist, target, jars, env files, and local data volumes.
9. Create root README with architecture overview and quick start.

Verify:
1. npm ci succeeds at root.
2. npm run check succeeds.
3. Workflow YAML passes syntax validation.
4. Root README exists and links to all package READMEs.

Exit criteria:
All package directories exist with working scripts and CI runs end-to-end.

---

### Phase 1: Java Parser (packages/java-parser)

Goal:
Produce a fat JAR that parses .owl and .obo into a stable JSON model.

Steps:
1. Add Maven project with owlapi-distribution 5.1.x, jackson-databind, junit, and maven-shade-plugin.
2. Implement POJOs:
   - ParsedOntology: name, version, terms, metadata
   - ParsedTerm: accession, name, definition, isObsolete, synonyms, relationships
   - ParsedRelation: type, targetAccession
   - OntologyMetadata: title, description, license, creator, versionIRI
3. Implement OntologyParser.parseToJson(String filePath).
4. Implement OntologyParserCli main class for command-line usage and CI smoke tests.
5. Parse labels/definitions/IDs from relevant annotations and capture subclass/object property relations.
6. Add explicit ParserException with clear error messages for malformed files.
7. Add test fixtures: small.obo, small.owl, malformed.obo, obsolete-term fixture.
8. Add unit tests for success and failure paths.

Verify:
1. mvn -q clean package in packages/java-parser.
2. java -cp target/java-parser-<version>-all.jar com.swatedb.parser.OntologyParserCli ../../test-fixtures/small.obo outputs valid JSON.
3. mvn -q test passes.

Exit criteria:
Shaded JAR is produced and parser behavior is tested for both OWL and OBO.

---

### Phase 2: TypeScript Ontology Library (packages/ontology-lib)

Goal:
Wrap the Java parser via java-bridge, validate outputs, and provide config/validation utilities.

Steps:
1. Add dependencies: java-bridge, zod, yaml; dev dependencies: vitest, typescript.
2. Implement model.ts with TypeScript types and Zod schemas mirroring Java JSON.
3. Implement bridge.ts:
   - initJvm(jarPath)
   - ensureJvm singleton guard
   - parseOntologyFile(filePath)
   - typed ParserError mapping from Java exceptions
4. Implement config.ts for .swatedb.yml schema:
   - import.include[]
   - import.exclude[]
   - externals[]
   - settings
5. Implement parser.ts:
   - parseFile(filePath)
   - parseFromUrl(url) with timeout, size limit, protocol allowlist, and temporary-file cleanup
6. Implement validator.ts:
   - validateNoDuplicateAccessions
   - validateTermCompleteness
   - validateOntology
7. Add tests for config parsing, validators, and JVM integration with the real JAR.
8. Add CI dependency ordering: java-parser build before ontology-lib tests.

Verify:
1. npm run build in packages/ontology-lib.
2. npm test in packages/ontology-lib.
3. Integration test passes with JAVA_BRIDGE_JAR_PATH set.

Exit criteria:
ontology-lib is reusable by backend and CI tools, with runtime validation and tested error mapping.

---

### Phase 3a: Backend Core + Neo4j (packages/backend)

Goal:
Create core API server, reliable Neo4j connectivity, schema setup, and import pipeline primitives.

Steps:
1. Add dependencies: express, neo4j-driver, bullmq, ioredis, helmet, cors, dotenv, zod, pino.
2. Implement db/neo4j.ts with singleton driver, closeDriver, and connectivity health check.
3. Implement db/schema.ts:
   - unique constraint on Ontology.name
   - unique constraint on Term.accession
   - fulltext indexes matching schema requirements (TermName, TermDefinition, TermNameAndDefinition)
4. Implement db/import.ts with chunked UNWIND imports (size 1000 default) and transaction rollback on failure.
5. Add import idempotency behavior for repeated ontology imports (same ontology, same term accessions).
6. Implement index.ts startup/shutdown lifecycle for DB, Redis, and queue resources.
7. Implement routes/health.ts for neo4j, redis, and JVM checks.
8. Add centralized error middleware returning consistent JSON shape.
9. Add integration tests using testcontainers Neo4j.

Verify:
1. npm test in packages/backend passes integration tests.
2. Health endpoint returns 200 with component status details.
3. Re-importing same fixture does not create duplicates.

Exit criteria:
Backend can start, validate schema, import ontology data safely, and pass integration tests.

---

### Phase 3b: GitHub App, Webhooks, and Job Queue

Goal:
Implement GitHub-driven ingestion and secure admin controls.

Steps:
1. Implement services/github-app.ts for GitHub App auth and installation-scoped API access.
2. Implement services/import-service.ts:
   - read .swatedb.yml
   - apply include/exclude patterns
   - fetch externals URLs
   - enqueue import jobs
3. Implement services/job-queue.ts with BullMQ queue + worker, progress updates, and concurrency 2.
4. Add webhook route:
   - POST /api/github/webhooks
   - signature verification
   - replay protection by delivery ID
5. Add admin routes:
   - POST /api/admin/sync
   - GET /api/admin/jobs
   - GET /api/admin/jobs/:id
6. Add auth middleware for ADMIN_TOKEN bearer validation.
7. Add tests for invalid signature (401), valid push event, include/exclude filtering, and full pipeline.

Verify:
1. Invalid signature request is rejected.
2. Valid push queues a job and updates status.
3. Admin routes require valid bearer token.

Exit criteria:
Webhook ingestion and manual sync workflows are secure, observable, and tested.

---

### Phase 3c: MOD-API Endpoint Implementation

Goal:
Implement MOD-API routes from openapi.yaml with JSON-LD-first output and pagination.

Required endpoints:
1. /
2. /records
3. /records/{artefactID}
4. /doc/api
5. /artefacts
6. /artefacts/{artefactID}
7. /artefacts/{artefactID}/distributions
8. /artefacts/{artefactID}/distributions/{distributionID}
9. /artefacts/{artefactID}/distributions/latest
10. /artefacts/{artefactID}/record
11. /artefacts/{artefactID}/resources
12. /artefacts/{artefactID}/resources/{resourceID}
13. /artefacts/{artefactID}/resources/classes
14. /artefacts/{artefactID}/resources/concepts
15. /artefacts/{artefactID}/resources/properties
16. /artefacts/{artefactID}/resources/individuals
17. /artefacts/{artefactID}/resources/schemes
18. /artefacts/{artefactID}/resources/collections
19. /artefacts/{artefactID}/resources/labels
20. /search
21. /search/content
22. /search/metadata

Steps:
1. Implement route handlers under routes/mod-api for catalogue, artefacts, records, resources, distributions, and search.
2. Implement helpers:
   - toJsonLd
   - paginate with hydra view fields
   - parseFormatParam and parseDisplayParam
3. Implement OpenAPI docs route /doc/api with swagger-ui-express.
4. Implement query validation via Zod for q, page, pagesize, format, and display.
5. Define deterministic mapping from graph records to MOD response shapes.
6. Implement format behavior for format param and Accept negotiation.
   - If a format is unsupported at runtime, return 406 with clear error details.

Verify:
1. Endpoint test suite covers all paths listed above.
2. AJV schema validation passes for representative responses.
3. Pagination and search edge cases pass (special chars, out-of-range page).

Exit criteria:
All required MOD-API routes are implemented and contract-tested against openapi.yaml.

---

### Phase 3d: MOD-API Conformance and Contract Gates

Goal:
Turn API compatibility into a release gate.

Steps:
1. Add automated contract tests that execute HTTP calls and validate response payloads.
2. Add OpenAPI drift check to ensure backend route coverage matches openapi.yaml.
3. Add snapshot fixtures for representative JSON-LD outputs.
4. Add CI job that fails on any contract mismatch.

Verify:
1. Contract test job runs in CI.
2. Breaking response shape change fails the pipeline.

Exit criteria:
No release can pass without API contract compatibility checks.

---

### Phase 4: Frontend Admin Dashboard (packages/frontend)

Goal:
Provide a minimal but useful admin interface for sync visibility and control.

Steps:
1. Create React + Vite frontend.
2. Build views:
   - Dashboard (health, DB stats, latest imports)
   - Import log (job list)
   - Job detail
   - Manual sync trigger with confirmation
3. Implement token prompt and sessionStorage storage.
4. Wire all admin API calls with Authorization bearer token.
5. Add Dockerfile and nginx.conf with SPA fallback and /api proxy.

Verify:
1. npm run build succeeds.
2. docker build succeeds.
3. UI can authenticate and list jobs from running backend.

Exit criteria:
Frontend provides practical operational visibility and manual sync controls.

---

### Phase 5: Docker Compose and End-to-End Recovery

Goal:
Enable zero-to-running startup and repository-driven data recovery.

Steps:
1. Compose services:
   - neo4j:5-community
   - redis:7-alpine
   - backend image
   - frontend image
2. Add healthchecks and dependency conditions.
3. Add docker-compose.dev.yml with local mounts and debug ports.
4. Expand .env.example with all runtime variables and comments.
5. Document GitHub App setup and first sync flow in root README.
6. Add e2e smoke script for health, artefacts query, and frontend reachability.

Verify:
1. docker compose up -d starts all services cleanly.
2. /health returns 200.
3. /artefacts returns data after import.
4. Frontend loads and displays jobs.

Exit criteria:
Fresh environment can recover service state from GitHub source repositories.

---

### Phase 6: CI Tools and Ontology Template Workflow (ci-tools)

Goal:
Provide reusable CLI checks for ontology repositories and a template workflow.

Steps:
1. Implement CLI commands:
   - validate <file>
   - validate-all --config <path>
   - check-duplicates <dir>
2. Add --json output and deterministic exit codes:
   - 0 success
   - 1 validation errors
   - 2 parse/runtime failure
3. Publish executable via package.json bin field.
4. Add reusable workflow ontology-ci-template.yml using workflow_call.
5. Add issue templates for new-term requests and bug reports.
6. Add tests for argument parsing and exit code behavior.

Verify:
1. validate on a correct fixture exits 0.
2. malformed file exits 2.
3. duplicate ID case exits 1.
4. Workflow template passes YAML validation.

Exit criteria:
External ontology repositories can adopt a single CI template using shared parser logic.

---

### Phase 7: Hardening, Security, and Documentation Completion

Goal:
Prepare for production-like operation with clear docs and stronger guardrails.

Steps:
1. README audit for root and every package (purpose, setup, API or CLI, env vars).
2. Add structured logging via pino with request IDs and latency fields.
3. Ensure secrets are redacted from logs.
4. Add route-level protections:
   - helmet
   - rate limiting for webhook and admin routes
   - strict input validation for all query and body data
5. Add retry policy for transient Neo4j failures with capped exponential backoff.
6. Standardize error response shape: { error, details, requestId }.
7. Add docker-publish workflow for tag-based GHCR publishing.
8. Add root CHANGELOG.md.
9. Run npm audit with threshold high and fix blocking vulnerabilities.

Verify:
1. npm audit --audit-level=high returns zero high or critical vulnerabilities.
2. Logs are structured JSON and include request IDs.
3. Docker publish workflow validates and builds on v* tags.

Exit criteria:
System is documented, secured, and release-automation ready.

## 6. Testing Strategy by Level

1. Unit tests:
   - Java parser model extraction
   - TS validation and config parsing
   - API helper behavior (pagination, format parsing)
2. Integration tests:
   - parser bridge with real JAR
   - Neo4j imports with testcontainers
   - webhook to queue to import flow
3. Contract tests:
   - MOD-API endpoint coverage against openapi.yaml
4. End-to-end tests:
   - docker compose startup and first import

## 7. Risk Register and Mitigations

1. Risk: parser differences between OWL and OBO edge cases.
   Mitigation: shared fixtures, parser exception taxonomy, regression test set.
2. Risk: duplicate or conflicting term identifiers.
   Mitigation: strict validator + Neo4j unique constraint on Term.accession.
3. Risk: webhook abuse or replay.
   Mitigation: signature verification, delivery ID replay cache, rate limits.
4. Risk: API drift from openapi.yaml.
   Mitigation: mandatory contract gate in CI (Phase 3d).
5. Risk: large imports causing memory pressure.
   Mitigation: chunked DB writes, bounded queue concurrency, timeout and size guards.

## 8. Definition of Done

Project is complete when:

1. REQ-01 through REQ-12 each have passing tests and linked implementation evidence.
2. docker compose up yields healthy services and successful ontology import.
3. MOD-API endpoints listed in Phase 3c pass contract validation.
4. CI template works in a sample ontology repository.
5. Documentation enables first-time setup without tribal knowledge.

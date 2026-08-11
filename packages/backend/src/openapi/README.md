# Backend OpenAPI

This directory holds backend OpenAPI-related assets.

Current runtime behavior:

- Swagger UI is served at /doc/api.
- The spec is auto-generated from `@openapi` JSDoc annotations on Express route handlers via `swagger-jsdoc`.
- Shared components (schemas, parameters, responses) are loaded from `docs/openapi.yaml` at startup.
- OpenAPI drift gate (via vitest) detects drift between auto-generated paths and the reference spec at `docs/openapi.yaml`.

Status: Phase 3c integrated.

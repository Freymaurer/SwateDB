# Term Count MetricCard — Design

Date: 2026-08-24

## Goal

Add a `MetricCard` to the frontend dashboard showing the total number of term
items (`:Term` nodes) in the Neo4j database, backed by a new public MOD API
endpoint.

## Decisions

- **Scope:** global count of all `:Term` nodes across all ontologies (matches
  the existing "Artefacts"/"Records" metric style).
- **Endpoint:** public MOD API endpoint (no auth), consistent with how the
  dashboard already fetches Artefacts/Records totals from public endpoints.
- **Shape:** dedicated minimal stats endpoint returning plain JSON — NOT a
  full JSON-LD collection. Terms are a metric here, not a browsable
  collection; a full collection endpoint would require Term JSON-LD
  serialization that nothing consumes (YAGNI).

## Backend

1. `packages/backend/src/routes/mod-api/service.ts`
   - Add `countTerms(): Promise<number>` to `ModApiService` (interface +
     implementation).
   - Cypher: `MATCH (t:Term) RETURN count(t) AS count`
   - Follows existing session open/close + `toNumber` pattern used by
     `listArtefacts`/`listResources`.

2. New `packages/backend/src/routes/mod-api/terms.ts`
   - `createTermsRouter(service: Pick<ModApiService, 'countTerms'>)`
   - `GET /terms/count` → `200` `{ count: number }` plain JSON.
   - Includes `@openapi` JSDoc (new tag `Terms`) for spec generation.
   - try/catch → `next(error)` like sibling routers.

3. `packages/backend/src/index.ts`
   - Mount `app.use('/terms', createTermsRouter(modApiService))` alongside the
     other mod-api routers.

4. OpenAPI contract
   - The endpoint gets an `@openapi` JSDoc annotation so it appears in the
     auto-generated spec.
   - `docs/openapi.yaml` is a reference document (minimal API set) and is NOT
     edited. The drift test (`openapi-drift.test.ts`) only fails when a
     reference path is missing from the implementation; extra implemented
     routes are allowed.

## Frontend

5. `packages/frontend/src/api.ts`
   - Extend `DbStats` with `termsTotal: number`.
   - Add `getTermCount()`: fetches `/terms/count`, reads `{ count }`.
   - Include it in `getDbStats()`'s `Promise.all`.

6. `packages/frontend/src/components/DashboardView.tsx`
   - Add `<MetricCard label="Terms" value={dbStats?.termsTotal ?? 0} />` to the
     "Database Stats" grid.
   - Change grid to `grid-cols-2 lg:grid-cols-3 gap-4` so the third card lays
     out cleanly.

## Wiring

7. `packages/frontend/vite.config.ts`
   - Add `'/terms': proxyTarget` to the dev server proxy.

8. `packages/frontend/nginx.conf`
   - Add `location /terms { proxy_pass http://backend:3000; ... }` matching the
     existing route blocks.

## Error handling

- Backend: route errors flow through existing Express error middleware.
- Frontend: `?? 0` fallback on `termsTotal` keeps the card rendering 0 while
  the endpoint is unavailable (same behavior as existing cards).

## Testing

- Backend unit tests (vitest):
  - `service.countTerms()` returns the mocked count from `session.run`.
  - Route test: `GET /terms/count` → 200 with `{ count }` using a mocked
    service (follow `mod-api-routes.test.ts` patterns).
  - Contract tests (`openapi-drift`, snapshots) stay green after spec update.
- Frontend: no test framework present; verified via `tsc`/typecheck and
  `npm run build`.

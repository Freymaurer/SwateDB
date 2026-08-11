# SSE Job Updates — Design

**Date:** 2025-08-11
**Status:** approved

## Problem

The Import Log tab in the frontend polls `GET /api/admin/jobs?limit=100` every 15 seconds via `setInterval` (`App.tsx:59`). The selected job detail only refreshes as a side effect of this list poll (`App.tsx:121-124`). There is no per-job polling loop. This means:

- Job details can be up to 15 seconds stale.
- The polling happens regardless of whether any job is active.
- Newly triggered jobs (from Manual Sync) only appear after the next poll cycle.

## Goal

Replace polling with server-pushed updates so that jobs list and job detail refresh immediately when a job's state changes (progress, completion, failure).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport | SSE (Server-Sent Events) | No new dependencies; native `EventSource` in browsers with auto-reconnect; unidirectional is sufficient (server push only). |
| Update scope | All jobs broadcast | Simpler than per-job subscription; server pushes every job state change to all connected clients. |
| Auth on SSE stream | None | `EventSource` cannot send custom headers; job summaries are low-sensitivity for an internal admin dashboard. |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Backend (Express HTTP server)                       │
│                                                     │
│  BullMQ Worker ──> SSE Broker (EventEmitter)        │
│  (completed/                        │               │
│   failed/                           │               │
│   progress)                         ▼               │
│                        Set<Response> (connected      │
│                          SSE clients)                │
│                            │                         │
│                            │ text/event-stream       │
└────────────────────────────┼────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────┐
│ Frontend (Browser)         │                        │
│                            ▼                        │
│  EventSource ──> onmessage ──> upsert job in array  │
│  (auto-reconnect)               update selectedJob  │
│                                 (if matching ID)    │
└─────────────────────────────────────────────────────┘
```

## Backend Changes

### 1. New file: `packages/backend/src/services/sse-broker.ts`

An in-memory event broker:

- `SseEventType` type: `'job-updated'` (all job state changes)
- `SseEvent` payload: `{ type: 'job-updated', job: JobSummary }`
- Maintains a `Set<ServerResponse>` of connected SSE clients.
- `addClient(res: ServerResponse): void` — registers a client; sets up `res.on('close', ...)` cleanup.
- `broadcast(event: SseEvent): void` — writes the SSE-formatted event to every connected client.
- Export a singleton instance.

SSE wire format:
```
event: job-updated
data: {"id":"...","name":"...","state":"active","progress":42,...}

```

### 2. Modified: `packages/backend/src/services/job-queue.ts`

- Import and use the SSE broker singleton.
- In `startImportWorker()`, add listeners on the `sharedWorker` that call the SSE broker's `broadcast()`:
  - `worker.on('completed', ...)` — emits updated `JobSummary` (via `summarizeJob()`) for the completed job.
  - `worker.on('failed', ...)` — emits updated `JobSummary` for the failed job.
  - `worker.on('progress', ...)` — emits updated `JobSummary` for the in-progress job.
- Note: BullMQ's `progress` event fires on the worker. The worker already calls `job.updateProgress()`, so progress updates will flow naturally.

### 3. New route: `GET /api/admin/jobs/events`

Added to `createAdminRouter()` in `packages/backend/src/routes/admin.ts`, **outside** the `router.use(auth)` middleware block:

```typescript
router.get('/jobs/events', (request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // for nginx
  });
  response.write(':ok\n\n');  // initial keepalive comment
  sseBroker.addClient(response);
  request.on('close', () => sseBroker.removeClient(response));
});
```

- No auth middleware.
- Emits an initial keepalive comment (`:ok\n\n`) so the `EventSource` opens successfully immediately.

### 4. Modified: `packages/backend/src/routes/admin.ts`

- Accept an optional `sseBroker` parameter in `AdminRouterOptions`.
- Add the SSE route before the `router.use(auth)` line.
- Default the broker to the singleton if not provided (for testability).

### 5. Modified: `packages/backend/src/index.ts`

- Import and initialize the SSE broker singleton after queue resources are set up.
- Pass the broker instance to `createAdminRouter()`.

## Frontend Changes

### 1. New file: `packages/frontend/src/lib/sse.ts`

A custom hook `useJobEvents`:

```typescript
function useJobEvents(options: {
  token: string;
  onJobUpdated: (job: JobSummary) => void;
}): void
```

- Creates an `EventSource` pointing to `/api/admin/jobs/events`.
- On `message` event, parses JSON, calls `onJobUpdated(job)`.
- On `error` event, logs to console (the `EventSource` auto-reconnects).
- Closes the connection on effect cleanup.
- Only connects when `token.trim().length > 0`.

### 2. Modified: `packages/frontend/src/App.tsx`

**Remove:**
- The `setInterval` polling loop (lines 52-66).
- The individual job fetch `useEffect` (lines 68-89) — SSE will push updates to `selectedJob` directly.

**Add:**
- Call `useJobEvents` with a callback that:
  - Upserts the job into the `jobs` array: replace if `id` matches, otherwise prepend.
  - If the updated job's `id === selectedJobId`, update `setSelectedJob(job)`.
- Keep the initial `refreshDashboard()` call on mount (for `health`, `dbStats`, and the initial job list).
- Keep the `onSubmitSync` flow (trigger sync, switch to jobs tab, select job).

**Kept:**
- `getHealth()` and `getDbStats()` calls inside `refreshDashboard()`. These are non-job data and have no real-time equivalents. The 15s poll for them can remain as-is, or be split into a separate interval. Simplest: keep one 15s poll for health + db stats only (no jobs fetch).

### 3. No changes to:

- `JobsView.tsx` — purely presentational.
- `api.ts` — `getJob` and `getJobs` remain available for the initial fetch and manual refresh.
- `DashboardView.tsx` — receives `jobs` as a prop, which will be updated by SSE.

## Data Flow — Detailed

### Job lifecycle and SSE events:

1. User triggers sync → `POST /api/admin/sync` → BullMQ job queued with state `waiting`.
2. Worker picks up job → state becomes `active`.
3. Worker calls `job.updateProgress(n)` → BullMQ fires `progress` event → SSE broker broadcasts `{ type: 'job-updated', job: {...} }`.
4. Job completes → BullMQ fires `completed` event → SSE broker broadcasts final state.
5. Job fails → BullMQ fires `failed` event → SSE broker broadcasts failure state.

### Frontend state update:

```
SSE message received
  → parse JobSummary from JSON
  → upsert in jobs array (replace by id or prepend)
  → if id === selectedJobId → setSelectedJob(job)
  → DashboardView re-renders with fresh stats
```

## Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Server restarts | `EventSource` auto-reconnects; initial poll on reconnect fills gap. |
| SSE connection lost | `EventSource` auto-reconnects (browser default: ~3s backoff). |
| Token removed / expired | SSE connection closes (effect cleanup). User is prompted to re-enter token. |
| No jobs exist | SSE stream is silent; initial poll returns empty array. |
| Multiple tabs open | Each tab gets its own SSE connection; no coordination needed. |
| Nginx proxy | `X-Accel-Buffering: no` header disables nginx buffering for the SSE stream. |
| Client memory | Only latest `JobSummary` array in memory; no event history buffer. |

## Testing Strategy

### Backend

- **Unit test** (`tests/unit/sse-broker.test.ts`): Add/remove clients, broadcast to multiple clients, handle client disconnect.
- **Integration test**: Extend admin route tests to verify SSE endpoint sets correct headers and writes events.
- **Manual test**: `curl -N http://localhost:3000/api/admin/jobs/events` while triggering a sync from another terminal.

### Frontend

- **Manual test**: Open Import Log tab, trigger a sync, verify job list and detail update in real-time without 15s delay.
- **Edge case test**: Kill the server while the SSE connection is open, verify browser auto-reconnects on restart.

## OpenAPI Impact

No changes to `openapi.yaml`. SSE is not part of the OpenAPI specification format. The SSE endpoint is documented in code comments only.

## Migration

- No data migration needed.
- Backward compatible: the REST endpoints (`GET /jobs`, `GET /jobs/:id`) remain unchanged.
- If SSE is unavailable (old deployment), the frontend falls back gracefully — the initial REST fetch still populates jobs, and the "Refresh" button still works.

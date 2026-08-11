# SSE Job Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 15-second polling loop in the frontend with server-pushed SSE (Server-Sent Events), so job list and job detail update immediately when a job's state changes.

**Architecture:** New `SseBroker` class on the backend (in-memory event bus) that BullMQ worker events (`active`, `progress`, `completed`, `failed`) write into. A new `GET /api/admin/jobs/events` SSE endpoint streams those events to the frontend. The frontend subscribes via `EventSource` and upserts arriving `JobSummary` objects into state.

**Tech Stack:** TypeScript, Node.js HTTP (native), Express, BullMQ, React, Browser `EventSource` API. No new dependencies.

## Global Constraints

- No new npm dependencies (use Node.js native HTTP for SSE, browser `EventSource`).
- `summarizeJob` must be exported from `job-queue.ts` so the SSE broker can use it.
- All existing REST endpoints (`GET /jobs`, `GET /jobs/:id`, `POST /sync`) remain unchanged.
- Frontend must keep the initial `refreshDashboard()` call on mount (for health, DB stats, initial job list).
- No auth on the SSE endpoint (`EventSource` cannot send custom headers).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/backend/src/services/sse-broker.ts` | **Create** | In-memory SSE event broker (singleton) |
| `packages/backend/src/services/job-queue.ts` | **Modify** | Export `summarizeJob`; add SSE broadcast in worker event handlers |
| `packages/backend/src/routes/admin.ts` | **Modify** | Add `GET /api/admin/jobs/events` SSE route (no auth) |
| `packages/backend/src/index.ts` | **Modify** | Initialize SSE broker; pass to admin router |
| `packages/backend/tests/unit/sse-broker.test.ts` | **Create** | Unit tests for SSE broker |
| `packages/frontend/src/lib/sse.ts` | **Create** | `useJobEvents` React hook |
| `packages/frontend/src/App.tsx` | **Modify** | Remove 15s polling; wire up `useJobEvents` |

---

### Task 1: Create SSE Broker

**Files:**
- Create: `packages/backend/src/services/sse-broker.ts`
- Test: `packages/backend/tests/unit/sse-broker.test.ts`

**Interfaces:**
- Produces: `SseBroker` class with `addClient(res: ServerResponse): void`, `removeClient(res: ServerResponse): void`, `broadcast(type: SseEventType, payload: unknown): void`
- Produces: `SseEventType = 'job-updated'`

- [ ] **Step 1: Write the failing test file**

```typescript
// tests/unit/sse-broker.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SseBroker, getSseBroker, resetSseBrokerForTests } from '../../src/services/sse-broker';
import type { ServerResponse } from 'node:http';

function mockResponse(): ServerResponse {
  const chunks: string[] = [];
  const res = {
    writableEnded: false,
    write: vi.fn((chunk: string) => { chunks.push(chunk); return true; }),
    end: vi.fn(() => { (res as any).writableEnded = true; return res; }),
    on: vi.fn(),
    removeListener: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as ServerResponse;

  return { res, chunks };
}

describe('SseBroker', () => {
  beforeEach(() => {
    resetSseBrokerForTests();
  });

  it('addClient registers a client', () => {
    const broker = getSseBroker();
    const { res } = mockResponse();
    broker.addClient(res);
    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('broadcast writes to all connected clients', () => {
    const broker = getSseBroker();
    const { res: client1, chunks: chunks1 } = mockResponse();
    const { res: client2, chunks: chunks2 } = mockResponse();

    broker.addClient(client1);
    broker.addClient(client2);
    broker.broadcast('job-updated', { id: '1', name: 'test', state: 'completed' });

    expect(chunks1.length).toBeGreaterThan(0);
    expect(chunks2.length).toBeGreaterThan(0);

    const emitted1 = chunks1.join('');
    expect(emitted1).toContain('event: job-updated');
    expect(emitted1).toContain('"id":"1"');

    const emitted2 = chunks2.join('');
    expect(emitted2).toContain('event: job-updated');
    expect(emitted2).toContain('"id":"1"');
  });

  it('removeClient stops receiving broadcasts', () => {
    const broker = getSseBroker();
    const { res } = mockResponse();

    broker.addClient(res);
    broker.removeClient(res);
    broker.broadcast('job-updated', { id: '1' });

    expect(res.write).not.toHaveBeenCalled();
  });

  it('does not write to ended clients and removes them', () => {
    const broker = getSseBroker();
    const { res } = mockResponse();
    (res as any).writableEnded = true;

    broker.addClient(res);
    broker.broadcast('job-updated', { id: '1' });

    expect(res.write).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run tests/unit/sse-broker.test.ts
```
Expected: FAIL — module not found, types not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/backend/src/services/sse-broker.ts
import type { ServerResponse } from 'node:http';

export type SseEventType = 'job-updated';

export class SseBroker {
  private readonly clients = new Set<ServerResponse>();

  addClient(res: ServerResponse): void {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  removeClient(res: ServerResponse): void {
    this.clients.delete(res);
  }

  broadcast(type: SseEventType, payload: unknown): void {
    const data = JSON.stringify(payload);
    const message = `event: ${type}\ndata: ${data}\n\n`;

    for (const client of this.clients) {
      if (client.writableEnded) {
        this.clients.delete(client);
        continue;
      }
      client.write(message);
    }
  }
}

let sharedBroker: SseBroker | null = null;

export function getSseBroker(): SseBroker {
  if (sharedBroker === null) {
    sharedBroker = new SseBroker();
  }
  return sharedBroker;
}

export function resetSseBrokerForTests(): void {
  sharedBroker = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npx vitest run tests/unit/sse-broker.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```powershell
git add packages/backend/src/services/sse-broker.ts tests/unit/sse-broker.test.ts
git commit -m "feat: add SSE broker for job event broadcasting"
```

---

### Task 2: Export summarizeJob and Wire SSE Broker Into Worker Events

**Files:**
- Modify: `packages/backend/src/services/job-queue.ts`

**Interfaces:**
- Consumes: `getSseBroker()` and `SseEventType` from `sse-broker.ts`
- Produces: exported `summarizeJob` function (renamed from private)

- [ ] **Step 1: Rename and export summarizeJob**

Change the function signature in `job-queue.ts` from `async function summarizeJob` to `export async function summarizeJob`:

```
async function summarizeJob(job: Job<ImportJobData, ImportJobResult, 'import-ontology'>): Promise<JobSummary> {
```
→
```
export async function summarizeJob(job: Job<ImportJobData, ImportJobResult, 'import-ontology'>): Promise<JobSummary> {
```

At `packages/backend/src/services/job-queue.ts:236`.

- [ ] **Step 2: Add SSE import and worker event handlers**

Add to the imports at line 1-4 of `job-queue.ts`:

```typescript
import { getSseBroker } from './sse-broker';
```

In `startImportWorker()`, inside the `sharedWorker` event listener block (after the existing `sharedWorker.on('stalled', ...)` at line 177), add these three handlers:

```typescript
  sharedWorker.on('active', (job) => {
    void summarizeJob(job).then((summary) => {
      getSseBroker().broadcast('job-updated', summary);
    });
  });

  sharedWorker.on('progress', (job) => {
    void summarizeJob(job).then((summary) => {
      getSseBroker().broadcast('job-updated', summary);
    });
  });

  sharedWorker.on('completed', (job) => {
    void summarizeJob(job).then((summary) => {
      getSseBroker().broadcast('job-updated', summary);
    });
  });
```

And update the existing `failed` handler (lines 170-174) to also broadcast:

```typescript
  sharedWorker.on('failed', (job, error) => {
    const logger = getLogger();
    if (job !== undefined) {
      void summarizeJob(job).then((summary) => {
        getSseBroker().broadcast('job-updated', summary);
      });
    }
    const jobId = job?.id ?? 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ jobId: String(jobId), err: error }, `[import-worker] Job ${String(jobId)} failed: ${message}`);
  });
```

- [ ] **Step 3: Run existing tests to verify no regressions**

```powershell
npx vitest run tests/unit
```
Expected: All existing tests pass (the SSE broker shouldn't break anything since tests use mocks).

- [ ] **Step 4: Commit**

```powershell
git add packages/backend/src/services/job-queue.ts
git commit -m "feat: broadcast job state changes via SSE broker from worker events"
```

---

### Task 3: Add SSE Endpoint to Admin Router

**Files:**
- Modify: `packages/backend/src/routes/admin.ts`

**Interfaces:**
- Consumes: `getSseBroker()` from `sse-broker.ts`
- Produces: `GET /api/admin/jobs/events` route (no auth)

- [ ] **Step 1: Add import and SSE route**

Add import after existing imports:

```typescript
import { getSseBroker } from '../services/sse-broker';
```

Add the SSE route **before** the `router.use(auth)` line (before line 29). Insert after `const auth = ...` (line 27):

```typescript
	router.get('/jobs/events', (request, response) => {
		response.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
		});
		response.write(':ok\n\n');

		getSseBroker().addClient(response);

		request.on('close', () => {
			getSseBroker().removeClient(response);
		});
	});
```

The full modified section (lines 25-30) should become:

```typescript
  const router = Router();
  const auth = options.authMiddleware ?? createAdminAuthMiddleware();

  router.get('/jobs/events', (request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write(':ok\n\n');

    getSseBroker().addClient(response);

    request.on('close', () => {
      getSseBroker().removeClient(response);
    });
  });

  router.use(auth);

  router.post('/sync', async (request, response, next) => {
```

- [ ] **Step 2: Run existing admin route tests**

```powershell
npx vitest run tests/unit/admin-route.test.ts
```
Expected: PASS. The SSE route is mounted before `router.use(auth)`, but existing tests create a clean Express app with only the admin router mounted under `/api/admin` — they won't call `/jobs/events`, so no conflicts.

- [ ] **Step 3: Commit**

```powershell
git add packages/backend/src/routes/admin.ts
git commit -m "feat: add SSE endpoint GET /api/admin/jobs/events (no auth)"
```

---

### Task 4: Initialize SSE Broker in index.ts

**Files:**
- Modify: `packages/backend/src/index.ts`

**Interfaces:**
- Consumes: `getSseBroker()` from `sse-broker.ts` (no init needed; lazy singleton)
- Produces: Nothing new — just ensures the singleton is accessible.

- [ ] **Step 1: No changes needed**

The `SseBroker` is a lazy singleton accessed via `getSseBroker()`. It's already imported and used in `job-queue.ts` and `admin.ts`. No explicit initialization in `index.ts` is required. The singleton will be created on first access (which happens when a client connects to the SSE endpoint or a worker event fires).

This task is a no-op; skip to commit.

- [ ] **Step 2: Commit (empty — verified state)**

```powershell
git commit --allow-empty -m "chore: no index.ts changes needed for SSE broker (lazy singleton)"
```

---

### Task 5: Create useJobEvents Frontend Hook

**Files:**
- Create: `packages/frontend/src/lib/sse.ts`

**Interfaces:**
- Produces: `useJobEvents(options: { enabled: boolean; onJobUpdated: (job: JobSummary) => void }): void`

- [ ] **Step 1: Write the hook**

```typescript
// packages/frontend/src/lib/sse.ts
import { useEffect, useRef } from 'react';
import type { JobSummary } from '../api';

interface UseJobEventsOptions {
  enabled: boolean;
  onJobUpdated: (job: JobSummary) => void;
}

export function useJobEvents({ enabled, onJobUpdated }: UseJobEventsOptions): void {
  const callbackRef = useRef(onJobUpdated);
  callbackRef.current = onJobUpdated;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const source = new EventSource('/api/admin/jobs/events');

    source.addEventListener('job-updated', (event: MessageEvent) => {
      try {
        const job = JSON.parse(event.data) as JobSummary;
        callbackRef.current(job);
      } catch {
        // Ignore malformed messages.
      }
    });

    source.onerror = () => {
      // EventSource auto-reconnects — nothing to do.
    };

    return () => {
      source.close();
    };
  }, [enabled]);
}
```

- [ ] **Step 2: Build frontend to verify compilation**

```powershell
npx tsc -p packages/frontend/tsconfig.json --noEmit
```
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```powershell
git add packages/frontend/src/lib/sse.ts
git commit -m "feat: add useJobEvents hook for SSE job updates"
```

---

### Task 6: Replace Polling with SSE in App.tsx

**Files:**
- Modify: `packages/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useJobEvents` from `lib/sse.ts`
- Produces: Updated `jobs` and `selectedJob` state via SSE callbacks

- [ ] **Step 1: Import the hook**

Add to the existing imports (after line 12):

```typescript
import { useJobEvents } from './lib/sse';
```

- [ ] **Step 2: Remove the 15-second polling effect**

Remove the entire polling `useEffect` block (lines 52-66):

```typescript
  useEffect(() => {
    if (showTokenPrompt) {
      return;
    }

    void refreshDashboard();

    const timer = setInterval(() => {
      void refreshDashboard(false);
    }, 15_000);

    return () => {
      clearInterval(timer);
    };
  }, [showTokenPrompt, token]);
```

- [ ] **Step 3: Replace with initial-fetch-only effect and SSE hook**

Add a new effect that only does the initial fetch (no interval):

```typescript
  useEffect(() => {
    if (showTokenPrompt) {
      return;
    }
    void refreshDashboard();
  }, [showTokenPrompt, token]);
```

Add the SSE hook after the initial-fetch effect:

```typescript
  useJobEvents({
    enabled: !showTokenPrompt,
    onJobUpdated: (job) => {
      setJobs((prev) => {
        const index = prev.findIndex((entry) => entry.id === job.id);
        if (index === -1) {
          return [job, ...prev];
        }
        const next = [...prev];
        next[index] = job;
        return next;
      });

      setSelectedJob((prev) => {
        if (prev !== null && prev.id === job.id) {
          return job;
        }
        return prev;
      });
    },
  });
```

- [ ] **Step 4: Remove the individual job fetch effect**

Remove the `useEffect` that fetches a single job on selection (lines 68-89):

```typescript
  useEffect(() => {
    if (selectedJobId === null || token.trim().length === 0) {
      setSelectedJob(null);
      return;
    }

    void (async () => {
      try {
        const job = await getJob(token, selectedJobId);
        setSelectedJob(job);
      } catch (error) {
        if (isAuthError(error)) {
          clearToken({
            clearDraft: false,
            tokenPromptMessage: toTokenPromptMessage(error),
          });
          return;
        }
        setErrorMessage(toErrorMessage(error));
      }
    })();
  }, [selectedJobId, token]);
```

Replace with a simpler effect that just sets `selectedJob` from the existing `jobs` array when `selectedJobId` changes:

```typescript
  useEffect(() => {
    if (selectedJobId === null || token.trim().length === 0) {
      setSelectedJob(null);
      return;
    }
    const job = jobs.find((entry) => entry.id === selectedJobId) ?? null;
    setSelectedJob(job);
  }, [selectedJobId, jobs, token]);
```

- [ ] **Step 5: Update refreshDashboard to not re-fetch jobs on interval**

Since the polling loop is removed, `refreshDashboard` is only called once on mount and on manual refresh. The `getJobs` call inside it should stay (for initial load and manual refresh). No code changes needed — the function already fetches jobs, health, and DB stats in parallel.

But we should keep the `selectedJob` sync logic in `refreshDashboard` (lines 121-124) since the SSE hook also handles that now. Actually, keeping it is fine for the initial load case where `jobs` state updates and we need to sync `selectedJob`.

- [ ] **Step 6: Remove unused import of `getJob`**

Since the individual `getJob` import is no longer used in the removed effect, check if it's imported elsewhere. If not, remove it from the import statement at line 6. Looking at the code: `getJob` is only imported (line 6) but only used in the effect being removed (line 76). Remove `getJob` from the import.

Change line 3-12 from:

```typescript
import {
  getDbStats,
  getHealth,
  getJob,
  getJobs,
  triggerSync,
  type DbStats,
  type HealthResponse,
  type JobSummary,
} from './api';
```

to:

```typescript
import {
  getDbStats,
  getHealth,
  getJobs,
  triggerSync,
  type DbStats,
  type HealthResponse,
  type JobSummary,
} from './api';
```

- [ ] **Step 7: Build and verify**

```powershell
npx tsc -p packages/frontend/tsconfig.json --noEmit
```
Expected: PASS, no errors.

- [ ] **Step 8: Lint**

```powershell
npx eslint packages/frontend/src/App.tsx packages/frontend/src/lib/sse.ts --ext .ts,.tsx
```

- [ ] **Step 9: Commit**

```powershell
git add packages/frontend/src/App.tsx
git commit -m "feat: replace 15s polling with SSE for job updates"
```

---

### Task 7: Integration Verification

**Files:**
- No changes.

- [ ] **Step 1: Run all backend tests**

```powershell
npx vitest run
```
Expected: All tests pass (SSE broker unit tests + existing tests).

- [ ] **Step 2: Run frontend type check**

```powershell
npx tsc -p packages/frontend/tsconfig.json --noEmit
```
Expected: PASS.

- [ ] **Step 3: Manual verification (instructions)**

Start the dev servers:

```powershell
# Terminal 1 — backend
npm run dev -w @swatedb/backend

# Terminal 2 — frontend
npm run dev -w @swatedb/frontend
```

Verify with curl:

```powershell
curl -N http://localhost:3000/api/admin/jobs/events
```

Expected: Keep-alive connection with initial `:ok` comment. In another tab, trigger a sync. The curl session should show `event: job-updated` messages as jobs progress.

- [ ] **Step 4: Commit (if no issues found)**

```powershell
git commit --allow-empty -m "chore: integration verification complete"
```

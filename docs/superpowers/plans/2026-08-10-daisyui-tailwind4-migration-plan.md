# daisyUI + Tailwind CSS v4 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-written CSS with Tailwind v4 + daisyUI 5 (nord theme) and decompose the monolithic App.tsx into focused components.

**Architecture:** Install `tailwindcss`, `@tailwindcss/vite`, and `daisyui` as dev deps. Configure the Vite plugin. Create a new CSS entry file. Extract views/utilities into `src/components/` and `src/lib/`. Rewrite App.tsx as a shell.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS v4, daisyUI 5

## Global Constraints

- daisyUI 5 requires Tailwind CSS v4 — no PostCSS needed, use `@tailwindcss/vite` plugin
- Theme: `nord` as default
- Small components used by a single parent remain inline in the same file
- All code in TypeScript with strict mode
- Verify with `tsc -p tsconfig.json --noEmit` and `vite build` at end

---

### Task 1: Install dependencies

**Files:**
- Modify: `packages/frontend/package.json`

**Interfaces:**
- Produces: `tailwindcss`, `@tailwindcss/vite`, `daisyui` available in node_modules

- [ ] **Step 1: Install tailwindcss, @tailwindcss/vite, daisyui**

Run from workspace root:
```bash
npm install -D tailwindcss @tailwindcss/vite daisyui --workspace=@swatedb/frontend
```

Expected: packages added to `packages/frontend/package.json` `devDependencies`

---

### Task 2: Configure Vite and CSS

**Files:**
- Modify: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/src/styles.css`

**Interfaces:**
- Consumes: `@tailwindcss/vite` from Task 1
- Produces: Tailwind + daisyUI CSS pipeline working

- [ ] **Step 1: Add tailwind plugin to vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': proxyTarget,
      '/health': proxyTarget,
      '/artefacts': proxyTarget,
      '/records': proxyTarget,
      '/search': proxyTarget,
      '/doc/api': proxyTarget,
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
```

- [ ] **Step 2: Create new CSS entry file**

Write `packages/frontend/src/styles.css`:
```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: nord --default;
}
```

- [ ] **Step 3: Verify CSS compiles**

```bash
npx vite build
```
Expected: Build succeeds with Tailwind-generated CSS output.

---

### Task 3: Create lib utilities

**Files:**
- Create: `packages/frontend/src/lib/token.ts`
- Create: `packages/frontend/src/lib/errors.ts`
- Create: `packages/frontend/src/lib/format.ts`

**Interfaces:**
- Produces:
  - `readStoredToken(): string`
  - `storeToken(token: string): void`
  - `toErrorMessage(error: unknown): string`
  - `isAuthError(error: unknown): error is ApiError`
  - `toTokenPromptMessage(error: ApiError): string`
  - `formatTimestamp(value: number): string`

- [ ] **Step 1: Create lib/token.ts**

```typescript
const TOKEN_STORAGE_KEY = 'swatedb.adminToken';

export function readStoredToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (token.trim().length === 0) {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}
```

- [ ] **Step 2: Create lib/errors.ts**

```typescript
import { ApiError } from '../api';

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (HTTP ${error.statusCode})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
}

export function toTokenPromptMessage(error: ApiError): string {
  if (error.statusCode === 403) {
    return 'Admin token was rejected (403). Ensure the running backend ADMIN_TOKEN matches the value you entered.';
  }
  if (error.statusCode === 401) {
    return 'Bearer token was not accepted (401). Please provide a valid ADMIN_TOKEN.';
  }
  return toErrorMessage(error);
}
```

- [ ] **Step 3: Create lib/format.ts**

```typescript
export function formatTimestamp(value: number): string {
  if (value <= 0) {
    return 'Unknown';
  }
  return new Date(value).toLocaleString();
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/lib/
git commit -m "refactor: extract token, error, and format utilities into lib/"
```

---

### Task 4: Create AlertBanner component

**Files:**
- Create: `packages/frontend/src/components/AlertBanner.tsx`

**Interfaces:**
- Produces: `<AlertBanner type message />` — renders `null` when message is null

- [ ] **Step 1: Create components/AlertBanner.tsx**

```typescript
interface AlertBannerProps {
  type: 'error' | 'success';
  message: string | null;
}

export function AlertBanner({ type, message }: AlertBannerProps): JSX.Element | null {
  if (message === null) {
    return null;
  }

  const className = type === 'error' ? 'alert alert-error' : 'alert alert-success';

  return (
    <div className={className} role="alert">
      <span>{message}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/AlertBanner.tsx
git commit -m "feat: add AlertBanner component with daisyUI alert styles"
```

---

### Task 5: Create TokenModal component

**Files:**
- Create: `packages/frontend/src/components/TokenModal.tsx`

**Interfaces:**
- Produces: `<TokenModal tokenDraft onTokenDraftChange onSave errorMessage />`

- [ ] **Step 1: Create components/TokenModal.tsx**

```typescript
import { AlertBanner } from './AlertBanner';

interface TokenModalProps {
  tokenDraft: string;
  onTokenDraftChange: (value: string) => void;
  onSave: () => void;
  errorMessage: string | null;
}

export function TokenModal({ tokenDraft, onTokenDraftChange, onSave, errorMessage }: TokenModalProps): JSX.Element {
  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h2 className="text-xl font-bold">Admin Token Required</h2>
        <p className="py-4 text-base-content/70">
          Enter your backend ADMIN_TOKEN to authenticate all admin API calls. The token is stored in
          sessionStorage for the current browser session only.
        </p>

        <AlertBanner type="error" message={errorMessage} />

        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Bearer Token</span>
          </div>
          <input
            type="password"
            className="input input-bordered w-full"
            value={tokenDraft}
            onChange={(e) => onTokenDraftChange(e.target.value)}
            placeholder="paste ADMIN_TOKEN"
          />
        </label>

        <div className="modal-action">
          <button className="btn btn-primary" type="button" onClick={onSave}>
            Save Token
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/TokenModal.tsx
git commit -m "feat: add TokenModal component with daisyUI modal"
```

---

### Task 6: Create DashboardView component

**Files:**
- Create: `packages/frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `AlertBanner` from Task 4, `formatTimestamp` from Task 3, `DbStats`, `HealthResponse`, `JobSummary` from api
- Produces: `<DashboardView health dbStats stats latestJobs busy errorMessage syncMessage />`

- [ ] **Step 1: Create components/DashboardView.tsx**

```typescript
import type { DbStats, HealthResponse, JobSummary } from '../api';
import { formatTimestamp } from '../lib/format';
import { AlertBanner } from './AlertBanner';

interface DashboardViewProps {
  health: HealthResponse | null;
  dbStats: DbStats | null;
  stats: { total: number; active: number; completed: number; failed: number };
  latestJobs: JobSummary[];
  busy: boolean;
  errorMessage: string | null;
  syncMessage: string | null;
}

export function DashboardView({
  health,
  dbStats,
  stats,
  latestJobs,
  busy: _busy,
  errorMessage,
  syncMessage,
}: DashboardViewProps): JSX.Element {
  const hasLatestJobs = latestJobs.length > 0;

  return (
    <div className="space-y-10">
      <AlertBanner type="error" message={errorMessage} />
      <AlertBanner type="success" message={syncMessage} />

      <section>
        <h2 className="text-xl font-bold mb-4">System Health</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusCard label="Service" value={health?.status ?? 'unknown'} />
          <StatusCard label="Neo4j" value={health?.components.neo4j.status ?? 'unknown'} />
          <StatusCard label="Redis" value={health?.components.redis.status ?? 'unknown'} />
          <StatusCard label="JVM Parser" value={health?.components.jvm.status ?? 'unknown'} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Import Metrics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Jobs" value={stats.total} />
          <MetricCard label="Running/Queued" value={stats.active} />
          <MetricCard label="Completed" value={stats.completed} />
          <MetricCard label="Failed" value={stats.failed} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Database Stats</h2>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Artefacts" value={dbStats?.artefactsTotal ?? 0} />
          <MetricCard label="Records" value={dbStats?.recordsTotal ?? 0} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Latest Imports</h2>
        {hasLatestJobs ? (
          <ul className="menu bg-base-200 rounded-box w-full">
            {latestJobs.map((job) => (
              <li key={job.id}>
                <div className="flex justify-between items-center">
                  <div>
                    <strong className="text-sm">{job.id}</strong>
                    <span className="badge badge-sm ml-2">{job.state}</span>
                  </div>
                  <small className="text-base-content/50">{formatTimestamp(job.timestamp)}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base-content/50">No import jobs yet.</p>
        )}
      </section>
    </div>
  );
}

interface StatusCardProps {
  label: string;
  value: string;
}

function StatusCard({ label, value }: StatusCardProps): JSX.Element {
  return (
    <article className="stat bg-base-200 rounded-box">
      <div className="stat-title text-xs uppercase tracking-wider">{label}</div>
      <div className="stat-value text-lg">{value}</div>
    </article>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
}

function MetricCard({ label, value }: MetricCardProps): JSX.Element {
  return (
    <article className="stat bg-base-200 rounded-box">
      <div className="stat-title text-xs uppercase tracking-wider">{label}</div>
      <div className="stat-value">{value}</div>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/DashboardView.tsx
git commit -m "feat: add DashboardView component with StatusCard/MetricCard inline"
```

---

### Task 7: Create JobsView component

**Files:**
- Create: `packages/frontend/src/components/JobsView.tsx`

**Interfaces:**
- Consumes: `formatTimestamp` from Task 3, `JobSummary` from api
- Produces: `<JobsView jobs selectedJobId selectedJob onSelectJob />` — contains inline `JobDetail`

- [ ] **Step 1: Create components/JobsView.tsx**

```typescript
import type { JobSummary } from '../api';
import { formatTimestamp } from '../lib/format';

interface JobsViewProps {
  jobs: JobSummary[];
  selectedJobId: string | null;
  selectedJob: JobSummary | null;
  onSelectJob: (id: string) => void;
}

export function JobsView({ jobs, selectedJobId, selectedJob, onSelectJob }: JobsViewProps): JSX.Element {
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Import Log</h2>
      <div className="flex flex-col lg:flex-row gap-4">
        <ul className="menu bg-base-200 rounded-box w-full lg:w-64 flex-shrink-0 max-h-96 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.id}>
              <a className={selectedJobId === job.id ? 'active' : ''} onClick={() => onSelectJob(job.id)}>
                <span className="text-sm">{job.id}</span>
                <span className="badge badge-sm">{job.state}</span>
              </a>
            </li>
          ))}
          {jobs.length === 0 ? <li className="disabled">No jobs available.</li> : null}
        </ul>

        <JobDetail job={selectedJob} />
      </div>
    </section>
  );
}

interface JobDetailProps {
  job: JobSummary | null;
}

function JobDetail({ job }: JobDetailProps): JSX.Element {
  return (
    <article className="card bg-base-200 flex-1 p-6">
      <h3 className="text-lg font-bold mb-4">Job Details</h3>
      {job !== null ? (
        <div className="space-y-3">
          <p><strong>ID:</strong> {job.id}</p>
          <p><strong>Name:</strong> {job.name}</p>
          <p><strong>State:</strong> <span className="badge">{job.state}</span></p>
          <p><strong>Attempts:</strong> {job.attemptsMade}</p>
          <div>
            <p><strong>Progress:</strong> {job.progress ?? 0}%</p>
            <progress className="progress progress-primary w-full mt-1" value={job.progress ?? 0} max="100" />
          </div>
          <p><strong>Created:</strong> {formatTimestamp(job.timestamp)}</p>
          <p>
            <strong>Finished:</strong>{' '}
            {job.finishedOn === null ? 'Not finished' : formatTimestamp(job.finishedOn)}
          </p>
          <p><strong>Failure Reason:</strong> {job.failedReason ?? 'None'}</p>
        </div>
      ) : (
        <p className="text-base-content/50">Select a job to inspect its details.</p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/JobsView.tsx
git commit -m "feat: add JobsView component with inline JobDetail"
```

---

### Task 8: Create SyncView component

**Files:**
- Create: `packages/frontend/src/components/SyncView.tsx`

**Interfaces:**
- Produces: `SyncFormState` type (exported), `<SyncView syncForm onSyncFormChange onSubmit busy />`

- [ ] **Step 1: Create components/SyncView.tsx**

```typescript
import type { FormEvent } from 'react';

export interface SyncFormState {
  owner: string;
  repo: string;
  ref: string;
  installationId: string;
}

interface SyncViewProps {
  syncForm: SyncFormState;
  onSyncFormChange: (update: (current: SyncFormState) => SyncFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}

export function SyncView({ syncForm, onSyncFormChange, onSubmit, busy }: SyncViewProps): JSX.Element {
  return (
    <section>
      <h2 className="text-xl font-bold mb-2">Manual Sync Trigger</h2>
      <p className="mb-6 text-base-content/70">
        Queue an import directly from a GitHub repository using installation-scoped access.
      </p>

      <form className="card bg-base-200 p-6 space-y-4" onSubmit={onSubmit}>
        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Repository Owner</span>
          </div>
          <input
            className="input input-bordered w-full"
            value={syncForm.owner}
            onChange={(e) => onSyncFormChange((c) => ({ ...c, owner: e.target.value }))}
            placeholder="example-org"
            required
          />
        </label>

        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Repository Name</span>
          </div>
          <input
            className="input input-bordered w-full"
            value={syncForm.repo}
            onChange={(e) => onSyncFormChange((c) => ({ ...c, repo: e.target.value }))}
            placeholder="ontology-repo"
            required
          />
        </label>

        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Git Reference</span>
          </div>
          <input
            className="input input-bordered w-full"
            value={syncForm.ref}
            onChange={(e) => onSyncFormChange((c) => ({ ...c, ref: e.target.value }))}
            placeholder="main"
            required
          />
        </label>

        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Installation ID</span>
          </div>
          <input
            className="input input-bordered w-full"
            value={syncForm.installationId}
            onChange={(e) => onSyncFormChange((c) => ({ ...c, installationId: e.target.value }))}
            placeholder="123456"
            inputMode="numeric"
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          Queue Sync Job
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/SyncView.tsx
git commit -m "feat: add SyncView component with form"
```

---

### Task 9: Rewrite App.tsx as shell

**Files:**
- Modify: `packages/frontend/src/App.tsx`

**Interfaces:**
- Consumes: All components from Tasks 4-8, lib utilities from Task 3, api types
- Produces: `<App />` — top-level shell orchestrating all views

- [ ] **Step 1: Rewrite App.tsx**

```typescript
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
import { DashboardView } from './components/DashboardView';
import { JobsView } from './components/JobsView';
import { SyncView, type SyncFormState } from './components/SyncView';
import { TokenModal } from './components/TokenModal';
import { isAuthError, toErrorMessage, toTokenPromptMessage } from './lib/errors';
import { readStoredToken, storeToken } from './lib/token';

type ViewKey = 'dashboard' | 'jobs' | 'sync';

interface ClearTokenOptions {
  clearDraft?: boolean;
  tokenPromptMessage?: string | null;
}

export function App(): JSX.Element {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [token, setToken] = useState<string>(() => readStoredToken());
  const [tokenDraft, setTokenDraft] = useState<string>(() => readStoredToken());

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobSummary | null>(null);

  const [syncForm, setSyncForm] = useState<SyncFormState>({
    owner: '',
    repo: '',
    ref: 'main',
    installationId: '',
  });

  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tokenErrorMessage, setTokenErrorMessage] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const showTokenPrompt = token.trim().length === 0;

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

  const stats = useMemo(() => {
    const total = jobs.length;
    const active = jobs.filter((job) => job.state === 'active' || job.state === 'waiting').length;
    const completed = jobs.filter((job) => job.state === 'completed').length;
    const failed = jobs.filter((job) => job.state === 'failed').length;
    return { total, active, completed, failed };
  }, [jobs]);

  const latestJobs = useMemo(() => {
    return [...jobs]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 5);
  }, [jobs]);

  async function refreshDashboard(showBusy = true): Promise<void> {
    if (showBusy) {
      setBusy(true);
    }
    setErrorMessage(null);

    try {
      const [nextHealth, nextJobs, nextDbStats] = await Promise.all([
        getHealth(),
        getJobs(token, 100),
        getDbStats(),
      ]);
      setHealth(nextHealth);
      setJobs(nextJobs);
      setDbStats(nextDbStats);

      if (selectedJobId !== null) {
        const job = nextJobs.find((entry) => entry.id === selectedJobId) ?? null;
        setSelectedJob(job);
      }
    } catch (error) {
      if (isAuthError(error)) {
        clearToken({
          clearDraft: false,
          tokenPromptMessage: toTokenPromptMessage(error),
        });
        return;
      }
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function saveToken(): void {
    const normalized = tokenDraft.trim();
    if (normalized.length === 0) {
      setTokenErrorMessage('Please enter a valid admin token.');
      return;
    }
    storeToken(normalized);
    setToken(normalized);
    setTokenErrorMessage(null);
    setErrorMessage(null);
  }

  function clearToken(options: ClearTokenOptions = {}): void {
    const { clearDraft = true, tokenPromptMessage = null } = options;
    storeToken('');
    setToken('');
    if (clearDraft) {
      setTokenDraft('');
    }
    setSelectedJobId(null);
    setSelectedJob(null);
    setTokenErrorMessage(tokenPromptMessage);
  }

  async function onSubmitSync(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const installationId = Number.parseInt(syncForm.installationId, 10);
    if (Number.isNaN(installationId) || installationId <= 0) {
      setErrorMessage('Installation ID must be a positive integer.');
      return;
    }

    const confirmationText = `Queue sync for ${syncForm.owner.trim()}/${syncForm.repo.trim()} @ ${syncForm.ref.trim()}?`;
    if (!window.confirm(confirmationText)) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setSyncMessage(null);

    try {
      const queued = await triggerSync(token, {
        owner: syncForm.owner.trim(),
        repo: syncForm.repo.trim(),
        ref: syncForm.ref.trim(),
        installationId,
      });

      setSyncMessage(
        `Queued job ${queued.jobId}. Matched files: ${queued.matchedFiles}. External ontologies: ${queued.externals}.`,
      );
      await refreshDashboard(false);
      setView('jobs');
      setSelectedJobId(queued.jobId);
    } catch (error) {
      if (isAuthError(error)) {
        clearToken({
          clearDraft: false,
          tokenPromptMessage: toTokenPromptMessage(error),
        });
        return;
      }
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="navbar bg-base-100 shadow-sm px-6">
        <div className="flex-1">
          <div>
            <p className="text-xs text-base-content/60 uppercase tracking-wider">SwateDB Operations</p>
            <h1 className="text-2xl font-bold">Ontology Import Console</h1>
          </div>
        </div>
        <div className="flex-none gap-2">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void refreshDashboard()}
            disabled={busy || showTokenPrompt}
          >
            Refresh
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => clearToken()}>
            Reset Token
          </button>
        </div>
      </header>

      <div className="tabs tabs-box m-4">
        <button
          type="button"
          className={view === 'dashboard' ? 'tab tab-active' : 'tab'}
          onClick={() => setView('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={view === 'jobs' ? 'tab tab-active' : 'tab'}
          onClick={() => setView('jobs')}
        >
          Import Log
        </button>
        <button
          type="button"
          className={view === 'sync' ? 'tab tab-active' : 'tab'}
          onClick={() => setView('sync')}
        >
          Manual Sync
        </button>
      </div>

      <main className="flex-1 px-6 pb-8">
        {view === 'dashboard' ? (
          <DashboardView
            health={health}
            dbStats={dbStats}
            stats={stats}
            latestJobs={latestJobs}
            busy={busy}
            errorMessage={!showTokenPrompt ? errorMessage : null}
            syncMessage={syncMessage}
          />
        ) : null}
        {view === 'jobs' ? (
          <JobsView
            jobs={jobs}
            selectedJobId={selectedJobId}
            selectedJob={selectedJob}
            onSelectJob={setSelectedJobId}
          />
        ) : null}
        {view === 'sync' ? (
          <SyncView
            syncForm={syncForm}
            onSyncFormChange={setSyncForm}
            onSubmit={(event) => void onSubmitSync(event)}
            busy={busy}
          />
        ) : null}
      </main>

      {showTokenPrompt ? (
        <TokenModal
          tokenDraft={tokenDraft}
          onTokenDraftChange={(value) => {
            setTokenDraft(value);
            setTokenErrorMessage(null);
          }}
          onSave={saveToken}
          errorMessage={tokenErrorMessage}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/App.tsx
git commit -m "refactor: rewrite App.tsx as shell with extracted components and daisyUI"
```

---

### Task 10: Verify build and typecheck

**Files:**
- No file changes (verification only)

- [ ] **Step 1: Run TypeScript typecheck**

```bash
npx tsc -p packages/frontend/tsconfig.json --noEmit
```
Expected: No type errors.

- [ ] **Step 2: Run production build**

```bash
npx vite build
```
Workdir: `packages/frontend`
Expected: Build succeeds with Tailwind-generated CSS included.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/vite.config.ts packages/frontend/src/styles.css packages/frontend/src/App.tsx
git commit -m "feat: install daisyUI + Tailwind CSS v4 with nord theme, decompose App.tsx into components"
```

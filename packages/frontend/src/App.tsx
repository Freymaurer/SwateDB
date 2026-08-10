import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  getDbStats,
  getHealth,
  getJob,
  getJobs,
  triggerSync,
  type DbStats,
  type HealthResponse,
  type JobSummary,
} from './api';

type ViewKey = 'dashboard' | 'jobs' | 'sync';

interface SyncFormState {
  owner: string;
  repo: string;
  ref: string;
  installationId: string;
}

interface ClearTokenOptions {
  clearDraft?: boolean;
  tokenPromptMessage?: string | null;
}

const TOKEN_STORAGE_KEY = 'swatedb.adminToken';

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
    const {
      clearDraft = true,
      tokenPromptMessage = null,
    } = options;

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
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="topbar">
        <div>
          <p className="eyebrow">SwateDB Operations</p>
          <h1>Ontology Import Console</h1>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={() => void refreshDashboard()} disabled={busy || showTokenPrompt}>
            Refresh
          </button>
          <button className="ghost-button" type="button" onClick={() => clearToken()}>
            Reset Token
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Primary views">
        <button className={view === 'dashboard' ? 'tab active' : 'tab'} type="button" onClick={() => setView('dashboard')}>
          Dashboard
        </button>
        <button className={view === 'jobs' ? 'tab active' : 'tab'} type="button" onClick={() => setView('jobs')}>
          Import Log
        </button>
        <button className={view === 'sync' ? 'tab active' : 'tab'} type="button" onClick={() => setView('sync')}>
          Manual Sync
        </button>
      </nav>

      {errorMessage !== null && !showTokenPrompt ? (
        <section className="alert danger" role="alert">
          {errorMessage}
        </section>
      ) : null}

      {syncMessage !== null ? (
        <section className="alert success" role="status">
          {syncMessage}
        </section>
      ) : null}

      <main className="content-grid">
        {view === 'dashboard' ? (
          <section className="panel reveal">
            <h2>System Health</h2>
            <div className="stat-grid">
              <StatusCard label="Service" value={health?.status ?? 'unknown'} />
              <StatusCard label="Neo4j" value={health?.components.neo4j.status ?? 'unknown'} />
              <StatusCard label="Redis" value={health?.components.redis.status ?? 'unknown'} />
              <StatusCard label="JVM Parser" value={health?.components.jvm.status ?? 'unknown'} />
            </div>

            <h2>Import Metrics</h2>
            <div className="stat-grid">
              <MetricCard label="Total Jobs" value={stats.total} />
              <MetricCard label="Running/Queued" value={stats.active} />
              <MetricCard label="Completed" value={stats.completed} />
              <MetricCard label="Failed" value={stats.failed} />
            </div>

            <h2>Database Stats</h2>
            <div className="stat-grid">
              <MetricCard label="Artefacts" value={dbStats?.artefactsTotal ?? 0} />
              <MetricCard label="Records" value={dbStats?.recordsTotal ?? 0} />
            </div>

            <h2>Latest Imports</h2>
            <ul className="job-feed">
              {latestJobs.map((job) => (
                <li key={job.id} className="job-feed-item">
                  <div>
                    <strong>{job.id}</strong>
                    <p>{job.state}</p>
                  </div>
                  <small>{formatTimestamp(job.timestamp)}</small>
                </li>
              ))}
              {latestJobs.length === 0 ? <li className="empty">No import jobs yet.</li> : null}
            </ul>
          </section>
        ) : null}

        {view === 'jobs' ? (
          <section className="panel reveal">
            <h2>Import Log</h2>
            <div className="job-layout">
              <ul className="job-list">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      className={selectedJobId === job.id ? 'job-row active' : 'job-row'}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <span className="job-id">{job.id}</span>
                      <span className="job-state">{job.state}</span>
                    </button>
                  </li>
                ))}
                {jobs.length === 0 ? <li className="empty">No jobs available.</li> : null}
              </ul>

              <article className="job-detail">
                <h3>Job Details</h3>
                {selectedJob !== null ? (
                  <>
                    <p>
                      <strong>ID:</strong> {selectedJob.id}
                    </p>
                    <p>
                      <strong>Name:</strong> {selectedJob.name}
                    </p>
                    <p>
                      <strong>State:</strong> {selectedJob.state}
                    </p>
                    <p>
                      <strong>Attempts:</strong> {selectedJob.attemptsMade}
                    </p>
                    <p>
                      <strong>Progress:</strong> {selectedJob.progress ?? 0}%
                    </p>
                    <div className="progress-track" aria-hidden>
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.max(0, Math.min(100, selectedJob.progress ?? 0))}%` }}
                      />
                    </div>
                    <p>
                      <strong>Created:</strong> {formatTimestamp(selectedJob.timestamp)}
                    </p>
                    <p>
                      <strong>Finished:</strong>{' '}
                      {selectedJob.finishedOn === null ? 'Not finished' : formatTimestamp(selectedJob.finishedOn)}
                    </p>
                    <p>
                      <strong>Failure Reason:</strong> {selectedJob.failedReason ?? 'None'}
                    </p>
                  </>
                ) : (
                  <p className="empty">Select a job to inspect its details.</p>
                )}
              </article>
            </div>
          </section>
        ) : null}

        {view === 'sync' ? (
          <section className="panel reveal">
            <h2>Manual Sync Trigger</h2>
            <p className="panel-text">
              Queue an import directly from a GitHub repository using installation-scoped access.
            </p>

            <form className="sync-form" onSubmit={(event) => void onSubmitSync(event)}>
              <label>
                Repository Owner
                <input
                  value={syncForm.owner}
                  onChange={(event) =>
                    setSyncForm((current) => ({
                      ...current,
                      owner: event.target.value,
                    }))
                  }
                  placeholder="example-org"
                  required
                />
              </label>

              <label>
                Repository Name
                <input
                  value={syncForm.repo}
                  onChange={(event) =>
                    setSyncForm((current) => ({
                      ...current,
                      repo: event.target.value,
                    }))
                  }
                  placeholder="ontology-repo"
                  required
                />
              </label>

              <label>
                Git Reference
                <input
                  value={syncForm.ref}
                  onChange={(event) =>
                    setSyncForm((current) => ({
                      ...current,
                      ref: event.target.value,
                    }))
                  }
                  placeholder="main"
                  required
                />
              </label>

              <label>
                Installation ID
                <input
                  value={syncForm.installationId}
                  onChange={(event) =>
                    setSyncForm((current) => ({
                      ...current,
                      installationId: event.target.value,
                    }))
                  }
                  placeholder="123456"
                  inputMode="numeric"
                  required
                />
              </label>

              <button className="primary-button" type="submit" disabled={busy}>
                Queue Sync Job
              </button>
            </form>
          </section>
        ) : null}
      </main>

      {showTokenPrompt ? (
        <div className="token-overlay" role="dialog" aria-modal="true" aria-labelledby="token-title">
          <div className="token-card">
            <h2 id="token-title">Admin Token Required</h2>
            <p>
              Enter your backend ADMIN_TOKEN to authenticate all admin API calls. The token is stored in
              sessionStorage for the current browser session only.
            </p>
            {tokenErrorMessage !== null ? (
              <section className="alert danger" role="alert">
                {tokenErrorMessage}
              </section>
            ) : null}
            <label>
              Bearer Token
              <input
                type="password"
                value={tokenDraft}
                onChange={(event) => {
                  setTokenDraft(event.target.value);
                  setTokenErrorMessage(null);
                }}
                placeholder="paste ADMIN_TOKEN"
              />
            </label>
            <button className="primary-button" type="button" onClick={saveToken}>
              Save Token
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface StatusCardProps {
  label: string;
  value: string;
}

function StatusCard(props: StatusCardProps): JSX.Element {
  return (
    <article className="metric-card status-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
}

function MetricCard(props: MetricCardProps): JSX.Element {
  return (
    <article className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function formatTimestamp(value: number): string {
  if (value <= 0) {
    return 'Unknown';
  }

  return new Date(value).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (HTTP ${error.statusCode})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
}

function toTokenPromptMessage(error: ApiError): string {
  if (error.statusCode === 403) {
    return 'Admin token was rejected (403). Ensure the running backend ADMIN_TOKEN matches the value you entered.';
  }

  if (error.statusCode === 401) {
    return 'Bearer token was not accepted (401). Please provide a valid ADMIN_TOKEN.';
  }

  return toErrorMessage(error);
}

function readStoredToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function storeToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (token.trim().length === 0) {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

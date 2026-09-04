// hmr-check
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  getConfiguredRepos,
  getDbStats,
  getHealth,
  getJobs,
  triggerConfiguredSync,
  triggerSync,
  type ConfiguredRepoPublic,
  type DbStats,
  type HealthResponse,
  type JobSummary,
} from './api';
import { DashboardView } from './components/DashboardView';
import { JobsView } from './components/JobsView';
import { SyncView, type SyncFormState } from './components/SyncView';
import { TermSearchView } from './components/TermSearchView';
import { useJobEvents } from './lib/sse';
import { TokenModal } from './components/TokenModal';
import { isAuthError, toErrorMessage, toTokenPromptMessage } from './lib/errors';
import { readStoredToken, storeToken } from './lib/token';

type ViewKey = 'dashboard' | 'jobs' | 'sync' | 'terms';

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
  const [configuredRepos, setConfiguredRepos] = useState<ConfiguredRepoPublic[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
  }, [showTokenPrompt, token]);

  useJobEvents({
    enabled: !showTokenPrompt,
    onJobUpdated: (job) => {
      console.log('Received job-updated event for job', job.id, 'state', job.state);
      setJobs((prev) => {
        const index = prev.findIndex((entry) => entry.id === job.id);
        if (index === -1) {
          return [job, ...prev];
        }
        const next = [...prev];
        next[index] = job;
        return next;
      });
    },
  });

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
      const [nextHealth, nextJobs, nextDbStats, nextRepos] = await Promise.all([
        getHealth(),
        getJobs(token, 100),
        getDbStats(),
        getConfiguredRepos(token),
      ]);
      setHealth(nextHealth);
      setJobs(nextJobs);
      setDbStats(nextDbStats);
      setConfiguredRepos(nextRepos);
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

  async function onConfiguredSync(index: number, ref: string): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    setSyncMessage(null);

    try {
      const queued = await triggerConfiguredSync(token, { index, ref });

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
        <button
          type="button"
          className={view === 'terms' ? 'tab tab-active' : 'tab'}
          onClick={() => setView('terms')}
        >
          Term Search
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
            onDismissError={() => setErrorMessage(null)}
            onDismissSync={() => setSyncMessage(null)}
          />
        ) : null}
        {view === 'jobs' ? (
          <JobsView
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
          />
        ) : null}
        {view === 'sync' ? (
          <SyncView
            syncForm={syncForm}
            onSyncFormChange={setSyncForm}
            onSubmit={(event) => void onSubmitSync(event)}
            configuredRepos={configuredRepos}
            onConfiguredSync={(index, ref) => void onConfiguredSync(index, ref)}
            busy={busy}
          />
        ) : null}
        {view === 'terms' ? <TermSearchView /> : null}
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

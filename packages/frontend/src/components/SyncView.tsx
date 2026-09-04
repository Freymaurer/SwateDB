import type { FormEvent } from 'react';
import { useState } from 'react';
import type { ConfiguredRepoPublic } from '../api';

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
  configuredRepos: ConfiguredRepoPublic[];
  onConfiguredSync: (index: number, ref: string) => void;
  busy: boolean;
}

function ConfiguredRepoCard({
  repo,
  onSync,
  busy,
}: {
  repo: ConfiguredRepoPublic;
  onSync: (index: number, ref: string) => void;
  busy: boolean;
}): JSX.Element {
  const [ref, setRef] = useState(repo.ref);

  return (
    <div className="card bg-base-200">
      <div className="card-body p-4 gap-3">
        <h3 className="card-title text-base">
          {repo.label ?? `${repo.owner}/${repo.repo}`}
        </h3>
        <a className="link" href={`https://github.com/${repo.owner}/${repo.repo}`} target="_blank" rel="noopener noreferrer">
          {repo.owner}/{repo.repo}
        </a>
        <label className="form-control w-full">
          <div className="label py-0">
            <span className="label-text text-xs">Git Reference</span>
          </div>
          <input
            className="input input-bordered input-sm w-full"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="main"
          />
        </label>
        <div className="card-actions">
          <button
            className="btn btn-sm"
            type="button"
            disabled={busy || ref.trim().length === 0}
            onClick={() => onSync(repo.index, ref.trim())}
          >
            Sync Now
          </button>
        </div>
      </div>
    </div>
  );
}

export function SyncView({
  syncForm,
  onSyncFormChange,
  onSubmit,
  configuredRepos,
  onConfiguredSync,
  busy,
}: SyncViewProps): JSX.Element {
  const configuredSyncHandler = (index: number, ref: string) => {
    const entry = configuredRepos[index];
    if (entry === undefined) {
      return;
    }

    const label = entry.label ?? `${entry.owner}/${entry.repo}`;
    const confirmationText = `Queue sync for ${label} @ ${ref}?`;
    if (!window.confirm(confirmationText)) {
      return;
    }

    onConfiguredSync(index, ref);
  };

  return (
    <section>
      {configuredRepos.length > 0 ? (
        <>
          <h2 className="text-xl font-bold mb-2">Configured Repositories</h2>
          <p className="mb-6 text-base-content/70">
            Quick-sync from pre-configured repositories. The ref can be adjusted per sync.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {configuredRepos.map((repo) => (
              <ConfiguredRepoCard
                key={repo.index}
                repo={repo}
                onSync={configuredSyncHandler}
                busy={busy}
              />
            ))}
          </div>
        </>
      ) : null}

      <h2 className="text-xl font-bold mb-2">Custom Repository</h2>
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

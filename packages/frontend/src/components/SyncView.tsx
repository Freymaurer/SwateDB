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

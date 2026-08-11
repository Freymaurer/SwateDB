import { useMemo, useState } from 'react';
import type { JobSummary } from '../api';
import { badgeStateColor } from '../lib/badges';
import { formatTimestamp } from '../lib/format';

const STATUS_OPTIONS: string[] = ['all', 'active', 'waiting', 'completed', 'failed'];

interface JobsViewProps {
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
}

export function JobsView({ jobs, selectedJobId, onSelectJob }: JobsViewProps): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const selectedJob = useMemo(
    () => jobs.find((entry) => entry.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const visibleJobs = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();

    return jobs.filter((job) => {
      if (statusFilter !== 'all' && job.state !== statusFilter) {
        return false;
      }

      if (lowerSearch.length > 0) {
        const searchTarget = `${job.id} ${job.name}`.toLowerCase();
        if (!searchTarget.includes(lowerSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, searchTerm, statusFilter]);

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold">Import Log</h2>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-16rem)]">
        <ul className="menu bg-base-200 rounded-box w-full lg:w-72 shrink overflow-y-auto">
          <div className="flex items-center gap-2">
            <input
              className="input input-bordered input-sm w-full sm:w-48"
              type="text"
              placeholder="Filter jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="select select-bordered select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'all' ? 'All statuses' : opt}
                </option>
              ))}
            </select>
          </div>
          {visibleJobs.map((job) => (
            <li key={job.id}>
              <a
                className={selectedJobId === job.id ? 'active' : ''}
                onClick={() => onSelectJob(job.id)}
              >
                <span className="text-sm truncate">{job.id}</span>
                <span className={`badge badge-sm ${badgeStateColor(job.state)}`}>{job.state}</span>
              </a>
            </li>
          ))}
          {jobs.length === 0 ? (
            <li className="disabled">
              <span className="text-base-content/50 italic">No jobs available.</span>
            </li>
          ) : null}
          {jobs.length > 0 && visibleJobs.length === 0 ? (
            <li className="disabled">
              <span className="text-base-content/50 italic">No matching jobs.</span>
            </li>
          ) : null}
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
  const [copied, setCopied] = useState(false);

  if (job === null) {
    return (
      <article className="card bg-base-200 flex-1 p-6">
        <h3 className="text-lg font-bold mb-4">Job Details</h3>
        <p className="text-base-content/50">Select a job to inspect its details.</p>
      </article>
    );
  }

  const errorSummary = job.errorSummary ?? job.failedReason;
  const fullError = job.fullErrorMessage ?? errorSummary;

  const handleCopy = async () => {
    if (fullError !== null) {
      await navigator.clipboard.writeText(fullError);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <article className="card bg-base-200 flex-1 p-6 overflow-y-auto">
      <h3 className="text-lg font-bold mb-4">Job Details</h3>
      <div className="space-y-3">
        <p><strong>ID:</strong> {job.id}</p>
        <p><strong>Name:</strong> {job.name}</p>
        <p><strong>State:</strong> <span className={`badge ${badgeStateColor(job.state)}`}>{job.state}</span></p>
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
        {errorSummary !== null ? (
          <div>
            <p><strong>Failure Reason:</strong> {errorSummary}</p>
            <button
              className="btn btn-ghost btn-xs mt-1"
              type="button"
              onClick={() => void handleCopy()}
            >
              {copied ? 'Copied!' : 'Copy full error log'}
            </button>
          </div>
        ) : (
          <p><strong>Failure Reason:</strong> None</p>
        )}
      </div>
    </article>
  );
}

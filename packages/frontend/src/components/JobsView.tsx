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

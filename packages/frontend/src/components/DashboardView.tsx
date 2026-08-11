import type { DbStats, HealthResponse, JobSummary } from '../api';
import { badgeStateColor, statusColor, statusDot } from '../lib/badges';
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
  onDismissError: () => void;
  onDismissSync: () => void;
}

export function DashboardView({
  health,
  dbStats,
  stats,
  latestJobs,
  errorMessage,
  syncMessage,
  onDismissError,
  onDismissSync,
}: DashboardViewProps): JSX.Element {
  const hasLatestJobs = latestJobs.length > 0;

  return (
    <div className="space-y-10">
      <AlertBanner type="error" message={errorMessage} onDismiss={onDismissError} />
      <AlertBanner type="success" message={syncMessage} onDismiss={onDismissSync} />

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
                    <span className={`badge badge-sm ml-2 ${badgeStateColor(job.state)}`}>{job.state}</span>
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
      <div className="stat-value text-lg flex items-center gap-2">
        <span className={statusDot(value)}></span>
        <span className={statusColor(value)}>{value}</span>
      </div>
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

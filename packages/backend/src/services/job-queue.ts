import IORedis from 'ioredis';
import { Job, Queue, Worker } from 'bullmq';
import type { ImportJobData, ImportJobResult, JobSummary } from './import-types';
import { getLogger } from '../middleware/request-logger';
import { getSseBroker } from './sse-broker';

const IMPORT_QUEUE_NAME = 'ontology-import-jobs';
const DEFAULT_WORKER_CONCURRENCY = 2;

export interface QueueResources {
	redis: IORedis;
	queue: Queue<ImportJobData, ImportJobResult, 'import-ontology'>;
}

export interface RedisHealthStatus {
	status: 'up' | 'down';
	detail?: string;
}

let sharedResources: QueueResources | null = null;
let sharedWorker: Worker<ImportJobData, ImportJobResult, 'import-ontology'> | null = null;

export type WorkerProgressReporter = (progress: number) => Promise<void>;
export type ImportJobProcessor = (
	data: ImportJobData,
	reportProgress: WorkerProgressReporter,
) => Promise<ImportJobResult>;

export function resolveRedisUrl(env: NodeJS.ProcessEnv = process.env): string {
	const redisUrl = env.REDIS_URL;
	if (redisUrl === undefined || redisUrl.trim().length === 0) {
		throw new Error('Missing required environment variable: REDIS_URL');
	}

	return redisUrl;
}

export async function initializeQueueResources(
	redisUrl: string = resolveRedisUrl(),
): Promise<QueueResources> {
	if (sharedResources !== null) {
		return sharedResources;
	}

	const redis = new IORedis(redisUrl, {
		maxRetriesPerRequest: null,
	});

	const queue = new Queue<ImportJobData, ImportJobResult, 'import-ontology'>(IMPORT_QUEUE_NAME, {
		connection: redis,
	});

	await redis.ping();

	sharedResources = {
		redis,
		queue,
	};

	return sharedResources;
}

export async function closeQueueResources(): Promise<void> {
	await stopImportWorker();

	if (sharedResources === null) {
		return;
	}

	await sharedResources.queue.close();
	sharedResources.redis.disconnect();
	sharedResources = null;
}

export async function enqueueImportJob(
	data: ImportJobData,
	resources: QueueResources | null = sharedResources,
): Promise<string> {
	const queueResources = resources ?? (await initializeQueueResources());

	const job = await queueResources.queue.add('import-ontology', data, {
		removeOnComplete: 100,
		removeOnFail: 100,
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 1000,
		},
	});

	if (job.id === undefined || job.id === null) {
		throw new Error('Queue returned a job without an identifier.');
	}

	return String(job.id);
}

export async function listImportJobs(
	limit = 50,
	resources: QueueResources | null = sharedResources,
): Promise<JobSummary[]> {
	const queueResources = resources ?? (await initializeQueueResources());
	const jobs = await queueResources.queue.getJobs(
		['waiting', 'active', 'delayed', 'completed', 'failed'],
		0,
		Math.max(0, limit - 1),
		false,
	);

	const summaries = await Promise.all(jobs.map(async (job) => summarizeJob(job)));
	return summaries;
}

export async function getImportJobById(
	jobId: string,
	resources: QueueResources | null = sharedResources,
): Promise<JobSummary | null> {
	const queueResources = resources ?? (await initializeQueueResources());
	const job = await queueResources.queue.getJob(jobId);
	if (job == null) {
		return null;
	}

	return summarizeJob(job);
}

export async function startImportWorker(
	processor: ImportJobProcessor,
	options: {
		resources?: QueueResources | null;
		concurrency?: number;
	} = {},
): Promise<Worker<ImportJobData, ImportJobResult, 'import-ontology'>> {
	if (sharedWorker !== null) {
		return sharedWorker;
	}

	const queueResources = options.resources ?? sharedResources ?? (await initializeQueueResources());
	const concurrency = options.concurrency ?? DEFAULT_WORKER_CONCURRENCY;

	sharedWorker = new Worker<ImportJobData, ImportJobResult, 'import-ontology'>(
		IMPORT_QUEUE_NAME,
		async (job) => {
			await job.updateProgress(5);

			const result = await processor(job.data, async (progress) => {
				await job.updateProgress(progress);
			});

			await job.updateProgress(100);
			return result;
		},
    {
      connection: queueResources.redis,
      concurrency,
      lockDuration: 60_000,
      stalledInterval: 15_000,
      maxStalledCount: 3,
    },
  );

  sharedWorker.on('error', (error) => {
    const logger = getLogger();
    if (error instanceof Error) {
      logger.error({ err: error }, `[import-worker] Worker error: ${error.message}`);
    } else {
      logger.error({ err: error }, `[import-worker] Worker error: ${String(error)}`);
    }
  });

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

  sharedWorker.on('stalled', (jobId) => {
    getLogger().warn({ jobId: String(jobId) }, `[import-worker] Job ${String(jobId)} stalled — will be retried`);
  });

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

  void (async () => {
    try {
      const activeJobs = await queueResources.queue.getActive();
      for (const job of activeJobs) {
        getLogger().warn({ jobId: String(job.id) }, `[import-worker] Moving stale active job ${String(job.id)} back to waiting`);
        await job.moveToWait();
      }
    } catch (error) {
      getLogger().warn({ err: error }, '[import-worker] Could not clean up stale active jobs');
    }
  })();

  return sharedWorker;
}

export async function stopImportWorker(): Promise<void> {
	if (sharedWorker === null) {
		return;
	}

	await sharedWorker.close();
	sharedWorker = null;
}

export async function checkRedisHealth(
	resources: QueueResources | null = sharedResources,
): Promise<RedisHealthStatus> {
	if (resources === null) {
		return {
			status: 'down',
			detail: 'Redis queue resources are not initialized.',
		};
	}

	try {
		await resources.redis.ping();
		return { status: 'up' };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			status: 'down',
			detail,
		};
	}
}

export function getQueueResources(): QueueResources | null {
	return sharedResources;
}

export function resetQueueResourcesForTests(): void {
	sharedResources = null;
	sharedWorker = null;
}

export async function summarizeJob(job: Job<ImportJobData, ImportJobResult, 'import-ontology'>): Promise<JobSummary> {
  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : null;

  const raw = job.failedReason ?? null;
  let errorSummary: string | null = raw;
  let fullErrorMessage: string | null = raw;

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === 'object' && 'msg' in parsed) {
        errorSummary = String((parsed as { msg: unknown }).msg);
        fullErrorMessage = 'fullMessage' in parsed ? String((parsed as { fullMessage: unknown }).fullMessage) : raw;
      }
    } catch {
      // Not JSON — treat raw string as both summary and full error
    }
  }

  return {
    id: String(job.id),
    name: job.name,
    state,
    progress,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn ?? null,
    failedReason: raw,
    errorSummary,
    fullErrorMessage,
  };
}

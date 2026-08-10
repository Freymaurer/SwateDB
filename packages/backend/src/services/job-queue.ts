import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const IMPORT_QUEUE_NAME = 'ontology-import-jobs';

export interface QueueResources {
	redis: IORedis;
	queue: Queue;
}

export interface RedisHealthStatus {
	status: 'up' | 'down';
	detail?: string;
}

let sharedResources: QueueResources | null = null;

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

	const queue = new Queue(IMPORT_QUEUE_NAME, {
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
	if (sharedResources === null) {
		return;
	}

	await sharedResources.queue.close();
	sharedResources.redis.disconnect();
	sharedResources = null;
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
}

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Router } from 'express';
import { checkNeo4jHealth, type Neo4jHealthStatus } from '../db/neo4j';
import { checkRedisHealth, type RedisHealthStatus } from '../services/job-queue';

export interface HealthStatus {
	status: 'up' | 'down';
	detail?: string;
}

export interface HealthResponse {
	status: 'ok' | 'degraded';
	timestamp: string;
	components: {
		neo4j: HealthStatus;
		redis: HealthStatus;
		jvm: HealthStatus;
	};
}

type HealthProbe = () => Promise<HealthStatus>;

export interface HealthRouteOptions {
	neo4jProbe?: HealthProbe;
	redisProbe?: HealthProbe;
	jvmProbe?: HealthProbe;
}

export function createHealthRouter(options: HealthRouteOptions = {}): Router {
	const router = Router();

	const neo4jProbe = options.neo4jProbe ?? (async (): Promise<Neo4jHealthStatus> => checkNeo4jHealth());
	const redisProbe = options.redisProbe ?? (async (): Promise<RedisHealthStatus> => checkRedisHealth());
	const jvmProbe = options.jvmProbe ?? (async (): Promise<HealthStatus> => checkJvmHealth());

	router.get('/', async (_request, response) => {
		const [neo4j, redis, jvm] = await Promise.all([
			guardProbe(neo4jProbe),
			guardProbe(redisProbe),
			guardProbe(jvmProbe),
		]);

		const isHealthy = neo4j.status === 'up' && redis.status === 'up' && jvm.status === 'up';
		const payload: HealthResponse = {
			status: isHealthy ? 'ok' : 'degraded',
			timestamp: new Date().toISOString(),
			components: {
				neo4j,
				redis,
				jvm,
			},
		};

		response.status(isHealthy ? 200 : 503).json(payload);
	});

	return router;
}

export function checkJvmHealth(env: NodeJS.ProcessEnv = process.env): HealthStatus {
	const javaAvailable = spawnSync('java', ['-version'], {
		stdio: 'ignore',
		shell: process.platform === 'win32',
	}).status === 0;

	if (!javaAvailable) {
		return {
			status: 'down',
			detail: 'Java runtime is not available on PATH.',
		};
	}

	const jarPath = env.JAVA_BRIDGE_JAR_PATH;
	if (jarPath === undefined || jarPath.trim().length === 0) {
		return {
			status: 'down',
			detail: 'JAVA_BRIDGE_JAR_PATH is not configured.',
		};
	}

	if (!existsSync(jarPath)) {
		return {
			status: 'down',
			detail: `Configured parser JAR does not exist: ${jarPath}`,
		};
	}

	return { status: 'up' };
}

async function guardProbe(probe: HealthProbe): Promise<HealthStatus> {
	try {
		return await probe();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			status: 'down',
			detail,
		};
	}
}

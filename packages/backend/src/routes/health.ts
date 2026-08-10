import { existsSync } from 'node:fs';
import { Router } from 'express';
import { ensureJvm } from '@swatedb/ontology-lib';
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

let jvmHealthCache: HealthStatus | null = null;

export function checkJvmHealth(): HealthStatus {
  if (jvmHealthCache !== null) {
    return jvmHealthCache;
  }

  const jarPath = process.env.JAVA_BRIDGE_JAR_PATH;
  if (jarPath === undefined || jarPath.trim().length === 0) {
    jvmHealthCache = {
      status: 'down',
      detail: 'JAVA_BRIDGE_JAR_PATH is not configured.',
    };
    return jvmHealthCache;
  }

  if (!existsSync(jarPath)) {
    jvmHealthCache = {
      status: 'down',
      detail: `Configured parser JAR does not exist: ${jarPath}`,
    };
    return jvmHealthCache;
  }

  try {
    ensureJvm();
    jvmHealthCache = { status: 'up' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    jvmHealthCache = {
      status: 'down',
      detail: `JVM bridge initialization failed: ${detail}`,
    };
  }

  return jvmHealthCache;
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

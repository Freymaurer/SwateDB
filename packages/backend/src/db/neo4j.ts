import neo4j, { type Driver } from 'neo4j-driver';
import { getLogger } from '../middleware/request-logger';

export interface Neo4jConfig {
	uri: string;
	user: string;
	password: string;
}

export interface Neo4jHealthStatus {
	status: 'up' | 'down';
	detail?: string;
}

const DEFAULT_MAX_POOL_SIZE = 100;
const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_RETRY_DELAY_MS = 10_000;
const DEFAULT_RETRY_MULTIPLIER = 2;
const DEFAULT_MAX_RETRIES = 5;

let sharedDriver: Driver | null = null;

export function resolveNeo4jConfig(env: NodeJS.ProcessEnv = process.env): Neo4jConfig {
	const uri = readEnvVar(env, 'NEO4J_URI');
	const user = readEnvVar(env, 'NEO4J_USER');
	const password = readEnvVar(env, 'NEO4J_PASSWORD');

	return {
		uri,
		user,
		password,
	};
}

export function getNeo4jDriver(config: Neo4jConfig = resolveNeo4jConfig()): Driver {
	if (sharedDriver !== null) {
		return sharedDriver;
	}

	sharedDriver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
		maxConnectionPoolSize: DEFAULT_MAX_POOL_SIZE,
		connectionAcquisitionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
	});

	return sharedDriver;
}

export async function closeNeo4jDriver(): Promise<void> {
	if (sharedDriver === null) {
		return;
	}

	await sharedDriver.close();
	sharedDriver = null;
}

export async function verifyNeo4jConnectivity(driver: Driver = getNeo4jDriver()): Promise<void> {
	await retryWithExponentialBackoff(
		async () => {
			await driver.verifyConnectivity();
		},
		{
			maxRetries: DEFAULT_MAX_RETRIES,
			baseDelayMs: DEFAULT_RETRY_DELAY_MS,
			maxDelayMs: DEFAULT_MAX_RETRY_DELAY_MS,
			multiplier: DEFAULT_RETRY_MULTIPLIER,
			operation: 'Neo4j connectivity verification',
		},
	);
}

export async function executeWithRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	return retryWithExponentialBackoff(fn, {
		maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
		baseDelayMs: options.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS,
		maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
		multiplier: options.multiplier ?? DEFAULT_RETRY_MULTIPLIER,
		operation: options.operation ?? 'Neo4j operation',
	});
}

export interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	multiplier?: number;
	operation?: string;
}

async function retryWithExponentialBackoff<T>(
	fn: () => Promise<T>,
	options: Required<Omit<RetryOptions, keyof NonNullable<unknown>>> & { operation: string },
): Promise<T> {
	const logger = getLogger();
	let lastError: unknown;
	let delay = options.baseDelayMs;

	for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isTransientError(error)) {
				throw error;
			}

			if (attempt < options.maxRetries) {
				logger.warn(
					{
						attempt,
						maxRetries: options.maxRetries,
						delayMs: delay,
						operation: options.operation,
					},
					`${options.operation} attempt ${attempt} failed, retrying in ${delay}ms`,
				);

				await sleep(delay);
				delay = Math.min(delay * options.multiplier, options.maxDelayMs);
			}
		}
	}

	throw lastError;
}

function isTransientError(error: unknown): boolean {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		if (
			message.includes('service unavailable') ||
			message.includes('connection refused') ||
			message.includes('connection reset') ||
			message.includes('connection timeout') ||
			message.includes('econnrefused') ||
			message.includes('econnreset') ||
			message.includes('etimedout') ||
			message.includes('eagain') ||
			message.includes('transient') ||
			message.includes('temporarily unavailable')
		) {
			return true;
		}
	}

	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkNeo4jHealth(driver: Driver = getNeo4jDriver()): Promise<Neo4jHealthStatus> {
	const session = driver.session();

	try {
		await session.run('RETURN 1 AS ok');
		return { status: 'up' };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			status: 'down',
			detail,
		};
	} finally {
		await session.close();
	}
}

export function resetNeo4jDriverForTests(): void {
	sharedDriver = null;
}

function readEnvVar(env: NodeJS.ProcessEnv, key: keyof NodeJS.ProcessEnv): string {
	const value = env[key];
	if (value === undefined || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${String(key)}`);
	}

	return value;
}

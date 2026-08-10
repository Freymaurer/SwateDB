import neo4j, { type Driver } from 'neo4j-driver';

export interface Neo4jConfig {
	uri: string;
	user: string;
	password: string;
}

export interface Neo4jHealthStatus {
	status: 'up' | 'down';
	detail?: string;
}

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

	sharedDriver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password));
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
	await driver.verifyConnectivity();
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

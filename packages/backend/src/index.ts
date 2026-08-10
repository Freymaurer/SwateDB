import 'dotenv/config';

import type { Server } from 'node:http';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import {
	checkNeo4jHealth,
	closeNeo4jDriver,
	getNeo4jDriver,
	verifyNeo4jConnectivity,
} from './db/neo4j';
import { ensureSchema } from './db/schema';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createHealthRouter, type HealthRouteOptions } from './routes/health';
import {
	checkRedisHealth,
	closeQueueResources,
	getQueueResources,
	initializeQueueResources,
} from './services/job-queue';

const logger = pino({
	name: 'swatedb-backend',
	level: process.env.LOG_LEVEL ?? 'info',
});

export interface CreateAppOptions {
	health?: HealthRouteOptions;
}

export interface StartServerOptions {
	port?: number;
}

export interface AppRuntime {
	app: Express;
	server: Server;
	shutdown: () => Promise<void>;
}

export function createApp(options: CreateAppOptions = {}): Express {
	const app = express();

	app.disable('x-powered-by');
	app.use(helmet());
	app.use(cors());
	app.use(express.json({ limit: '2mb' }));

	app.get('/', (_request, response) => {
		response.status(200).json({
			service: 'swatedb-backend',
			status: 'ok',
		});
	});

	app.use('/health', createHealthRouter(options.health));

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
}

export async function startServer(options: StartServerOptions = {}): Promise<AppRuntime> {
	const port = options.port ?? resolvePort();

	const driver = getNeo4jDriver();
	await verifyNeo4jConnectivity(driver);
	await ensureSchema(driver);

	const queueResources = await initializeQueueResources();

	const app = createApp({
		health: {
			neo4jProbe: async () => checkNeo4jHealth(driver),
			redisProbe: async () => checkRedisHealth(queueResources),
		},
	});

	const server = await listen(app, port);
	logger.info({ port }, 'Backend server started');

	let isShuttingDown = false;
	const shutdown = async (): Promise<void> => {
		if (isShuttingDown) {
			return;
		}

		isShuttingDown = true;
		await closeServer(server);
		await closeQueueResources();
		await closeNeo4jDriver();
		logger.info('Backend server shutdown complete');
	};

	registerSignalHandlers(shutdown);

	return {
		app,
		server,
		shutdown,
	};
}

function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
	const rawPort = env.PORT ?? '3000';
	const parsedPort = Number.parseInt(rawPort, 10);
	if (Number.isNaN(parsedPort) || parsedPort <= 0) {
		throw new Error(`Invalid PORT value: ${rawPort}`);
	}

	return parsedPort;
}

function listen(app: Express, port: number): Promise<Server> {
	return new Promise<Server>((resolve) => {
		const server = app.listen(port, () => {
			resolve(server);
		});
	});
}

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error !== undefined) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

function registerSignalHandlers(shutdown: () => Promise<void>): void {
	const handleSignal = (signal: NodeJS.Signals) => {
		void shutdown()
			.catch((error) => {
				logger.error({ err: error, signal }, 'Shutdown failed');
			})
			.finally(() => {
				process.exit(0);
			});
	};

	process.once('SIGINT', () => handleSignal('SIGINT'));
	process.once('SIGTERM', () => handleSignal('SIGTERM'));
}

function shouldAutoStart(): boolean {
	const entrypoint = process.argv[1];
	if (entrypoint === undefined) {
		return false;
	}

	return entrypoint.endsWith('index.js') && process.env.NODE_ENV !== 'test';
}

if (shouldAutoStart()) {
	void startServer().catch(async (error) => {
		logger.error({ err: error }, 'Backend server failed during startup');
		if (getQueueResources() !== null) {
			await closeQueueResources();
		}
		await closeNeo4jDriver();
		process.exit(1);
	});
}

import 'dotenv/config';

import type { Server } from 'node:http';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  checkNeo4jHealth,
  closeNeo4jDriver,
  getNeo4jDriver,
  verifyNeo4jConnectivity,
} from './db/neo4j';
import { ensureSchema } from './db/schema';
import { ensureJvm } from '@swatedb/ontology-lib';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRequestLoggerMiddleware, getLogger } from './middleware/request-logger';
import { createAdminRouter } from './routes/admin';
import { createHealthRouter, type HealthRouteOptions } from './routes/health';
import { createArtefactsRouter } from './routes/mod-api/artefacts';
import { createCatalogueRouter } from './routes/mod-api/catalogue';
import { createDocsRouter } from './routes/mod-api/docs';
import { createRecordsRouter } from './routes/mod-api/records';
import { createSearchRouter } from './routes/mod-api/search';
import { createTermsRouter } from './routes/mod-api/terms';
import { createModApiService } from './routes/mod-api/service';
import { createWebhookRouter } from './routes/webhooks';
import { createImportService } from './services/import-service';
import {
	checkRedisHealth,
	closeQueueResources,
	getQueueResources,
	initializeQueueResources,
	startImportWorker,
	stopImportWorker,
} from './services/job-queue';

const logger = getLogger();

export interface CreateAppOptions {
	health?: HealthRouteOptions;
	importService?: ReturnType<typeof createImportService>;
	modApiService?: ReturnType<typeof createModApiService>;
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
	const importService = options.importService;
	const modApiService = options.modApiService ?? createModApiService();

	app.disable('x-powered-by');
	app.use(helmet());
	app.use(cors());
	app.use(createRequestLoggerMiddleware());

	const webhookRateLimiter = rateLimit({
		windowMs: 60_000,
		max: 60,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: {
				code: 'rate_limit_exceeded',
				message: 'Too many webhook requests. Please wait before retrying.',
			},
		},
	});

	const adminRateLimiter = rateLimit({
		windowMs: 60_000,
		max: 30,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: {
				code: 'rate_limit_exceeded',
				message: 'Too many admin requests. Please wait before retrying.',
			},
		},
	});

	const generalRateLimiter = rateLimit({
		windowMs: 60_000,
		max: 1000,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: {
				code: 'rate_limit_exceeded',
				message: 'Too many requests. Please wait before retrying.',
			},
		},
	});

	if (importService !== undefined) {
		app.use(
			'/api/github/webhooks',
			webhookRateLimiter,
			createWebhookRouter({
				importService,
			}),
		);
	}

	app.use(express.json({ limit: '2mb' }));

	if (importService !== undefined) {
		app.use('/api/admin', adminRateLimiter, createAdminRouter({ importService }));
	}

	app.use('/doc/api', createDocsRouter());
	app.use('/records', createRecordsRouter(modApiService));
	app.use('/artefacts', createArtefactsRouter(modApiService));
	app.use('/search', createSearchRouter(modApiService));
	app.use('/terms', createTermsRouter(modApiService));
	app.use('/', generalRateLimiter, createCatalogueRouter(modApiService));

	app.use('/health', createHealthRouter(options.health));

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
}
  
export async function startServer(options: StartServerOptions = {}): Promise<AppRuntime> {
	const port = options.port ?? resolvePort();

	const configuredKeys = Object.keys(process.env).filter((k) => k.startsWith('CONFIGURED_'));
	logger.info({ keys: configuredKeys }, `CONFIGURED_* env vars found: ${configuredKeys.length}`);

	const driver = getNeo4jDriver();
  await verifyNeo4jConnectivity(driver);
  await ensureSchema(driver);

  logger.info('Verifying JVM availability...');
  try {
    ensureJvm();
    logger.info('JVM and parser JAR verified');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, `JVM verification failed: ${message}`);
    throw new Error(`JVM verification failed: ${message}`);
  }

  const queueResources = await initializeQueueResources();
	const importService = createImportService();

	await startImportWorker((data, reportProgress) => importService.processImportJob(data, reportProgress), {
		resources: queueResources,
		concurrency: 2,
	});

	const app = createApp({
		importService,
		modApiService: createModApiService(driver),
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
		await stopImportWorker();
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

	const normalizedEntrypoint = entrypoint.replace(/\\/g, '/').toLowerCase();
	const isBackendEntrypoint =
		normalizedEntrypoint.endsWith('/dist/index.js') ||
		normalizedEntrypoint.endsWith('/src/index.ts') ||
		normalizedEntrypoint.endsWith('/index.js') ||
		normalizedEntrypoint.endsWith('/index.ts');

	return isBackendEntrypoint && process.env.NODE_ENV !== 'test';
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

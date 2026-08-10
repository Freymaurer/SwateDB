import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	matchesImportPatterns,
	parseConfig,
	parseFile,
	parseFromUrl,
	swateDbConfigSchema,
	type Ontology,
	type SwateDbConfig,
} from '@swatedb/ontology-lib';
import { z } from 'zod';
import { importOntology as importOntologyToNeo4j } from '../db/import';
import { getNeo4jDriver } from '../db/neo4j';
import {
	createGitHubRepositoryClient,
	type GitHubRepositoryClient,
} from './github-app';
import { enqueueImportJob, type WorkerProgressReporter } from './job-queue';
import type { ImportJobData, ImportJobResult, RepositoryRef } from './import-types';

const SWATEDB_CONFIG_PATH = '.swatedb.yml';

const pushEventSchema = z.object({
	ref: z.string().min(1),
	installation: z
		.object({
			id: z.number().int().positive(),
		})
		.optional(),
	repository: z.object({
		name: z.string().min(1),
		full_name: z.string().optional(),
		owner: z
			.object({
				login: z.string().optional(),
				name: z.string().optional(),
			})
			.passthrough(),
	}),
	commits: z
		.array(
			z.object({
				added: z.array(z.string()).default([]),
				modified: z.array(z.string()).default([]),
			}),
		)
		.default([]),
});

const manualSyncSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	ref: z.string().min(1).default('main'),
	installationId: z.number().int().positive(),
	requestedBy: z.string().optional(),
});

export interface QueueResult {
	jobId: string;
	matchedFiles: number;
	externals: number;
}

export interface ImportServiceDependencies {
	githubClient?: GitHubRepositoryClient;
	enqueueJob?: (data: ImportJobData) => Promise<string>;
	parseOntologyFile?: (filePath: string) => Promise<Ontology>;
	parseOntologyUrl?: (url: string) => Promise<Ontology>;
	importOntologyGraph?: (ontology: Ontology) => Promise<void>;
}

export interface ImportService {
	enqueueFromPushEvent(payload: unknown, deliveryId?: string): Promise<QueueResult>;
	enqueueManualSync(request: unknown): Promise<QueueResult>;
	processImportJob(data: ImportJobData, reportProgress?: WorkerProgressReporter): Promise<ImportJobResult>;
	buildImportPlan(repository: RepositoryRef, changedFiles?: string[]): Promise<ImportPlan>;
}

export interface ImportPlan {
	ontologyFilePaths: string[];
	externalUrls: string[];
	config: SwateDbConfig;
}

export function createImportService(dependencies: ImportServiceDependencies = {}): ImportService {
	let lazyGitHubClient: GitHubRepositoryClient | null = dependencies.githubClient ?? null;
	const getGitHubClient = (): GitHubRepositoryClient => {
		if (lazyGitHubClient === null) {
			lazyGitHubClient = createGitHubRepositoryClient();
		}

		return lazyGitHubClient;
	};

	const enqueueJob = dependencies.enqueueJob ?? enqueueImportJob;
	const parseOntologyFile = dependencies.parseOntologyFile ?? parseFile;
	const parseOntologyUrl = dependencies.parseOntologyUrl ?? parseFromUrl;
	const importOntologyGraph =
		dependencies.importOntologyGraph ??
		(async (ontology: Ontology) => {
			await importOntologyToNeo4j(getNeo4jDriver(), ontology);
		});

	return {
		enqueueFromPushEvent: async (payload, deliveryId) => {
			const parsed = pushEventSchema.parse(payload);
			if (parsed.installation?.id === undefined) {
				throw new Error('GitHub push payload is missing installation.id for GitHub App authorization.');
			}

			const repository = toRepositoryRef(parsed);
			const changedFiles = collectChangedFiles(parsed);
			const importPlan = await buildImportPlanInternal(getGitHubClient(), repository, changedFiles);

			const jobData: ImportJobData = {
				trigger: 'webhook',
				repository,
				ontologyFilePaths: importPlan.ontologyFilePaths,
				externalUrls: importPlan.externalUrls,
				deliveryId,
			};

			const jobId = await enqueueJob(jobData);

			return {
				jobId,
				matchedFiles: importPlan.ontologyFilePaths.length,
				externals: importPlan.externalUrls.length,
			};
		},
		enqueueManualSync: async (request) => {
			const parsed = manualSyncSchema.parse(request);
			const repository: RepositoryRef = {
				owner: parsed.owner,
				repo: parsed.repo,
				ref: parsed.ref,
				installationId: parsed.installationId,
			};

			const importPlan = await buildImportPlanInternal(getGitHubClient(), repository);
			const jobData: ImportJobData = {
				trigger: 'admin',
				repository,
				ontologyFilePaths: importPlan.ontologyFilePaths,
				externalUrls: importPlan.externalUrls,
				requestedBy: parsed.requestedBy,
			};

			const jobId = await enqueueJob(jobData);

			return {
				jobId,
				matchedFiles: importPlan.ontologyFilePaths.length,
				externals: importPlan.externalUrls.length,
			};
		},
		processImportJob: async (data, reportProgress = async () => undefined) => {
			const totalItems = data.ontologyFilePaths.length + data.externalUrls.length;
			let processed = 0;

			const updateProgress = async () => {
				if (totalItems === 0) {
					await reportProgress(100);
					return;
				}

				const progress = Math.min(95, Math.floor((processed / totalItems) * 95));
				await reportProgress(progress);
			};

			for (const filePath of data.ontologyFilePaths) {
				const fileBuffer = await getGitHubClient().downloadRepositoryFile({
					...data.repository,
					path: filePath,
				});

				const ontology = await parseFileBuffer(fileBuffer, filePath, parseOntologyFile);
				await importOntologyGraph(ontology);
				processed += 1;
				await updateProgress();
			}

			for (const url of data.externalUrls) {
				const ontology = await parseOntologyUrl(url);
				await importOntologyGraph(ontology);
				processed += 1;
				await updateProgress();
			}

			await reportProgress(100);
			return {
				importedOntologies: data.ontologyFilePaths.length,
				importedExternals: data.externalUrls.length,
				totalProcessed: totalItems,
			};
		},
		buildImportPlan: async (repository, changedFiles) =>
			buildImportPlanInternal(getGitHubClient(), repository, changedFiles),
	};
}

async function buildImportPlanInternal(
	githubClient: GitHubRepositoryClient,
	repository: RepositoryRef,
	changedFiles?: string[],
): Promise<ImportPlan> {
	const configText = await githubClient.getRepositoryFileText({
		...repository,
		path: SWATEDB_CONFIG_PATH,
	});

	const config = configText === null ? swateDbConfigSchema.parse({}) : parseConfig(configText);
	const allRepositoryFiles = await githubClient.listRepositoryFiles(repository);

	const candidates =
		changedFiles !== undefined && changedFiles.length > 0 && !changedFiles.includes(SWATEDB_CONFIG_PATH)
			? changedFiles
			: allRepositoryFiles;

	const ontologyFilePaths = uniquePaths(candidates).filter((candidate) =>
		matchesImportPatterns(candidate, config),
	);

	const externalUrls = config.externals.map((external) => external.url);

	return {
		ontologyFilePaths,
		externalUrls,
		config,
	};
}

function toRepositoryRef(payload: z.infer<typeof pushEventSchema>): RepositoryRef {
	const ownerFromLogin = payload.repository.owner.login;
	const ownerFromName = payload.repository.owner.name;
	const ownerFromFullName = payload.repository.full_name?.split('/')[0];
	const owner = ownerFromLogin ?? ownerFromName ?? ownerFromFullName;

	if (owner === undefined || owner.trim().length === 0) {
		throw new Error('GitHub push payload is missing repository owner information.');
	}

	if (payload.installation?.id === undefined) {
		throw new Error('GitHub push payload is missing installation.id.');
	}

	return {
		owner,
		repo: payload.repository.name,
		ref: normalizeRef(payload.ref),
		installationId: payload.installation.id,
	};
}

function normalizeRef(value: string): string {
	return value.startsWith('refs/heads/') ? value.replace('refs/heads/', '') : value;
}

function collectChangedFiles(payload: z.infer<typeof pushEventSchema>): string[] {
	const changed = new Set<string>();

	for (const commit of payload.commits) {
		for (const filePath of [...commit.added, ...commit.modified]) {
			changed.add(filePath);
		}
	}

	return [...changed];
}

function uniquePaths(paths: readonly string[]): string[] {
	const deduped = new Set<string>();
	for (const entry of paths) {
		const normalized = entry.replace(/\\/g, '/');
		deduped.add(normalized);
	}

	return [...deduped];
}

async function parseFileBuffer(
	buffer: Buffer,
	sourcePath: string,
	parseOntologyFile: (filePath: string) => Promise<Ontology>,
): Promise<Ontology> {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'swatedb-import-'));
	const extension = sourcePath.toLowerCase().endsWith('.obo') ? '.obo' : '.owl';
	const tempPath = path.join(tempDirectory, `ontology${extension}`);

	try {
		await writeFile(tempPath, buffer);
		return await parseOntologyFile(tempPath);
	} finally {
		await rm(tempDirectory, { recursive: true, force: true });
	}
}

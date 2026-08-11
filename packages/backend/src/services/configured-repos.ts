import { z } from 'zod';
import { getLogger } from '../middleware/request-logger';

const configuredRepoEntrySchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	installationId: z.number().int().positive(),
	ref: z.string().min(1).default('main'),
	label: z.string().optional(),
});

export type ConfiguredRepoEntry = z.infer<typeof configuredRepoEntrySchema>;

export interface ConfiguredRepoPublic {
	index: number;
	owner: string;
	repo: string;
	ref: string;
	label?: string;
}

const configuredReposSchema = z.array(configuredRepoEntrySchema);

function parseConfiguredRepos(): ConfiguredRepoEntry[] {
	const raw = process.env.CONFIGURED_GITHUB_ONTOLOGY_REPOS;
	const logger = getLogger();

	logger.info({
		isDefined: raw !== undefined,
		type: typeof raw,
		length: raw !== undefined ? raw.length : null,
	}, 'CONFIGURED_GITHUB_ONTOLOGY_REPOS inspect');

	if (raw === undefined || raw.trim().length === 0) {
		logger.info('CONFIGURED_GITHUB_ONTOLOGY_REPOS is empty or not set — no configured repos');
		return [];
	}

	logger.info({ raw }, 'Parsing CONFIGURED_GITHUB_ONTOLOGY_REPOS');

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		throw new Error('CONFIGURED_GITHUB_ONTOLOGY_REPOS is not valid JSON');
	}

	const repos = configuredReposSchema.parse(parsed);
	logger.info({ count: repos.length }, 'Loaded configured GitHub ontology repos');

	return repos;
}

let cached: ConfiguredRepoEntry[] | null = null;

export function getConfiguredRepos(): ConfiguredRepoEntry[] {
	if (cached === null) {
		cached = parseConfiguredRepos();
	}

	return cached;
}

export function getConfiguredRepoByIndex(index: number): ConfiguredRepoEntry | undefined {
	return getConfiguredRepos()[index];
}

export function getConfiguredReposPublic(): ConfiguredRepoPublic[] {
	return getConfiguredRepos().map((entry, index) => ({
		index,
		owner: entry.owner,
		repo: entry.repo,
		ref: entry.ref,
		label: entry.label,
	}));
}

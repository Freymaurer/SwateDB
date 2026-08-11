import { createAppAuth } from '@octokit/auth-app';

const GITHUB_API_BASE_URL = 'https://api.github.com';

export interface GitHubAppConfig {
	appId: string;
	privateKey: string;
	apiBaseUrl: string;
}

export interface RepositoryDescriptor {
	owner: string;
	repo: string;
	ref: string;
	installationId: number;
}

export interface RepositoryFileRequest extends RepositoryDescriptor {
	path: string;
}

export interface GitHubRepositoryClient {
	listRepositoryFiles(repository: RepositoryDescriptor): Promise<string[]>;
	getRepositoryFileText(request: RepositoryFileRequest): Promise<string | null>;
	downloadRepositoryFile(request: RepositoryFileRequest): Promise<Buffer>;
}

interface ContentsResponse {
  type: string;
  encoding?: string;
  content?: string;
  download_url?: string;
}

interface TreeResponse {
	tree: Array<{
		path: string;
		type: string;
	}>;
}

export function resolveGitHubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig {
	const appId = env.GITHUB_APP_ID;
	const privateKeyRaw = env.GITHUB_PRIVATE_KEY;

	if (appId === undefined || appId.trim().length === 0) {
		throw new Error('Missing required environment variable: GITHUB_APP_ID');
	}

	if (privateKeyRaw === undefined || privateKeyRaw.trim().length === 0) {
		throw new Error('Missing required environment variable: GITHUB_PRIVATE_KEY');
	}

	const apiBaseUrl = env.GITHUB_API_BASE_URL?.trim() || GITHUB_API_BASE_URL;

	return {
		appId,
		privateKey: normalizePrivateKey(privateKeyRaw),
		apiBaseUrl,
	};
}

export function createGitHubRepositoryClient(
	config: GitHubAppConfig = resolveGitHubAppConfig(),
): GitHubRepositoryClient {
	const auth = createAppAuth({
		appId: config.appId,
		privateKey: config.privateKey,
	});

	return {
		listRepositoryFiles: async (repository) => {
			const token = await getInstallationToken(auth, repository.installationId);
			const tree = await githubRequest<TreeResponse>(
				config.apiBaseUrl,
				token,
				`/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(repository.ref)}?recursive=1`,
			);

			return tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
		},
		getRepositoryFileText: async (request) => {
			try {
				const content = await downloadFileBuffer(config.apiBaseUrl, auth, request);
				return content.toString('utf8');
			} catch (error) {
				if (isNotFoundError(error)) {
					return null;
				}

				throw error;
			}
		},
		downloadRepositoryFile: async (request) => downloadFileBuffer(config.apiBaseUrl, auth, request),
	};
}

async function downloadFileBuffer(
	apiBaseUrl: string,
	auth: ReturnType<typeof createAppAuth>,
	request: RepositoryFileRequest,
): Promise<Buffer> {
	const token = await getInstallationToken(auth, request.installationId);
	const encodedPath = request.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	const payload = await githubRequest<ContentsResponse>(
		apiBaseUrl,
		token,
		`/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(request.ref)}`,
	);

  if (payload.type !== 'file') {
    throw new Error(`Path is not a file: ${request.owner}/${request.repo}@${request.ref}:${request.path}`);
  }

  if (payload.content !== undefined && payload.encoding === 'base64') {
    const normalized = payload.content.replace(/\n/g, '');
    return Buffer.from(normalized, 'base64');
  }

  if (payload.download_url !== undefined) {
    const response = await fetch(payload.download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'swatedb-backend',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file from ${payload.download_url} (${response.status})`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error(
    `Unsupported file response for path: ${request.owner}/${request.repo}@${request.ref}:${request.path}`,
  );
}

async function getInstallationToken(
	auth: ReturnType<typeof createAppAuth>,
	installationId: number,
): Promise<string> {
	const authResponse = await auth({
		type: 'installation',
		installationId,
	});

	return authResponse.token;
}

async function githubRequest<T>(
	apiBaseUrl: string,
	token: string,
	path: string,
): Promise<T> {
	const response = await fetch(`${apiBaseUrl}${path}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': 'swatedb-backend',
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`GitHub API request failed (${response.status}): ${body}`);
	}

	return (await response.json()) as T;
}

function normalizePrivateKey(privateKeyRaw: string): string {
	return privateKeyRaw.replace(/\\n/g, '\n').trim();
}

function isNotFoundError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return /\(404\)/.test(error.message);
}

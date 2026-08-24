export interface ComponentStatus {
  status: 'up' | 'down';
  detail?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  components: {
    neo4j: ComponentStatus;
    redis: ComponentStatus;
    jvm: ComponentStatus;
  };
}

export interface JobSummary {
  id: string;
  name: string;
  state: string;
  progress: number | null;
  attemptsMade: number;
  timestamp: number;
  finishedOn: number | null;
  failedReason: string | null;
  errorSummary: string | null;
  fullErrorMessage: string | null;
}

export interface JobsResponse {
  jobs: JobSummary[];
}

export interface SyncRequest {
  owner: string;
  repo: string;
  ref: string;
  installationId: number;
}

export interface SyncConfiguredRequest {
  index: number;
  ref?: string;
}

export interface SyncQueuedResponse {
  status: 'queued';
  jobId: string;
  matchedFiles: number;
  externals: number;
}

export interface ConfiguredRepoPublic {
  index: number;
  owner: string;
  repo: string;
  ref: string;
  label?: string;
}

interface CollectionTotalsResponse {
  totalItems: number;
}

interface TermCountResponse {
  count: number;
}

export interface TermSearchEntry {
  '@id': string;
  'dcterms:identifier': string;
  'dcterms:title': string;
  'dcterms:description': string | null;
  'mod:artefact': string;
}

export interface TermSearchResponse {
  totalItems: number;
  member: TermSearchEntry[];
}

export interface DbStats {
  artefactsTotal: number;
  recordsTotal: number;
  termsTotal: number;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  public constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const apiBaseUrlRaw = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl = typeof apiBaseUrlRaw === 'string' ? apiBaseUrlRaw.trim() : '';

interface FetchJsonOptions {
  acceptStatuses?: number[];
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health', {}, { acceptStatuses: [503] });
}

export async function getJobs(token: string, limit = 100): Promise<JobSummary[]> {
  const response = await fetchJson<JobsResponse>(`/api/admin/jobs?limit=${limit}`, {
    method: 'GET',
    headers: withAuthorization(token),
  });

  return response.jobs;
}

export async function getJob(token: string, id: string): Promise<JobSummary> {
  return fetchJson<JobSummary>(`/api/admin/jobs/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: withAuthorization(token),
  });
}

export async function triggerSync(token: string, request: SyncRequest): Promise<SyncQueuedResponse> {
  return fetchJson<SyncQueuedResponse>('/api/admin/sync', {
    method: 'POST',
    headers: {
      ...withAuthorization(token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

export async function getConfiguredRepos(token: string): Promise<ConfiguredRepoPublic[]> {
  const response = await fetchJson<{ repos: ConfiguredRepoPublic[] }>('/api/admin/configured-repos', {
    method: 'GET',
    headers: withAuthorization(token),
  });

  return response.repos;
}

export async function triggerConfiguredSync(
  token: string,
  request: SyncConfiguredRequest,
): Promise<SyncQueuedResponse> {
  return fetchJson<SyncQueuedResponse>('/api/admin/sync-configured', {
    method: 'POST',
    headers: {
      ...withAuthorization(token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

export async function getDbStats(): Promise<DbStats> {
  const [artefactsTotal, recordsTotal, termsTotal] = await Promise.all([
    getCollectionTotal('/artefacts'),
    getCollectionTotal('/records'),
    getTermCount(),
  ]);

  return {
    artefactsTotal,
    recordsTotal,
    termsTotal,
  };
}

function withAuthorization(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}

async function getCollectionTotal(endpointBase: string): Promise<number> {
  const payload = await fetchJson<CollectionTotalsResponse>(
    `${endpointBase}?format=jsonld&page=1&pagesize=1`,
  );
  return Number.isFinite(payload.totalItems) ? payload.totalItems : 0;
}

async function getTermCount(): Promise<number> {
  const payload = await fetchJson<TermCountResponse>('/terms/count');
  return Number.isFinite(payload.count) ? payload.count : 0;
}

export async function searchTerms(
  query: string,
  page = 1,
  pageSize = 20,
): Promise<TermSearchResponse> {
  return fetchJson<TermSearchResponse>(
    `/search/content?format=jsonld&q=${encodeURIComponent(query)}&page=${page}&pagesize=${pageSize}`,
  );
}

async function fetchJson<T>(
  endpoint: string,
  init: RequestInit = {},
  options: FetchJsonOptions = {},
): Promise<T> {
  const target = toAbsoluteUrl(endpoint);
  const response = await fetch(target, {
    ...init,
  });

  const acceptedStatuses = options.acceptStatuses ?? [];
  const isAcceptedNonOkStatus = !response.ok && acceptedStatuses.includes(response.status);

  if (!response.ok && !isAcceptedNonOkStatus) {
    const errorPayload = await parsePossibleJson(response);
    const fallbackMessage = `Request failed (${response.status}) for ${endpoint}`;

    const errorMessage =
      isObject(errorPayload) &&
      'error' in errorPayload &&
      isObject(errorPayload.error) &&
      typeof errorPayload.error.message === 'string'
        ? errorPayload.error.message
        : fallbackMessage;

    const details =
      isObject(errorPayload) &&
      'error' in errorPayload &&
      isObject(errorPayload.error) &&
      'details' in errorPayload.error
        ? errorPayload.error.details
        : undefined;

    throw new ApiError(response.status, errorMessage, details);
  }

  const payload = (await response.json()) as T;
  return payload;
}

function toAbsoluteUrl(endpoint: string): string {
  if (apiBaseUrl.length === 0) {
    return endpoint;
  }

  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${normalizedBase}${endpoint}`;
}

async function parsePossibleJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (contentType !== null && contentType.toLowerCase().includes('application/json')) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  return {
    message: text,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

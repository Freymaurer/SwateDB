export interface RepositoryRef {
  owner: string;
  repo: string;
  ref: string;
  installationId: number;
}

export interface ImportJobData {
  trigger: 'webhook' | 'admin';
  repository: RepositoryRef;
  ontologyFilePaths: string[];
  externalUrls: string[];
  requestedBy?: string;
  deliveryId?: string;
}

export interface ImportJobResult {
  importedOntologies: number;
  importedExternals: number;
  totalProcessed: number;
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

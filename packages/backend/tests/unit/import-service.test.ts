import { describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryClient } from '../../src/services/github-app';
import { createImportService } from '../../src/services/import-service';

describe('createImportService build and enqueue behavior', () => {
  it('applies include and exclude patterns from .swatedb.yml', async () => {
    const queuedJobs: unknown[] = [];

    const githubClient: GitHubRepositoryClient = {
      listRepositoryFiles: vi.fn(async () => [
        'ontologies/core.owl',
        'ontologies/legacy/old.owl',
        'docs/readme.md',
      ]),
      getRepositoryFileText: vi.fn(async () =>
        [
          'import:',
          '  include:',
          '    - "ontologies/**/*.owl"',
          '  exclude:',
          '    - "**/legacy/**"',
          'externals:',
          '  - "https://example.org/external.owl"',
        ].join('\n'),
      ),
      downloadRepositoryFile: vi.fn(async () => Buffer.from('unused in this test')),
    };

    const service = createImportService({
      githubClient,
      enqueueJob: async (job) => {
        queuedJobs.push(job);
        return 'queued-1';
      },
    });

    const result = await service.enqueueManualSync({
      owner: 'acme',
      repo: 'ontologies',
      ref: 'main',
      installationId: 7,
    });

    expect(result.jobId).toBe('queued-1');
    expect(result.matchedFiles).toBe(1);
    expect(result.externals).toBe(1);
    expect(queuedJobs).toHaveLength(1);

    const queued = queuedJobs[0] as {
      ontologyFilePaths: string[];
      externalUrls: string[];
    };

    expect(queued.ontologyFilePaths).toEqual(['ontologies/core.owl']);
    expect(queued.externalUrls).toEqual(['https://example.org/external.owl']);
  });

  it('queues push events with changed ontology files only', async () => {
    const enqueueJob = vi.fn(async () => 'queued-push-1');

    const githubClient: GitHubRepositoryClient = {
      listRepositoryFiles: vi.fn(async () => ['ontologies/core.owl', 'docs/readme.md']),
      getRepositoryFileText: vi.fn(async () => null),
      downloadRepositoryFile: vi.fn(async () => Buffer.from('unused in this test')),
    };

    const service = createImportService({
      githubClient,
      enqueueJob,
    });

    const result = await service.enqueueFromPushEvent({
      ref: 'refs/heads/main',
      installation: { id: 7 },
      repository: {
        name: 'ontologies',
        owner: { login: 'acme' },
      },
      commits: [
        {
          added: ['ontologies/core.owl'],
          modified: ['docs/readme.md'],
        },
      ],
    });

    expect(result.jobId).toBe('queued-push-1');
    expect(result.matchedFiles).toBe(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Ontology } from '@swatedb/ontology-lib';
import type { GitHubRepositoryClient } from '../../src/services/github-app';
import { createImportService } from '../../src/services/import-service';
import type { ImportJobData } from '../../src/services/import-types';

function makeOntology(name: string): Ontology {
  return {
    name,
    version: '1.0.0',
    metadata: {
      title: null,
      description: null,
      license: null,
      creator: null,
      versionIRI: null,
    },
    terms: [
      {
        accession: 'TEST:0001',
        name: 'Test Term',
        definition: 'Definition',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
    ],
  };
}

describe('import processing pipeline', () => {
  it('processes repository files and external URLs through parse + import flow', async () => {
    const parseOntologyFile = vi.fn(async () => makeOntology('from-file'));
    const parseOntologyUrl = vi.fn(async () => makeOntology('from-url'));
    const importOntologyGraph = vi.fn(async () => undefined);
    const reportProgress = vi.fn(async (value: number) => {
      void value;
      return undefined;
    });

    const githubClient: GitHubRepositoryClient = {
      listRepositoryFiles: vi.fn(async () => []),
      getRepositoryFileText: vi.fn(async () => null),
      downloadRepositoryFile: vi.fn(async () => Buffer.from('ontology content')),
    };

    const service = createImportService({
      githubClient,
      parseOntologyFile,
      parseOntologyUrl,
      importOntologyGraph,
      enqueueJob: async () => 'unused',
    });

    const jobData: ImportJobData = {
      trigger: 'admin',
      repository: {
        owner: 'acme',
        repo: 'ontologies',
        ref: 'main',
        installationId: 9,
      },
      ontologyFilePaths: ['ontologies/core.owl'],
      externalUrls: ['https://example.org/external.owl'],
    };

    const result = await service.processImportJob(jobData, reportProgress);

    expect(result.importedOntologies).toBe(1);
    expect(result.importedExternals).toBe(1);
    expect(result.totalProcessed).toBe(2);
    expect(parseOntologyFile).toHaveBeenCalledTimes(1);
    expect(parseOntologyUrl).toHaveBeenCalledTimes(1);
    expect(importOntologyGraph).toHaveBeenCalledTimes(2);
    expect(reportProgress).toHaveBeenCalled();
  });
});

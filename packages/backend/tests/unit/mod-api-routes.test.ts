import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index';
import type {
  ArtefactEntry,
  DistributionEntry,
  ModApiService,
  ResourceEntry,
  SearchEntry,
} from '../../src/routes/mod-api/service';

const artefact: ArtefactEntry = {
  id: 'demo-ontology',
  title: 'Demo Ontology',
  description: 'A demo ontology',
  version: '1.0.0',
  creator: 'swatedb',
  license: 'MIT',
  versionIRI: 'https://example.org/demo/1.0.0',
  modified: '2026-08-10T00:00:00Z',
};

const distribution: DistributionEntry = {
  id: '1.0.0',
  artefactId: artefact.id,
  title: 'Demo Ontology 1.0.0',
  mediaType: 'application/ld+json',
  downloadURL: '/artefacts/demo-ontology/resources',
  modified: artefact.modified,
  isLatest: true,
};

const resource: ResourceEntry = {
  id: 'DEMO:0001',
  artefactId: artefact.id,
  accession: 'DEMO:0001',
  label: 'Demo Term',
  definition: 'A demo term',
  isObsolete: false,
  resourceType: 'owl:Class',
};

const searchEntries: SearchEntry[] = [
  {
    id: resource.id,
    artefactId: artefact.id,
    resultType: 'content',
    label: resource.label,
    description: resource.definition,
  },
  {
    id: artefact.id,
    artefactId: artefact.id,
    resultType: 'metadata',
    label: artefact.title,
    description: artefact.description,
  },
];

function createMockModApiService(): ModApiService {
  return {
    getCatalogue: async () => artefact,
    listArtefacts: async () => ({
      members: [artefact],
      totalItems: 1,
    }),
    getArtefact: async (artefactId) => (artefactId === artefact.id ? artefact : null),
    listRecords: async () => ({
      members: [
        {
          artefactId: artefact.id,
          created: artefact.modified,
          modified: artefact.modified,
        },
      ],
      totalItems: 1,
    }),
    getRecord: async (artefactId) =>
      artefactId === artefact.id
        ? {
            artefactId,
            created: artefact.modified,
            modified: artefact.modified,
          }
        : null,
    listDistributions: async (artefactId) => ({
      members: artefactId === artefact.id ? [distribution] : [],
      totalItems: artefactId === artefact.id ? 1 : 0,
    }),
    getDistribution: async (artefactId, distributionId) =>
      artefactId === artefact.id && distributionId === distribution.id ? distribution : null,
    getLatestDistribution: async (artefactId) => (artefactId === artefact.id ? distribution : null),
    listResources: async (artefactId, _input, resourceType) => ({
      members:
        artefactId === artefact.id
          ? [
              {
                ...resource,
                resourceType: resourceType ?? resource.resourceType,
              },
            ]
          : [],
      totalItems: artefactId === artefact.id ? 1 : 0,
    }),
    getResource: async (artefactId, resourceId) =>
      artefactId === artefact.id && resourceId === resource.id ? resource : null,
    search: async (_query, _input, mode) => ({
      members:
        mode === 'all'
          ? searchEntries
          : mode === 'content'
            ? searchEntries.filter((entry) => entry.resultType === 'content')
            : searchEntries.filter((entry) => entry.resultType === 'metadata'),
      totalItems: mode === 'all' ? 2 : 1,
    }),
  };
}

describe('MOD API route coverage', () => {
  it('serves all required MOD and docs endpoints', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const checks: Array<{ path: string; query?: string }> = [
      { path: '/', query: 'format=jsonld' },
      { path: '/records', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/records/demo-ontology', query: 'format=jsonld' },
      { path: '/doc/api' },
      { path: '/artefacts', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology', query: 'format=jsonld' },
      { path: '/artefacts/demo-ontology/distributions', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/distributions/1.0.0', query: 'format=jsonld' },
      { path: '/artefacts/demo-ontology/distributions/latest', query: 'format=jsonld' },
      { path: '/artefacts/demo-ontology/record', query: 'format=jsonld' },
      { path: '/artefacts/demo-ontology/resources', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/DEMO%3A0001', query: 'format=jsonld' },
      { path: '/artefacts/demo-ontology/resources/classes', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/concepts', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/properties', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/individuals', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/schemes', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/collections', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/artefacts/demo-ontology/resources/labels', query: 'format=jsonld&page=1&pagesize=10' },
      { path: '/search', query: 'format=jsonld&q=demo&page=1&pagesize=10' },
      { path: '/search/content', query: 'format=jsonld&q=demo&page=1&pagesize=10' },
      { path: '/search/metadata', query: 'format=jsonld&q=demo&page=1&pagesize=10' },
    ];

    for (const check of checks) {
      const target = check.query === undefined ? check.path : `${check.path}?${check.query}`;
      const response =
        check.path === '/doc/api'
          ? await request(app).get(target).redirects(1)
          : await request(app).get(target);
      expect(response.status, `Expected 200 for GET ${target}`).toBe(200);
    }
  });

  it('returns 406 for runtime-unsupported serialization format', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app).get('/artefacts?format=ttl');

    expect(response.status).toBe(406);
    expect(response.body.error.code).toBe('unsupported_format');
  });

  it('returns 400 when search query q is missing', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app).get('/search?format=jsonld');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });

  it('returns hydra pagination view fields for out-of-range page requests', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app).get('/artefacts?format=jsonld&page=99&pagesize=10');

    expect(response.status).toBe(200);
    expect(response.body.view).toBeDefined();
    expect(response.body.view['hydra:first']).toBeDefined();
    expect(response.body.view['hydra:last']).toBeDefined();
  });
});

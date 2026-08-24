import type {
  ArtefactEntry,
  DistributionEntry,
  ModApiService,
  ResourceEntry,
  SearchEntry,
} from '../../src/routes/mod-api/service';

export interface ModApiPathCheck {
  path: string;
  query?: string;
}

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

export const modApiPathChecks: ModApiPathCheck[] = [
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
  { path: '/terms/count' },
];

export function createMockModApiService(): ModApiService {
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
    countTerms: async () => 42,
  };
}

import type { Driver, Record as Neo4jRecord } from 'neo4j-driver';
import { getNeo4jDriver } from '../../db/neo4j';

export interface PaginationInput {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  members: T[];
  totalItems: number;
}

export interface ArtefactEntry {
  id: string;
  title: string;
  description: string | null;
  version: string;
  creator: string | null;
  license: string | null;
  versionIRI: string | null;
  modified: string | null;
}

export interface RecordEntry {
  artefactId: string;
  created: string | null;
  modified: string | null;
}

export interface DistributionEntry {
  id: string;
  artefactId: string;
  title: string;
  mediaType: string;
  downloadURL: string;
  modified: string | null;
  isLatest: boolean;
}

export interface ResourceEntry {
  id: string;
  artefactId: string;
  accession: string;
  label: string;
  definition: string | null;
  isObsolete: boolean;
  resourceType: string;
}

export interface SearchEntry {
  id: string;
  artefactId: string;
  resultType: 'metadata' | 'content';
  label: string;
  description: string | null;
}

export interface ModApiService {
  getCatalogue(): Promise<ArtefactEntry>;
  listArtefacts(input: PaginationInput): Promise<PaginatedResult<ArtefactEntry>>;
  getArtefact(artefactId: string): Promise<ArtefactEntry | null>;
  listRecords(input: PaginationInput): Promise<PaginatedResult<RecordEntry>>;
  getRecord(artefactId: string): Promise<RecordEntry | null>;
  listDistributions(artefactId: string, input: PaginationInput): Promise<PaginatedResult<DistributionEntry>>;
  getDistribution(artefactId: string, distributionId: string): Promise<DistributionEntry | null>;
  getLatestDistribution(artefactId: string): Promise<DistributionEntry | null>;
  listResources(
    artefactId: string,
    input: PaginationInput,
    resourceType?: string,
  ): Promise<PaginatedResult<ResourceEntry>>;
  getResource(artefactId: string, resourceId: string): Promise<ResourceEntry | null>;
  search(
    query: string,
    input: PaginationInput,
    mode: 'all' | 'content' | 'metadata',
  ): Promise<PaginatedResult<SearchEntry>>;
}

export function createModApiService(driver: Driver = getNeo4jDriver()): ModApiService {
  return {
    getCatalogue: async () => {
      const session = driver.session();
      try {
        const result = await session.run(
          `
            MATCH (o:Ontology)
            RETURN o
            ORDER BY o.name ASC
            LIMIT 1
          `,
        );

        const record = result.records[0];
        if (record === undefined) {
          return {
            id: 'swatedb-catalogue',
            title: 'SwateDB Catalogue',
            description: 'Semantic artefact catalogue backed by SwateDB.',
            version: '0.1.0',
            creator: null,
            license: null,
            versionIRI: null,
            modified: null,
          };
        }

        return mapArtefactRecord(record, 'o');
      } finally {
        await session.close();
      }
    },

    listArtefacts: async (input) => {
      const session = driver.session();
      try {
        const result = await session.run(
          `
            MATCH (o:Ontology)
            RETURN o
            ORDER BY o.name ASC
            SKIP toInteger($skip)
            LIMIT toInteger($limit)
          `,
          toPaginationParams(input),
        );

        const countResult = await session.run('MATCH (o:Ontology) RETURN count(o) AS totalItems');
        const totalItems = toNumber(countResult.records[0]?.get('totalItems'));

        return {
          members: result.records.map((record) => mapArtefactRecord(record, 'o')),
          totalItems,
        };
      } finally {
        await session.close();
      }
    },

    getArtefact: async (artefactId) => {
      const session = driver.session();
      try {
        const result = await session.run(
          `
            MATCH (o:Ontology {name: $artefactId})
            RETURN o
            LIMIT 1
          `,
          { artefactId },
        );

        const record = result.records[0];
        return record === undefined ? null : mapArtefactRecord(record, 'o');
      } finally {
        await session.close();
      }
    },

    listRecords: async (input) => {
      const artefacts = await thisListArtefacts(driver, input);

      return {
        members: artefacts.members.map((artefact) => ({
          artefactId: artefact.id,
          created: artefact.modified,
          modified: artefact.modified,
        })),
        totalItems: artefacts.totalItems,
      };
    },

    getRecord: async (artefactId) => {
      const artefact = await thisGetArtefact(driver, artefactId);
      if (artefact === null) {
        return null;
      }

      return {
        artefactId: artefact.id,
        created: artefact.modified,
        modified: artefact.modified,
      };
    },

    listDistributions: async (artefactId, input) => {
      const artefact = await thisGetArtefact(driver, artefactId);
      if (artefact === null) {
        return {
          members: [],
          totalItems: 0,
        };
      }

      const distribution = toDistribution(artefact);
      const start = (input.page - 1) * input.pageSize;
      const end = start + input.pageSize;

      return {
        members: [distribution].slice(start, end),
        totalItems: 1,
      };
    },

    getDistribution: async (artefactId, distributionId) => {
      const artefact = await thisGetArtefact(driver, artefactId);
      if (artefact === null) {
        return null;
      }

      const distribution = toDistribution(artefact);
      return distribution.id === distributionId ? distribution : null;
    },

    getLatestDistribution: async (artefactId) => {
      const artefact = await thisGetArtefact(driver, artefactId);
      if (artefact === null) {
        return null;
      }

      return toDistribution(artefact);
    },

    listResources: async (artefactId, input, resourceType = 'owl:Class') => {
      const session = driver.session();
      try {
        const result = await session.run(
          `
            MATCH (t:Term)-[:CONTAINED_IN]->(o:Ontology {name: $artefactId})
            RETURN t
            ORDER BY t.accession ASC
            SKIP toInteger($skip)
            LIMIT toInteger($limit)
          `,
          {
            artefactId,
            ...toPaginationParams(input),
          },
        );

        const countResult = await session.run(
          `
            MATCH (:Term)-[:CONTAINED_IN]->(o:Ontology {name: $artefactId})
            RETURN count(*) AS totalItems
          `,
          { artefactId },
        );

        const totalItems = toNumber(countResult.records[0]?.get('totalItems'));

        return {
          members: result.records.map((record) => mapResourceRecord(record, artefactId, resourceType)),
          totalItems,
        };
      } finally {
        await session.close();
      }
    },

    getResource: async (artefactId, resourceId) => {
      const session = driver.session();
      try {
        const result = await session.run(
          `
            MATCH (t:Term {accession: $resourceId})-[:CONTAINED_IN]->(o:Ontology {name: $artefactId})
            RETURN t
            LIMIT 1
          `,
          {
            artefactId,
            resourceId,
          },
        );

        const record = result.records[0];
        return record === undefined ? null : mapResourceRecord(record, artefactId, 'owl:Class');
      } finally {
        await session.close();
      }
    },

    search: async (query, input, mode) => {
      const normalizedQuery = query.trim().toLowerCase();
      const session = driver.session();

      try {
        const whereMetadata =
          mode === 'content'
            ? 'FALSE'
            : `
                toLower(o.name) CONTAINS $query
                OR toLower(coalesce(o.title, '')) CONTAINS $query
                OR toLower(coalesce(o.description, '')) CONTAINS $query
              `;

        const whereContent =
          mode === 'metadata'
            ? 'FALSE'
            : `
                toLower(t.name) CONTAINS $query
                OR toLower(coalesce(t.definition, '')) CONTAINS $query
              `;

        const result = await session.run(
          `
            CALL {
              MATCH (o:Ontology)
              WHERE ${whereMetadata}
              RETURN
                o.name AS id,
                o.name AS artefactId,
                coalesce(o.title, o.name) AS label,
                o.description AS description,
                'metadata' AS resultType

              UNION

              MATCH (t:Term)-[:CONTAINED_IN]->(o:Ontology)
              WHERE ${whereContent}
              RETURN
                t.accession AS id,
                o.name AS artefactId,
                t.name AS label,
                t.definition AS description,
                'content' AS resultType
            }
            RETURN id, artefactId, label, description, resultType
            ORDER BY resultType ASC, label ASC
            SKIP toInteger($skip)
            LIMIT toInteger($limit)
          `,
          {
            query: normalizedQuery,
            ...toPaginationParams(input),
          },
        );

        const countResult = await session.run(
          `
            CALL {
              MATCH (o:Ontology)
              WHERE ${whereMetadata}
              RETURN 1 AS hit

              UNION

              MATCH (t:Term)-[:CONTAINED_IN]->(o:Ontology)
              WHERE ${whereContent}
              RETURN 1 AS hit
            }
            RETURN count(hit) AS totalItems
          `,
          {
            query: normalizedQuery,
          },
        );

        const totalItems = toNumber(countResult.records[0]?.get('totalItems'));

        return {
          members: result.records.map((record) => ({
            id: String(record.get('id')),
            artefactId: String(record.get('artefactId')),
            resultType: record.get('resultType') === 'metadata' ? 'metadata' : 'content',
            label: String(record.get('label')),
            description: nullableString(record.get('description')),
          })),
          totalItems,
        };
      } finally {
        await session.close();
      }
    },
  };
}

async function thisListArtefacts(driver: Driver, input: PaginationInput): Promise<PaginatedResult<ArtefactEntry>> {
  const service = createModApiService(driver);
  return service.listArtefacts(input);
}

async function thisGetArtefact(driver: Driver, artefactId: string): Promise<ArtefactEntry | null> {
  const service = createModApiService(driver);
  return service.getArtefact(artefactId);
}

function mapArtefactRecord(record: Neo4jRecord, key: string): ArtefactEntry {
  const node = record.get(key) as {
    properties: Record<string, unknown>;
  };

  const name = String(node.properties.name ?? 'unknown');

  return {
    id: name,
    title: nullableString(node.properties.title) ?? name,
    description: nullableString(node.properties.description),
    version: nullableString(node.properties.version) ?? 'latest',
    creator: nullableString(node.properties.creator),
    license: nullableString(node.properties.license),
    versionIRI: nullableString(node.properties.versionIRI),
    modified: nullableString(node.properties.updatedAt),
  };
}

function mapResourceRecord(
  record: Neo4jRecord,
  artefactId: string,
  resourceType: string,
): ResourceEntry {
  const node = record.get('t') as {
    properties: Record<string, unknown>;
  };

  return {
    id: String(node.properties.accession ?? ''),
    artefactId,
    accession: String(node.properties.accession ?? ''),
    label: String(node.properties.name ?? ''),
    definition: nullableString(node.properties.definition),
    isObsolete: Boolean(node.properties.isObsolete ?? false),
    resourceType,
  };
}

function toDistribution(artefact: ArtefactEntry): DistributionEntry {
  const distributionId = artefact.version.length > 0 ? artefact.version : 'latest';

  return {
    id: distributionId,
    artefactId: artefact.id,
    title: `${artefact.id} ${distributionId}`,
    mediaType: 'application/ld+json',
    downloadURL: `/artefacts/${encodeURIComponent(artefact.id)}/resources`,
    modified: artefact.modified,
    isLatest: true,
  };
}

function toPaginationParams(input: PaginationInput): { skip: number; limit: number } {
  return {
    skip: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
  };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value !== null && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return 0;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value);
  return normalized.length > 0 ? normalized : null;
}

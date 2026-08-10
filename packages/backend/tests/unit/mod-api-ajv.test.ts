import Ajv from 'ajv';
import addFormats from 'ajv-formats';
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

function createMockModApiService(): ModApiService {
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

  const searchEntry: SearchEntry = {
    id: 'DEMO:0001',
    artefactId: artefact.id,
    resultType: 'content',
    label: 'Demo Term',
    description: 'A demo term',
  };

  return {
    getCatalogue: async () => artefact,
    listArtefacts: async () => ({ members: [artefact], totalItems: 1 }),
    getArtefact: async () => artefact,
    listRecords: async () => ({
      members: [{ artefactId: artefact.id, created: artefact.modified, modified: artefact.modified }],
      totalItems: 1,
    }),
    getRecord: async () => ({
      artefactId: artefact.id,
      created: artefact.modified,
      modified: artefact.modified,
    }),
    listDistributions: async () => ({ members: [distribution], totalItems: 1 }),
    getDistribution: async () => distribution,
    getLatestDistribution: async () => distribution,
    listResources: async (_artefactId, _input, resourceType) => ({
      members: [{ ...resource, resourceType: resourceType ?? resource.resourceType }],
      totalItems: 1,
    }),
    getResource: async () => resource,
    search: async () => ({
      members: [searchEntry],
      totalItems: 1,
    }),
  };
}

describe('MOD API representative AJV validation', () => {
  it('validates /artefacts response shape with AJV', async () => {
    const app = createApp({ modApiService: createMockModApiService() });
    const response = await request(app).get('/artefacts?format=jsonld&page=1&pagesize=10');

    expect(response.status).toBe(200);

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    const schema = {
      type: 'object',
      required: ['@context', '@id', '@type', 'totalItems', 'itemsPerPage', 'member', 'view'],
      properties: {
        '@context': { type: 'object' },
        '@id': { type: 'string' },
        '@type': { const: 'hydra:Collection' },
        totalItems: { type: 'number', minimum: 0 },
        itemsPerPage: { type: 'number', minimum: 1 },
        member: {
          type: 'array',
          items: {
            type: 'object',
            required: ['@id', '@type', 'dcterms:identifier'],
            properties: {
              '@id': { type: 'string' },
              '@type': { type: 'string' },
              'dcterms:identifier': { type: 'string' },
            },
          },
        },
        view: {
          type: 'object',
          required: ['@id', '@type', 'hydra:first', 'hydra:last'],
          properties: {
            '@id': { type: 'string' },
            '@type': { const: 'hydra:PartialCollectionView' },
            'hydra:first': { type: 'string' },
            'hydra:last': { type: 'string' },
            'hydra:next': { type: 'string' },
            'hydra:previous': { type: 'string' },
          },
        },
      },
    };

    const validate = ajv.compile(schema);
    const isValid = validate(response.body);

    expect(isValid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('validates /search response shape with AJV', async () => {
    const app = createApp({ modApiService: createMockModApiService() });
    const response = await request(app).get('/search?format=jsonld&q=demo&page=1&pagesize=10');

    expect(response.status).toBe(200);

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    const schema = {
      type: 'object',
      required: ['@context', '@id', '@type', 'member'],
      properties: {
        '@context': { type: 'object' },
        '@id': { type: 'string' },
        '@type': { const: 'hydra:Collection' },
        member: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['@id', '@type', 'dcterms:identifier', 'mod:resultType', 'mod:artefact'],
            properties: {
              '@id': { type: 'string' },
              '@type': { type: 'string' },
              'dcterms:identifier': { type: 'string' },
              'mod:resultType': { enum: ['content', 'metadata'] },
              'mod:artefact': { type: 'string' },
            },
          },
        },
      },
    };

    const validate = ajv.compile(schema);
    const isValid = validate(response.body);

    expect(isValid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});

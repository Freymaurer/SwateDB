import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index';
import { createMockModApiService } from './mod-api-contract-data';

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

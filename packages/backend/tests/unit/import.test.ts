import type { Driver } from 'neo4j-driver';
import { describe, expect, it, vi } from 'vitest';
import type { Ontology } from '@swatedb/ontology-lib';
import {
  DEFAULT_IMPORT_CHUNK_SIZE,
  importOntology,
  normalizeChunkSize,
} from '../../src/db/import';

function createOntology(): Ontology {
  return {
    name: 'test-ontology',
    version: '1.0.0',
    metadata: {
      title: 'Test Ontology',
      description: 'description',
      license: 'MIT',
      creator: 'test',
      versionIRI: 'https://example.org/test',
    },
    terms: [
      {
        accession: 'TEST:0001',
        name: 'Term One',
        definition: 'Definition one',
        isObsolete: false,
        synonyms: [],
        relationships: [
          {
            type: 'has_part',
            targetAccession: 'TEST:0002',
          },
        ],
      },
      {
        accession: 'TEST:0002',
        name: 'Term Two',
        definition: 'Definition two',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
    ],
  };
}

describe('normalizeChunkSize', () => {
  it('returns default chunk size when undefined', () => {
    expect(normalizeChunkSize(undefined)).toBe(DEFAULT_IMPORT_CHUNK_SIZE);
  });

  it('rejects invalid values', () => {
    expect(() => normalizeChunkSize(0)).toThrow(/positive integer/);
    expect(() => normalizeChunkSize(-1)).toThrow(/positive integer/);
    expect(() => normalizeChunkSize(1.5)).toThrow(/positive integer/);
  });
});

describe('importOntology', () => {
  it('executes import transaction and returns summary', async () => {
    const run = vi.fn(async () => ({}));
    const executeWrite = vi.fn(async (callback: (tx: { run: typeof run }) => Promise<unknown>) =>
      callback({ run }),
    );
    const close = vi.fn(async () => undefined);
    const session = {
      executeWrite,
      close,
    };
    const driver = {
      session: vi.fn(() => session),
    } as unknown as Driver;

    const summary = await importOntology(driver, createOntology(), { chunkSize: 1 });

    expect(summary).toEqual({
      ontologyName: 'test-ontology',
      termsProcessed: 2,
      relationshipsProcessed: 1,
    });
    expect(executeWrite).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails when relationship type is blank', async () => {
    const ontology = createOntology();
    ontology.terms[0].relationships[0].type = '   ';

    const run = vi.fn(async () => ({}));
    const executeWrite = vi.fn(async (callback: (tx: { run: typeof run }) => Promise<unknown>) =>
      callback({ run }),
    );
    const close = vi.fn(async () => undefined);
    const session = {
      executeWrite,
      close,
    };
    const driver = {
      session: vi.fn(() => session),
    } as unknown as Driver;

    await expect(importOntology(driver, ontology, { chunkSize: 1 })).rejects.toThrow(
      /transaction failed/i,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

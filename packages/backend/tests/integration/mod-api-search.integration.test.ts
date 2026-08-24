import neo4j, { type Driver } from 'neo4j-driver';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ontology } from '@swatedb/ontology-lib';
import { importOntology } from '../../src/db/import';
import { ensureSchema } from '../../src/db/schema';
import { createModApiService } from '../../src/routes/mod-api/service';
import { canRunContainerizedIntegration } from './helpers';

const integrationEnabled = canRunContainerizedIntegration();
const integration = integrationEnabled ? describe : describe.skip;

integration('MOD API search integration', () => {
  let container: StartedTestContainer;
  let driver: Driver;

  beforeAll(async () => {
    container = await new GenericContainer('neo4j:5.21')
      .withEnvironment({ NEO4J_AUTH: 'neo4j/test-password' })
      .withExposedPorts(7687)
      .start();

    const uri = `bolt://${container.getHost()}:${container.getMappedPort(7687)}`;
    driver = neo4j.driver(uri, neo4j.auth.basic('neo4j', 'test-password'));
    await driver.verifyConnectivity();
    await ensureSchema(driver);
    await importOntology(driver, makeOntology(), { chunkSize: 2 });
  }, 120_000);

  afterAll(async () => {
    await driver.close();
    await container.stop();
  });

  it('reports the true number of content search hits and orders by relevance score', async () => {
    const service = createModApiService(driver);

    const result = await service.search('term', { page: 1, pageSize: 10 }, 'content');

    expect(result.members.length).toBe(2);
    expect(result.totalItems).toBe(2);
    expect(result.members[0].label).toBe('Term Term');
  });

  it('searches term names only, not definitions', async () => {
    const service = createModApiService(driver);

    const result = await service.search('definition', { page: 1, pageSize: 10 }, 'content');

    expect(result.members.length).toBe(0);
    expect(result.totalItems).toBe(0);
  });

  it('supports multi-word queries regardless of word order', async () => {
    const service = createModApiService(driver);

    const result = await service.search('beta alpha', { page: 1, pageSize: 10 }, 'content');

    expect(result.members.length).toBe(1);
    expect(result.totalItems).toBe(1);
    expect(result.members[0].label).toBe('Alpha Term Beta');
  });

  it('sums metadata and content hits for mode all', async () => {
    const service = createModApiService(driver);

    const result = await service.search('term', { page: 1, pageSize: 10 }, 'all');

    expect(result.members.length).toBe(3);
    expect(result.totalItems).toBe(3);
  });
});

function makeOntology(): Ontology {
  return {
    name: 'search-ontology',
    version: '1.0.0',
    metadata: {
      title: 'Term Repository',
      description: 'Ontology used for search integration tests',
      license: 'MIT',
      creator: 'test-suite',
      versionIRI: 'https://example.org/search',
    },
    terms: [
      {
        accession: 'SEARCH:0001',
        name: 'Term Term',
        definition: 'Definition alpha',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
      {
        accession: 'SEARCH:0002',
        name: 'Alpha Term Beta',
        definition: 'Definition beta',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
    ],
  };
}

import { spawnSync } from 'node:child_process';
import neo4j, { type Driver } from 'neo4j-driver';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ontology } from '@swatedb/ontology-lib';
import { importOntology } from '../../src/db/import';
import { ensureSchema } from '../../src/db/schema';

const integrationEnabled = canRunContainerizedIntegration();
const integration = integrationEnabled ? describe : describe.skip;

integration('Neo4j import integration', () => {
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
  }, 120_000);

  afterAll(async () => {
    await driver.close();
    await container.stop();
  });

  it('imports ontology idempotently without duplicate terms or relationships', async () => {
    const ontology = makeOntology('idempotent-ontology');

    await importOntology(driver, ontology, { chunkSize: 1 });
    await importOntology(driver, ontology, { chunkSize: 1 });

    const session = driver.session();
    try {
      const ontologyCountResult = await session.run(
        'MATCH (o:Ontology {name: $name}) RETURN count(o) AS count',
        { name: ontology.name },
      );
      const termCountResult = await session.run(
        'MATCH (t:Term) WHERE t.accession STARTS WITH $prefix RETURN count(t) AS count',
        { prefix: 'IDEMP:' },
      );
      const relationshipCountResult = await session.run(
        'MATCH (:Term {accession: $source})-[r:`has_part`]->(:Term {accession: $target}) RETURN count(r) AS count',
        {
          source: 'IDEMP:0001',
          target: 'IDEMP:0002',
        },
      );

      const ontologyCount = numberFromResult(ontologyCountResult.records[0].get('count'));
      const termCount = numberFromResult(termCountResult.records[0].get('count'));
      const relationshipCount = numberFromResult(relationshipCountResult.records[0].get('count'));

      expect(ontologyCount).toBe(1);
      expect(termCount).toBe(2);
      expect(relationshipCount).toBe(1);
    } finally {
      await session.close();
    }
  });

  it('rolls back transaction when import fails', async () => {
    const badOntology = makeOntology('rollback-ontology');
    badOntology.terms[0].relationships[0].type = '';

    await expect(importOntology(driver, badOntology, { chunkSize: 1 })).rejects.toThrow(
      /transaction failed/i,
    );

    const session = driver.session();
    try {
      const ontologyCountResult = await session.run(
        'MATCH (o:Ontology {name: $name}) RETURN count(o) AS count',
        { name: badOntology.name },
      );

      const ontologyCount = numberFromResult(ontologyCountResult.records[0].get('count'));
      expect(ontologyCount).toBe(0);
    } finally {
      await session.close();
    }
  });
});

function makeOntology(name: string): Ontology {
  return {
    name,
    version: '1.0.0',
    metadata: {
      title: 'Integration Ontology',
      description: 'Ontology used in backend integration tests',
      license: 'MIT',
      creator: 'test-suite',
      versionIRI: 'https://example.org/integration',
    },
    terms: [
      {
        accession: 'IDEMP:0001',
        name: 'Term One',
        definition: 'Definition one',
        isObsolete: false,
        synonyms: [],
        relationships: [
          {
            type: 'has_part',
            targetAccession: 'IDEMP:0002',
          },
        ],
      },
      {
        accession: 'IDEMP:0002',
        name: 'Term Two',
        definition: 'Definition two',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
    ],
  };
}

function canRunContainerizedIntegration(): boolean {
  const result = spawnSync('docker', ['info'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  return result.status === 0;
}

function numberFromResult(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value !== null && typeof value === 'object' && 'toNumber' in value) {
    const candidate = (value as { toNumber: () => number }).toNumber();
    return candidate;
  }

  throw new Error('Could not parse numeric result from Neo4j query.');
}

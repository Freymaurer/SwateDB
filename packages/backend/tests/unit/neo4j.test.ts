import type { Driver } from 'neo4j-driver';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkNeo4jHealth,
  closeNeo4jDriver,
  getNeo4jDriver,
  resetNeo4jDriverForTests,
  resolveNeo4jConfig,
  verifyNeo4jConnectivity,
} from '../../src/db/neo4j';

afterEach(async () => {
  await closeNeo4jDriver();
  resetNeo4jDriverForTests();
  vi.restoreAllMocks();
});

describe('resolveNeo4jConfig', () => {
  it('reads required Neo4j environment values', () => {
    const config = resolveNeo4jConfig({
      NEO4J_URI: 'bolt://localhost:7687',
      NEO4J_USER: 'neo4j',
      NEO4J_PASSWORD: 'password',
    });

    expect(config).toEqual({
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      password: 'password',
    });
  });

  it('throws when required values are missing', () => {
    expect(() =>
      resolveNeo4jConfig({
        NEO4J_URI: '',
        NEO4J_USER: 'neo4j',
        NEO4J_PASSWORD: 'password',
      }),
    ).toThrow(/NEO4J_URI/);
  });
});

describe('getNeo4jDriver and closeNeo4jDriver', () => {
  it('returns the same singleton driver instance', () => {
    const config = {
      uri: 'bolt://127.0.0.1:7687',
      user: 'neo4j',
      password: 'password',
    };

    const first = getNeo4jDriver(config);
    const second = getNeo4jDriver(config);

    expect(first).toBe(second);
  });
});

describe('verifyNeo4jConnectivity', () => {
  it('delegates to driver.verifyConnectivity', async () => {
    const verifyConnectivity = vi.fn(async () => undefined);
    const driver = {
      verifyConnectivity,
    } as unknown as Driver;

    await verifyNeo4jConnectivity(driver);

    expect(verifyConnectivity).toHaveBeenCalledTimes(1);
  });
});

describe('checkNeo4jHealth', () => {
  it('returns up when basic query succeeds', async () => {
    const run = vi.fn(async () => ({}));
    const close = vi.fn(async () => undefined);
    const session = {
      run,
      close,
    };
    const driver = {
      session: vi.fn(() => session),
    } as unknown as Driver;

    const status = await checkNeo4jHealth(driver);

    expect(status.status).toBe('up');
    expect(run).toHaveBeenCalledWith('RETURN 1 AS ok');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns down when query fails', async () => {
    const close = vi.fn(async () => undefined);
    const session = {
      run: vi.fn(async () => {
        throw new Error('Neo4j down');
      }),
      close,
    };
    const driver = {
      session: vi.fn(() => session),
    } as unknown as Driver;

    const status = await checkNeo4jHealth(driver);

    expect(status.status).toBe('down');
    expect(status.detail).toContain('Neo4j down');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

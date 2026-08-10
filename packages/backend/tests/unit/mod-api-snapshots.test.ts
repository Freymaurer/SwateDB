import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/index';
import { createMockModApiService } from './mod-api-contract-data';

describe('MOD API JSON-LD snapshot fixtures', () => {
  it('matches artefacts collection fixture', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app)
      .get('/artefacts?format=jsonld&page=1&pagesize=10')
      .set('Host', 'mod.test');

    expect(response.status).toBe(200);

    const expected = readJsonFixture('artefacts-collection.json');
    expect(response.body).toStrictEqual(expected);
  });

  it('matches search collection fixture', async () => {
    const app = createApp({
      modApiService: createMockModApiService(),
    });

    const response = await request(app)
      .get('/search?format=jsonld&q=demo&page=1&pagesize=10')
      .set('Host', 'mod.test');

    expect(response.status).toBe(200);

    const expected = readJsonFixture('search-collection.json');
    expect(response.body).toStrictEqual(expected);
  });
});

function readJsonFixture(fileName: string): unknown {
  const filePath = path.resolve(__dirname, '..', 'fixtures', 'mod-api', fileName);
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

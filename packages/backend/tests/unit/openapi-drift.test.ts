import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { modApiPathChecks } from './mod-api-contract-data';

describe('OpenAPI drift gate', () => {
  it('matches backend contract endpoint coverage with openapi.yaml paths', () => {
    const openApiSpec = loadOpenApiSpec();
    const openApiPaths = Object.keys(openApiSpec.paths ?? {}).sort();

    const contractPaths = [...new Set(modApiPathChecks.map((check) => canonicalizePath(check.path)))].sort();

    const missingFromContract = openApiPaths.filter((pathName) => !contractPaths.includes(pathName));
    const extraInContract = contractPaths.filter((pathName) => !openApiPaths.includes(pathName));

    expect(
      {
        missingFromContract,
        extraInContract,
      },
      `OpenAPI drift detected. Missing: ${missingFromContract.join(', ')} | Extra: ${extraInContract.join(', ')}`,
    ).toEqual({
      missingFromContract: [],
      extraInContract: [],
    });
  });
});

function canonicalizePath(pathName: string): string {
  if (pathName === '/records/demo-ontology') {
    return '/records/{artefactID}';
  }

  if (/^\/artefacts\/[^/]+\/distributions\/latest$/.test(pathName)) {
    return '/artefacts/{artefactID}/distributions/latest';
  }

  if (/^\/artefacts\/[^/]+\/distributions$/.test(pathName)) {
    return '/artefacts/{artefactID}/distributions';
  }

  if (/^\/artefacts\/[^/]+\/distributions\/[^/]+$/.test(pathName)) {
    return '/artefacts/{artefactID}/distributions/{distributionID}';
  }

  if (/^\/artefacts\/[^/]+\/record$/.test(pathName)) {
    return '/artefacts/{artefactID}/record';
  }

  if (/^\/artefacts\/[^/]+\/resources\/classes$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/classes';
  }

  if (/^\/artefacts\/[^/]+\/resources\/concepts$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/concepts';
  }

  if (/^\/artefacts\/[^/]+\/resources\/properties$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/properties';
  }

  if (/^\/artefacts\/[^/]+\/resources\/individuals$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/individuals';
  }

  if (/^\/artefacts\/[^/]+\/resources\/schemes$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/schemes';
  }

  if (/^\/artefacts\/[^/]+\/resources\/collections$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/collections';
  }

  if (/^\/artefacts\/[^/]+\/resources\/labels$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/labels';
  }

  if (/^\/artefacts\/[^/]+\/resources\/[^/]+$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources/{resourceID}';
  }

  if (/^\/artefacts\/[^/]+\/resources$/.test(pathName)) {
    return '/artefacts/{artefactID}/resources';
  }

  if (/^\/artefacts\/[^/]+$/.test(pathName)) {
    return '/artefacts/{artefactID}';
  }

  return pathName;
}

function loadOpenApiSpec(): { paths?: Record<string, unknown> } {
  const candidates = [
    path.resolve(process.cwd(), 'openapi.yaml'),
    path.resolve(process.cwd(), '..', 'openapi.yaml'),
    path.resolve(process.cwd(), '..', '..', 'openapi.yaml'),
    path.resolve(__dirname, '..', '..', '..', '..', 'openapi.yaml'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    const raw = readFileSync(candidate, 'utf8');
    const parsed = parseYaml(raw);

    if (parsed !== null && typeof parsed === 'object') {
      return parsed as { paths?: Record<string, unknown> };
    }
  }

  throw new Error('Failed to locate openapi.yaml for drift check.');
}

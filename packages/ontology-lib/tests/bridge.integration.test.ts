import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../src/parser';

const configuredJarPath = process.env.JAVA_BRIDGE_JAR_PATH;
const javaAvailable =
  spawnSync('java', ['-version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  }).status === 0;
const canRunIntegration =
  configuredJarPath !== undefined &&
  configuredJarPath.trim().length > 0 &&
  existsSync(configuredJarPath) &&
  javaAvailable;

const integrationIt = canRunIntegration ? it : it.skip;

describe('java bridge integration', () => {
  integrationIt('parses small OBO fixture with real parser JAR', async () => {
    const fixturePath = path.resolve(process.cwd(), '..', '..', 'test-fixtures', 'small.obo');
    const ontology = await parseFile(fixturePath, {
      jarPath: configuredJarPath,
    });

    expect(ontology.terms.length).toBeGreaterThan(0);
    expect(ontology.terms.some((term) => term.accession === 'TEST:0001')).toBe(true);
  });
});

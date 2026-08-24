import { spawnSync } from 'node:child_process';

export function canRunContainerizedIntegration(): boolean {
  const result = spawnSync('docker', ['info'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });

  return result.status === 0;
}

export function numberFromResult(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value !== null && typeof value === 'object' && 'toNumber' in value) {
    const candidate = (value as { toNumber: () => number }).toNumber();
    return candidate;
  }

  throw new Error('Could not parse numeric result from Neo4j query.');
}

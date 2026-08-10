#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) {
    return { ok: false, code: 1 };
  }

  return { ok: result.status === 0, code: result.status ?? 1 };
}

function commandExists(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function main() {
  const mavenArgs = process.argv.slice(2);
  if (mavenArgs.length === 0) {
    console.error('Usage: node scripts/maven-runner.js <maven-args>');
    process.exit(1);
  }

  if (commandExists('mvn', ['-v'])) {
    const local = run('mvn', mavenArgs);
    process.exit(local.code);
  }

  if (!commandExists('docker', ['--version'])) {
    console.error('Neither Maven nor Docker are available. Install Maven or start Docker.');
    process.exit(1);
  }

  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
  const volumeMount = `${workspaceRoot}:/workspace`;
  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    volumeMount,
    '-w',
    '/workspace/packages/java-parser',
    'maven:3.9.9-eclipse-temurin-17',
    'mvn',
    ...mavenArgs,
  ];

  const docker = run('docker', dockerArgs);
  process.exit(docker.code);
}

main();

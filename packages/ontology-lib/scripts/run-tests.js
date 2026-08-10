#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const shell = process.platform === 'win32';
const packageDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const javaParserDir = path.resolve(__dirname, '..', '..', 'java-parser');
const javaParserTargetDir = path.join(javaParserDir, 'target');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell,
    ...options,
  });
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    shell,
  });
  return result.status === 0;
}

function resolveExistingJarPath() {
  const configured = process.env.JAVA_BRIDGE_JAR_PATH;
  if (configured && configured.trim().length > 0) {
    const absolute = path.resolve(configured);
    if (fs.existsSync(absolute) && absolute.toLowerCase().endsWith('.jar')) {
      return absolute;
    }

    console.warn(
      `[ontology-lib:test] JAVA_BRIDGE_JAR_PATH is set but invalid: ${absolute}. Attempting auto-detection.`,
    );
  }

  if (!fs.existsSync(javaParserTargetDir)) {
    return null;
  }

  const jars = fs
    .readdirSync(javaParserTargetDir)
    .filter((entry) => entry.toLowerCase().endsWith('-all.jar'))
    .map((entry) => path.join(javaParserTargetDir, entry))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return jars[0] ?? null;
}

function ensureParserJarForIntegration() {
  const javaAvailable = commandAvailable('java', ['-version']);
  if (!javaAvailable) {
    console.log('[ontology-lib:test] Java runtime not found. Integration test will be skipped.');
    return;
  }

  let jarPath = resolveExistingJarPath();
  if (jarPath === null) {
    console.log('[ontology-lib:test] Parser JAR not found. Building @swatedb/java-parser...');
    const build = run('npm', ['run', 'build', '--workspace=@swatedb/java-parser'], {
      cwd: workspaceRoot,
    });

    if (build.status !== 0) {
      console.warn(
        '[ontology-lib:test] Could not build java-parser automatically. Integration test may be skipped.',
      );
      return;
    }

    jarPath = resolveExistingJarPath();
  }

  if (jarPath === null) {
    console.warn('[ontology-lib:test] No parser JAR found after build. Integration test may be skipped.');
    return;
  }

  process.env.JAVA_BRIDGE_JAR_PATH = jarPath;
  console.log(`[ontology-lib:test] Using parser JAR: ${jarPath}`);
}

function main() {
  ensureParserJarForIntegration();

  const passthroughArgs = process.argv.slice(2);
  const vitestArgs = ['exec', '--', 'vitest', 'run', ...passthroughArgs];
  const result = run('npm', vitestArgs, { cwd: packageDir, env: process.env });

  process.exit(result.status ?? 1);
}

main();

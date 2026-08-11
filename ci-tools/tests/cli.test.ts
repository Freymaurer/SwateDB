import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const cliPath = path.resolve(__dirname, '..', 'dist', 'cli.js');
const fixturesDir = path.resolve(__dirname, '..', '..', 'test-fixtures');

function runCli(
  args: string[],
  options?: { cwd?: string },
): { stdout: string; stderr: string; status: number | null; error?: Error } {
  try {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
      cwd: options?.cwd,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, status: result.status };
  } catch (err) {
    return {
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      status: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `swatedb-ci-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('swatedb-ci help', () => {
  it('prints help when no arguments are given', () => {
    const { stdout, status } = runCli([]);
    expect(status).toBe(2);
    expect(stdout).toContain('swatedb-ci');
    expect(stdout).toContain('Usage:');
  });

  it('prints help for unknown command', () => {
    const { stderr, status } = runCli(['unknown-cmd']);
    expect(status).toBe(2);
    expect(stderr).toContain('Unknown command');
  });
});

describe('swatedb-ci validate', () => {
  it('exits 0 for a valid ontology file (warnings are OK)', () => {
    const validFile = path.join(fixturesDir, 'small.obo');
    const { stdout, status } = runCli(['validate', validFile]);
    expect(status).toBe(0);
    expect(stdout).toContain('OK');
    expect(stdout).toContain('0 error(s)');
    expect(stdout).toContain('1 warning(s)');
  });

  it('exits 2 for a malformed ontology file', () => {
    const malformedFile = path.join(fixturesDir, 'malformed.obo');
    const { stderr, status } = runCli(['validate', malformedFile]);
    expect(status).toBe(2);
    expect(stderr).toContain('Parse errors');
  });

  it('exits 2 for a non-existent file', () => {
    const { status } = runCli(['validate', '/nonexistent/path/file.obo']);
    expect(status).toBe(2);
  });

  it('outputs valid JSON with --json flag', () => {
    const validFile = path.join(fixturesDir, 'small.obo');
    const { stdout, status } = runCli(['validate', validFile, '--json']);
    expect(status).toBe(0);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.exitCode).toBe(0);
    expect(parsed.command).toBe('validate');
    expect(parsed.stats).toBeDefined();
    expect(parsed.results).toBeDefined();
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.parseErrors).toBeDefined();
    expect(Array.isArray(parsed.parseErrors)).toBe(true);
  });

  it('outputs JSON with status=error for parse failure', () => {
    const malformedFile = path.join(fixturesDir, 'malformed.obo');
    const { stdout, status } = runCli(['validate', malformedFile, '--json']);
    expect(status).toBe(2);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    expect(parsed.exitCode).toBe(2);
    expect(Array.isArray(parsed.parseErrors)).toBe(true);
    expect(parsed.parseErrors).toHaveLength(1);
  });

  it('shows usage when no file argument provided', () => {
    const { stderr, status } = runCli(['validate']);
    expect(status).toBe(2);
    expect(stderr).toContain('Usage:');
  });
});

describe('swatedb-ci validate-all', () => {
  it('shows usage when --config is missing', () => {
    const { stderr, status } = runCli(['validate-all']);
    expect(status).toBe(2);
    expect(stderr).toContain('Usage:');
  });

  it('exits 2 for non-existent config file', () => {
    const { stdout, status } = runCli(['validate-all', '--config', '/nonexistent/config.yml', '--json']);
    expect(status).toBe(2);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('validates all matching files from a config', () => {
    const testDir = createTempDir();

    fs.writeFileSync(
      path.join(testDir, '.swatedb.yml'),
      [
        'import:',
        '  include:',
        '    - "**/*.obo"',
        '    - "**/*.owl"',
        '  exclude: []',
        'externals: []',
      ].join('\n'),
    );

    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'small.obo'));
    fs.cpSync(path.join(fixturesDir, 'small.owl'), path.join(testDir, 'small.owl'));

    const { stdout, status } = runCli(['validate-all', '--config', path.join(testDir, '.swatedb.yml')]);
    expect(status).toBe(0);
    expect(stdout).toContain('OK');
    expect(stdout).toContain('2 file(s) checked');
    expect(stdout).toContain('0 error(s)');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('reports parse errors for unparseable files', () => {
    const testDir = createTempDir();

    fs.writeFileSync(
      path.join(testDir, '.swatedb.yml'),
      [
        'import:',
        '  include:',
        '    - "**/*.obo"',
        '  exclude: []',
        'externals: []',
      ].join('\n'),
    );

    // Copy a valid file
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'small.obo'));
    // Create a binary file disguised as .obo that the parser will reject
    fs.writeFileSync(path.join(testDir, 'bad.obo'), Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const { stderr, status } = runCli([
      'validate-all',
      '--config',
      path.join(testDir, '.swatedb.yml'),
    ]);
    expect(status).toBe(2);
    expect(stderr).toContain('Parse errors');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('honours exclude patterns in config', () => {
    const testDir = createTempDir();
    const nestedDir = path.join(testDir, 'internal');
    fs.mkdirSync(nestedDir, { recursive: true });

    fs.writeFileSync(
      path.join(testDir, '.swatedb.yml'),
      [
        'import:',
        '  include:',
        '    - "**/*.obo"',
        '  exclude:',
        '    - "internal/**"',
        'externals: []',
      ].join('\n'),
    );

    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'small.obo'));
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(nestedDir, 'nested.obo'));

    const { stdout, status } = runCli(['validate-all', '--config', path.join(testDir, '.swatedb.yml')]);
    expect(status).toBe(0);
    expect(stdout).toContain('1 file(s) checked');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('outputs valid JSON with --json flag', () => {
    const testDir = createTempDir();

    fs.writeFileSync(
      path.join(testDir, '.swatedb.yml'),
      [
        'import:',
        '  include:',
        '    - "**/*.obo"',
        '  exclude: []',
        'externals: []',
      ].join('\n'),
    );

    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'small.obo'));

    const { stdout, status } = runCli([
      'validate-all',
      '--config',
      path.join(testDir, '.swatedb.yml'),
      '--json',
    ]);
    expect(status).toBe(0);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.command).toBe('validate-all');
    expect(parsed.stats.filesChecked).toBe(1);
    expect(Array.isArray(parsed.results)).toBe(true);

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

describe('swatedb-ci check-duplicates', () => {
  it('shows usage when no directory argument provided', () => {
    const { stderr, status } = runCli(['check-duplicates']);
    expect(status).toBe(2);
    expect(stderr).toContain('Usage:');
  });

  it('finds no duplicates in a directory with distinct files', () => {
    const testDir = createTempDir();
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'unique.obo'));
    // dpbo.obo has different accessions (DPBO:xxx) so no cross-file duplicates
    fs.cpSync(path.join(fixturesDir, 'dpbo.obo'), path.join(testDir, 'dpbo.obo'));

    const { stdout, status } = runCli(['check-duplicates', testDir]);
    expect(status).toBe(0);
    expect(stdout).toContain('no issues found');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('detects duplicate accessions across files', () => {
    const testDir = createTempDir();
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'small.obo'));
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'copy.obo'));

    const { stdout, status } = runCli(['check-duplicates', testDir]);
    expect(status).toBe(1);
    expect(stdout).toContain('duplicate_accession');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('outputs valid JSON with --json flag', () => {
    const testDir = createTempDir();
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'unique.obo'));

    const { stdout, status } = runCli(['check-duplicates', testDir, '--json']);
    expect(status).toBe(0);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.command).toBe('check-duplicates');
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results).toHaveLength(0);

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

describe('swatedb-ci setup-templates', () => {
  it('creates .github directory with templates', () => {
    const testDir = createTempDir();

    const { stdout, status } = runCli(['setup-templates', '--dir', testDir]);
    expect(status).toBe(0);
    expect(stdout).toContain('Templates set up successfully');

    expect(fs.existsSync(path.join(testDir, '.github', 'workflows', 'ontology-ci-template.yml'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(testDir, '.github', 'ISSUE_TEMPLATE', 'new-term-request.yml'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(testDir, '.github', 'ISSUE_TEMPLATE', 'bug-report.yml'))).toBe(true);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('skips existing files without overwriting', () => {
    const testDir = createTempDir();

    runCli(['setup-templates', '--dir', testDir]);

    const result = runCli(['setup-templates', '--dir', testDir]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping');

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

describe('exit code matrix', () => {
  it('exit 0: valid file yields zero errors', () => {
    const { status } = runCli(['validate', path.join(fixturesDir, 'small.obo')]);
    expect(status).toBe(0);
  });

  it('exit 1: duplicate accessions found', () => {
    const testDir = createTempDir();
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'a.obo'));
    fs.cpSync(path.join(fixturesDir, 'small.obo'), path.join(testDir, 'b.obo'));

    const { status } = runCli(['check-duplicates', testDir]);
    expect(status).toBe(1);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('exit 2: malformed file causes parse error', () => {
    const { status } = runCli(['validate', path.join(fixturesDir, 'malformed.obo')]);
    expect(status).toBe(2);
  });
});

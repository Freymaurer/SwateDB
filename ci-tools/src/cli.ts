#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import {
  parseConfig,
  parseFile,
  matchesImportPatterns,
  validateOntology,
  type ValidationResult,
} from '@swatedb/ontology-lib';

interface CliStats {
  filesChecked: number;
  errors: number;
  warnings: number;
}

interface CliOutput {
  status: 'ok' | 'failed' | 'error';
  exitCode: number;
  command: string;
  results: ValidationResult[];
  parseErrors: string[];
  stats: CliStats;
}

function printHelp(): void {
  console.log(
    [
      'swatedb-ci — ontology repository CI validation CLI',
      '',
      'Usage:',
      '  swatedb-ci validate <file>                    Validate a single ontology file',
      '  swatedb-ci validate-all --config <path>        Validate all files per .swatedb.yml config',
      '  swatedb-ci check-duplicates <dir>              Check for duplicate accessions across files',
      '  swatedb-ci setup-templates [--dir <path>]      Copy CI templates into target repo',
      '',
      'Options:',
      '  --json    Output results as JSON (machine-readable)',
      '',
      'Exit codes:',
      '  0   Success (no validation issues)',
      '  1   Validation errors found',
      '  2   Parse or runtime error',
    ].join('\n'),
  );
}

function emptyStats(): CliStats {
  return { filesChecked: 0, errors: 0, warnings: 0 };
}

async function runValidate(filePath: string): Promise<CliOutput> {
  const result: CliOutput = {
    status: 'ok',
    exitCode: 0,
    command: 'validate',
    results: [],
    parseErrors: [],
    stats: { filesChecked: 1, errors: 0, warnings: 0 },
  };

  try {
    const ontology = await parseFile(filePath);
    const issues = validateOntology(ontology);
    result.results = issues;

    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    result.stats.errors = errors.length;
    result.stats.warnings = warnings.length;

    if (errors.length > 0) {
      result.status = 'failed';
      result.exitCode = 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.parseErrors.push(message);
    result.status = 'error';
    result.exitCode = 2;
  }

  return result;
}

async function runValidateAll(configPath: string): Promise<CliOutput> {
  const result: CliOutput = {
    status: 'ok',
    exitCode: 0,
    command: 'validate-all',
    results: [],
    parseErrors: [],
    stats: emptyStats(),
  };

  let configText: string;
  try {
    configText = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.parseErrors.push(`Failed to read config: ${message}`);
    result.status = 'error';
    result.exitCode = 2;
    return result;
  }

  let config;
  try {
    config = parseConfig(configText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.parseErrors.push(`Invalid config: ${message}`);
    result.status = 'error';
    result.exitCode = 2;
    return result;
  }

  const configDir = path.dirname(path.resolve(configPath));
  const allFiles = await glob('**/*.{obo,owl}', { cwd: configDir, nodir: true, absolute: false });

  for (const file of allFiles) {
    if (!matchesImportPatterns(file, config)) {
      continue;
    }

    result.stats.filesChecked++;
    const filePath = path.join(configDir, file);

    try {
      const ontology = await parseFile(filePath);
      const issues = validateOntology(ontology);

      for (const issue of issues) {
        result.results.push({
          ...issue,
          path: `${file}${issue.path}`,
        });
      }

      const errors = issues.filter((issue) => issue.severity === 'error');
      const warnings = issues.filter((issue) => issue.severity === 'warning');
      result.stats.errors += errors.length;
      result.stats.warnings += warnings.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.parseErrors.push(`${file}: ${message}`);
    }
  }

  if (result.parseErrors.length > 0 && result.stats.filesChecked === 0) {
    result.status = 'error';
    result.exitCode = 2;
  } else if (result.stats.errors > 0) {
    result.status = 'failed';
    result.exitCode = 1;
  } else if (result.parseErrors.length > 0) {
    result.status = 'error';
    result.exitCode = 2;
  }

  return result;
}

async function runCheckDuplicates(dir: string): Promise<CliOutput> {
  const result: CliOutput = {
    status: 'ok',
    exitCode: 0,
    command: 'check-duplicates',
    results: [],
    parseErrors: [],
    stats: emptyStats(),
  };

  const absDir = path.resolve(dir);
  const files = await glob('**/*.{obo,owl}', { cwd: absDir, nodir: true, absolute: false });

  const accessionMap = new Map<string, string[]>();

  for (const file of files) {
    result.stats.filesChecked++;
    const filePath = path.join(absDir, file);

    try {
      const ontology = await parseFile(filePath);
      for (const term of ontology.terms) {
        const accession = term.accession.trim();
        if (accession.length === 0) {
          continue;
        }

        const sources = accessionMap.get(accession);
        if (sources === undefined) {
          accessionMap.set(accession, [file]);
        } else {
          sources.push(file);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.parseErrors.push(`${file}: ${message}`);
    }
  }

  for (const [accession, sources] of accessionMap.entries()) {
    if (sources.length > 1) {
      result.results.push({
        code: 'duplicate_accession',
        message: `Duplicate accession "${accession}" in files: ${sources.join(', ')}`,
        path: '/',
        severity: 'error',
      });
      result.stats.errors++;
    }
  }

  if (result.parseErrors.length > 0 && result.stats.filesChecked === 0) {
    result.status = 'error';
    result.exitCode = 2;
  } else if (result.stats.errors > 0) {
    result.status = 'failed';
    result.exitCode = 1;
  } else if (result.parseErrors.length > 0) {
    result.status = 'error';
    result.exitCode = 2;
  }

  return result;
}

function runSetupTemplates(targetDir: string): void {
  const templatesDir = path.resolve(__dirname, '..', 'templates');
  const githubDir = path.resolve(targetDir, '.github');
  const workflowsDir = path.join(githubDir, 'workflows');
  const issueTemplateDir = path.join(githubDir, 'ISSUE_TEMPLATE');

  if (!fs.existsSync(templatesDir)) {
    console.error(`Templates directory not found: ${templatesDir}`);
    process.exit(2);
  }

  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.mkdirSync(issueTemplateDir, { recursive: true });

  const templateFiles = fs.readdirSync(templatesDir);

  for (const file of templateFiles) {
    const src = path.join(templatesDir, file);
    if (!fs.statSync(src).isFile()) {
      continue;
    }

    let destDir: string;
    if (file === 'ontology-ci-template.yml') {
      destDir = workflowsDir;
    } else if (file.endsWith('.yml')) {
      destDir = issueTemplateDir;
    } else {
      continue;
    }

    const dest = path.join(destDir, file);

    if (fs.existsSync(dest)) {
      console.log(`Skipping ${file}: already exists at ${path.relative(targetDir, dest)}`);
      continue;
    }

    fs.copyFileSync(src, dest);
    console.log(`Created ${path.relative(targetDir, dest)}`);
  }

  console.log('Templates set up successfully.');
}

function writeOutput(output: CliOutput, jsonFlag: boolean): void {
  if (jsonFlag) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (output.parseErrors.length > 0) {
    process.stderr.write('Parse errors:\n');
    for (const errMsg of output.parseErrors) {
      process.stderr.write(`  ${errMsg}\n`);
    }
    process.stderr.write('\n');
  }

  for (const issue of output.results) {
    const prefix = issue.severity === 'error' ? 'ERROR' : 'WARNING';
    console.log(`[${prefix}] ${issue.code}: ${issue.message} (${issue.path})`);
  }

  if (output.status === 'ok' && output.stats.warnings === 0 && output.results.length === 0) {
    console.log(`OK: ${output.stats.filesChecked} file(s) checked, no issues found.`);
  } else {
    const prefix = output.status === 'ok' ? 'OK: ' : '';
    console.log(
      `${prefix}${output.stats.filesChecked} file(s) checked, ${output.stats.errors} error(s), ${output.stats.warnings} warning(s).`,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json');
  const filtered = args.filter((arg) => arg !== '--json');

  if (filtered.length === 0) {
    printHelp();
    process.exit(2);
  }

  const command = filtered[0];

  try {
    switch (command) {
      case 'validate': {
        if (filtered.length < 2) {
          process.stderr.write('Usage: swatedb-ci validate <file> [--json]\n');
          process.exit(2);
        }
        const filePath = filtered[1]!;
        const result = await runValidate(filePath);
        writeOutput(result, jsonFlag);
        process.exit(result.exitCode);
        break;
      }
      case 'validate-all': {
        const configIdx = filtered.indexOf('--config');
        if (configIdx === -1 || configIdx + 1 >= filtered.length) {
          process.stderr.write('Usage: swatedb-ci validate-all --config <path> [--json]\n');
          process.exit(2);
        }
        const configPath = filtered[configIdx + 1]!;
        const result = await runValidateAll(configPath);
        writeOutput(result, jsonFlag);
        process.exit(result.exitCode);
        break;
      }
      case 'check-duplicates': {
        if (filtered.length < 2) {
          process.stderr.write('Usage: swatedb-ci check-duplicates <dir> [--json]\n');
          process.exit(2);
        }
        const dir = filtered[1]!;
        const result = await runCheckDuplicates(dir);
        writeOutput(result, jsonFlag);
        process.exit(result.exitCode);
        break;
      }
      case 'setup-templates': {
        const dirIdx = filtered.indexOf('--dir');
        const targetDir: string =
          dirIdx !== -1 && dirIdx + 1 < filtered.length ? filtered[dirIdx + 1]! : process.cwd();
        runSetupTemplates(targetDir);
        process.exit(0);
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        printHelp();
        process.exit(2);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Runtime error: ${message}\n`);

    if (jsonFlag) {
      process.stdout.write(
        `${JSON.stringify({ status: 'error', exitCode: 2, command, message }, null, 2)}\n`,
      );
    }

    process.exit(2);
  }
}

void main();

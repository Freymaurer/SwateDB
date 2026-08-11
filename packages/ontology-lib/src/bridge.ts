import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ZodError } from 'zod';
import { ontologySchema, type Ontology } from './model';

const DEFAULT_JAVA_OPTS = ['-Xms128m', '-Xmx2g'];
const PARSE_TIMEOUT_MS = 600_000;

export class ParserError extends Error {
  public readonly details?: unknown;
  public readonly fullMessage?: string;

  public constructor(message: string, details?: unknown, fullMessage?: string) {
    super(message);
    this.name = 'ParserError';
    this.details = details;
    this.fullMessage = fullMessage;
  }
}

let configuredJarPath: string | null = null;

export function initJvm(jarPath: string): void {
  configuredJarPath = normalizeJarPath(jarPath);
}

export function ensureJvm(): void {
  resolveJarPath();
  checkJavaAvailable();
}

export function diagnoseJvm(): string {
  const lines: string[] = [];
  lines.push('=== JVM Diagnostics ===');
  lines.push(`platform: ${process.platform} ${process.arch}`);

  const jarPath = process.env.JAVA_BRIDGE_JAR_PATH ?? '<not set>';
  lines.push(`JAVA_BRIDGE_JAR_PATH: ${jarPath}`);

  try {
    const version = execFileSync('java', ['-version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    lines.push(`java -version stdout: ${version.trim()}`);
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    lines.push(`java -version output: ${String(stderr).trim()}`);
  }

  if (jarPath !== '<not set>') {
    lines.push(`JAR exists: ${existsSync(jarPath)}`);
  }

  lines.push('========================');
  return lines.join('\n');
}

export async function parseOntologyFile(filePath: string): Promise<Ontology> {
  if (filePath.trim().length === 0) {
    throw new ParserError('Ontology file path is required.');
  }

  const jarPath = resolveJarPath();
  const resolvedPath = path.resolve(filePath);

  try {
    const javaJson = execFileSync('java', [...DEFAULT_JAVA_OPTS, '-jar', jarPath, resolvedPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: PARSE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    const payload = JSON.parse(javaJson) as unknown;
    return ontologySchema.parse(payload);
  } catch (error) {
    if (error instanceof ParserError) {
      throw error;
    }

    if (error instanceof ZodError) {
      throw new ParserError('Java parser output failed schema validation.', error.issues);
    }

    const message = error instanceof Error ? error.message : String(error);
    const stderr = hasStderr(error) ? String(error.stderr).trim() : '';

    if (stderr.length > 0) {
      process.stderr.write(`[bridge] Full Java stderr (${stderr.length} chars):\n${stderr}\n`);
    }

    try {
      const stat = statSync(resolvedPath);
      const previewBytes = Math.min(stat.size, 2048);
      const preview = readFileSync(resolvedPath, { encoding: 'utf8' }).slice(0, previewBytes);
      process.stderr.write(
        `[bridge] File ${resolvedPath}: ${stat.size} bytes. First ${previewBytes} bytes:\n${preview}\n`,
      );
    } catch {
      process.stderr.write(`[bridge] Could not read file ${resolvedPath} for diagnostics\n`);
    }

     const summary = extractJavaError(stderr);
    const friendlySummary = (() => {
      if (isTimeoutError(error)) {
        return `Java parser timed out for ${path.basename(resolvedPath)} (${PARSE_TIMEOUT_MS / 1000}s)`;
      }
      if (isKilledError(error)) {
        return `Java parser process was killed for ${path.basename(resolvedPath)} (signal: ${getSignal(error)})`;
      }
      if (summary !== null) {
        return `Parsing error in ${path.basename(resolvedPath)}: ${summary}`;
      }
      if (stderr.length > 0) {
        return `Java parser failed for ${path.basename(resolvedPath)}: ${stderr.slice(0, 500)}`;
      }
      return `Java parser failed for ${path.basename(resolvedPath)} (exit code: ${getExitCode(error)}, no stderr output)`;
    })();

    const fullError = stderr || message;

    throw new ParserError(friendlySummary, error, fullError);
  }
}

function checkJavaAvailable(): void {
  try {
    execFileSync('java', ['-version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ParserError(`Java runtime is not available: ${message}`, error);
  }
}

function resolveJarPath(): string {
  if (configuredJarPath !== null) {
    return configuredJarPath;
  }

  const envJarPath = process.env.JAVA_BRIDGE_JAR_PATH;
  if (envJarPath !== undefined && envJarPath.trim().length > 0) {
    configuredJarPath = normalizeJarPath(envJarPath);
    return configuredJarPath;
  }

  const discovered = discoverJar();
  if (discovered !== null) {
    configuredJarPath = discovered;
    return configuredJarPath;
  }

  throw new ParserError(
    'Could not locate the Java parser JAR. Set JAVA_BRIDGE_JAR_PATH or build the java-parser package.',
  );
}

function discoverJar(): string | null {
  const pattern = /^java-parser-.+-all\.jar$/;
  const searchDirs = [
    path.resolve('packages', 'java-parser', 'target'),
    path.resolve(__dirname, '..', '..', 'java-parser', 'target'),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) {
      continue;
    }

    try {
      const entries = readdirSync(dir);
      const jar = entries.find((entry) => pattern.test(entry));
      if (jar !== undefined) {
        return path.join(dir, jar);
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeJarPath(jarPath: string): string {
  const normalizedPath = path.resolve(jarPath);
  if (!existsSync(normalizedPath)) {
    throw new ParserError(`Java parser JAR not found at path: ${normalizedPath}`);
  }

  if (path.extname(normalizedPath).toLowerCase() !== '.jar') {
    throw new ParserError(`Invalid parser artifact, expected .jar file: ${normalizedPath}`);
  }

  return normalizedPath;
}

function hasStderr(error: unknown): error is { stderr: unknown } {
  return typeof error === 'object' && error !== null && 'stderr' in error;
}

function getExitCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return String((error as { status: unknown }).status);
  }
  return 'unknown';
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { killed?: boolean }).killed === true
    && (error as { signal?: string }).signal === 'SIGTERM';
}

function isKilledError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { killed?: boolean }).killed === true;
}

function getSignal(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'signal' in error) {
    return String((error as { signal: unknown }).signal);
  }
  return 'unknown';
}

function extractJavaError(stderr: string): string | null {
  const lines = stderr.split('\n');
  let foundLineNo: string | null = null;
  let foundLine: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? '';
    if (trimmed.length === 0 || trimmed.startsWith('SLF4J') || trimmed.startsWith('http')) {
      continue;
    }
    if (foundLineNo === null && trimmed.startsWith('LINENO:')) {
      foundLineNo = trimmed;
      const nextLine = index + 1 < lines.length ? lines[index + 1] : undefined;
      const nextTrimmed = nextLine?.trim() ?? '';
      if (nextTrimmed.startsWith('LINE:')) {
        foundLine = nextTrimmed;
      }
      break;
    }
  }

  if (foundLineNo !== null) {
    return foundLine !== null ? `${foundLineNo}\n${foundLine}` : foundLineNo;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('at ') || trimmed.startsWith('SLF4J')
      || trimmed.startsWith('... ') || trimmed.startsWith('\t...')) {
      continue;
    }
    const cleaned = trimmed.replace(/^Exception in thread ".*?" /, '').replace(/^Caused by: /, '');
    if (/^[\w.]+(Error|Exception)/.test(cleaned) && !cleaned.includes('UnsupportedRDFormatException')
      && !cleaned.includes('UnparsableOntologyException') && !cleaned.includes('SAXParseException')
      && !cleaned.includes('ParseException: Encountered') && !cleaned.includes('parse.GenerateParseException')) {
      return cleaned;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Caused by:') || /^[\w.]+Exception/.test(trimmed)) {
      return trimmed.replace(/^Caused by: /, '');
    }
  }

  return null;
}

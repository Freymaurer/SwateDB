import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { appendClasspath, ensureJvm as ensureJavaJvm, importClass } from 'java-bridge';
import { ZodError } from 'zod';
import { ontologySchema, type Ontology } from './model';

type JavaOntologyParser = {
  parseToJson(filePath: string): Promise<string>;
};

let configuredJarPath: string | null = null;
let parserClass: JavaOntologyParser | null = null;
let classpathInitialized = false;
let jvmInitialized = false;

export class ParserError extends Error {
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ParserError';
    this.details = details;
  }
}

export function initJvm(jarPath: string): void {
  configuredJarPath = normalizeJarPath(jarPath);
  classpathInitialized = false;
  parserClass = null;
}

export interface JvmInitOptions {
  jvmOpts?: string[];
}

const DEFAULT_JVM_OPTS = ['-Xms128m', '-Xmx512m'];

export function diagnoseJvm(): string {
  const lines: string[] = [];

  lines.push('=== JVM Diagnostics ===');
  lines.push(`platform: ${process.platform} ${process.arch}`);

  const javaHome = process.env.JAVA_HOME ?? '<not set>';
  lines.push(`JAVA_HOME: ${javaHome}`);

  const jarPath = process.env.JAVA_BRIDGE_JAR_PATH ?? '<not set>';
  lines.push(`JAVA_BRIDGE_JAR_PATH: ${jarPath}`);

  if (javaHome !== '<not set>') {
    const libServer = path.join(javaHome, 'lib', 'server');
    lines.push(`lib/server exists: ${existsSync(libServer)}`);
    if (existsSync(libServer)) {
      try {
        const entries = readdirSync(libServer);
        lines.push(`lib/server contents: ${entries.join(', ')}`);
      } catch (err) {
        lines.push(`lib/server read error: ${String(err)}`);
      }
    }

    const modulesPath = path.join(javaHome, 'lib', 'modules');
    lines.push(`lib/modules exists: ${existsSync(modulesPath)}`);

    const javaBin = path.join(javaHome, 'bin', 'java');
    lines.push(`bin/java exists: ${existsSync(javaBin)}`);

    if (existsSync(javaBin)) {
      try {
        const version = execFileSync(javaBin, ['-version'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
        });
        lines.push(`java -version stdout: ${version.trim()}`);
      } catch (err: unknown) {
        const stderr = (err as { stderr?: string }).stderr ?? String(err);
        lines.push(`java -version output (stderr): ${stderr.trim()}`);
      }
    }
  }

  if (jarPath !== '<not set>') {
    lines.push(`JAR exists: ${existsSync(jarPath)}`);
  }

  lines.push('========================');

  return lines.join('\n');
}

export function ensureJvm(options: JvmInitOptions = {}): void {
  const jarPath = resolveJarPath();

  if (!classpathInitialized) {
    appendClasspath(jarPath);
    classpathInitialized = true;
  }

  if (!jvmInitialized) {
    const opts = options.jvmOpts ?? DEFAULT_JVM_OPTS;

    console.error('[bridge] ensureJvm: JAVA_HOME=%s, opts=%s, jarPath=%s', process.env.JAVA_HOME ?? '<unset>', JSON.stringify(opts), jarPath);
    console.error(diagnoseJvm());

    try {
      ensureJavaJvm({ opts });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[bridge] ensureJavaJvm FAILED: ${message}`);
      if (stack !== undefined) {
        console.error(stack);
      }
      throw error;
    }

    console.error('[bridge] ensureJvm: JVM initialized successfully');
    jvmInitialized = true;
  }

  if (parserClass === null) {
    parserClass = importClass('com.swatedb.parser.OntologyParser') as unknown as JavaOntologyParser;
  }
}

export async function parseOntologyFile(filePath: string): Promise<Ontology> {
  if (filePath.trim().length === 0) {
    throw new ParserError('Ontology file path is required.');
  }

  try {
    ensureJvm();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ParserError(`Failed to initialize JVM: ${message}`, error);
  }

  if (parserClass === null) {
    throw new ParserError('Ontology parser class could not be initialized.');
  }

  const resolvedPath = path.resolve(filePath);

  try {
    const javaJson = await parserClass.parseToJson(resolvedPath);
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
    if (isJavaError(error)) {
      throw new ParserError(`Java parser failed for ${resolvedPath}: ${message}`, error);
    }

    throw new ParserError(`Unexpected parser failure for ${resolvedPath}: ${message}`, error);
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

function isJavaError(error: unknown): boolean {
  return error instanceof Error && error.name === 'JavaError';
}

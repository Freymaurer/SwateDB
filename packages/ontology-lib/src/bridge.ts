import { existsSync } from 'node:fs';
import path from 'node:path';
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
  javaHome?: string;
  jvmOpts?: string[];
}

function resolveJavaLibPath(javaHome: string): string {
  if (process.platform === 'win32') {
    return path.join(javaHome, 'bin', 'server', 'jvm.dll');
  }
  if (process.platform === 'darwin') {
    return path.join(javaHome, 'lib', 'server', 'libjvm.dylib');
  }
  return path.join(javaHome, 'lib', 'server', 'libjvm.so');
}

const DEFAULT_JVM_OPTS = ['-Xms128m', '-Xmx512m'];

export function ensureJvm(options: JvmInitOptions = {}): void {
  const jarPath = resolveJarPath();

  if (!classpathInitialized) {
    appendClasspath(jarPath);
    classpathInitialized = true;
  }

  if (!jvmInitialized) {
    const javaHome = options.javaHome ?? process.env.JAVA_HOME ?? undefined;
    const libPath = javaHome !== undefined ? resolveJavaLibPath(javaHome) : undefined;
    const opts = options.jvmOpts ?? DEFAULT_JVM_OPTS;

    ensureJavaJvm({
      libPath: libPath ?? undefined,
      version: undefined,
      opts,
    });

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
  if (envJarPath === undefined || envJarPath.trim().length === 0) {
    throw new ParserError('JAR path is not configured. Call initJvm() or set JAVA_BRIDGE_JAR_PATH.');
  }

  configuredJarPath = normalizeJarPath(envJarPath);
  return configuredJarPath;
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

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initJvm, parseOntologyFile, ParserError } from './bridge';
import type { Ontology } from './model';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export interface ParseFileOptions {
  jarPath?: string;
}

export interface ParseFromUrlOptions extends ParseFileOptions {
  timeoutMs?: number;
  allowlist?: string[];
  maxBytes?: number;
}

export async function parseFile(filePath: string, options: ParseFileOptions = {}): Promise<Ontology> {
  if (options.jarPath !== undefined) {
    initJvm(options.jarPath);
  }

  return parseOntologyFile(filePath);
}

export async function parseFromUrl(url: string, options: ParseFromUrlOptions = {}): Promise<Ontology> {
  const target = new URL(url);
  ensureAllowedUrl(target, options.allowlist ?? []);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let tempDir: string | null = null;

  try {
    const response = await fetch(target, { signal: controller.signal });
    if (!response.ok) {
      throw new ParserError(`Failed to fetch ontology URL ${target.toString()}: HTTP ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
      const size = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(size) && size > maxBytes) {
        throw new ParserError(
          `Ontology download exceeds max size (${size} bytes > ${maxBytes} bytes).`,
        );
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new ParserError(
        `Ontology download exceeds max size (${buffer.length} bytes > ${maxBytes} bytes).`,
      );
    }

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'swatedb-ontology-'));
    const extension = inferExtension(target.pathname);
    const tempFile = path.join(tempDir, `download${extension}`);
    await writeFile(tempFile, buffer);

    return parseFile(tempFile, options);
  } catch (error) {
    if (error instanceof ParserError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ParserError(`Ontology download timed out after ${timeoutMs}ms.`, error);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ParserError(`Failed to parse ontology URL ${target.toString()}: ${message}`, error);
  } finally {
    clearTimeout(timeout);
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function ensureAllowedUrl(target: URL, allowlist: string[]): void {
  if (target.protocol !== 'https:') {
    throw new ParserError(`Only HTTPS URLs are allowed. Received: ${target.protocol}`);
  }

  if (allowlist.length === 0) {
    return;
  }

  const host = target.hostname.toLowerCase();
  const isAllowed = allowlist.some((entry) => {
    const normalized = entry.trim().toLowerCase();
    return normalized.length > 0 && host === normalized;
  });

  if (!isAllowed) {
    throw new ParserError(`URL host is not allowlisted: ${host}`);
  }
}

function inferExtension(pathname: string): '.obo' | '.owl' {
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.obo')) {
    return '.obo';
  }

  if (lower.endsWith('.owl')) {
    return '.owl';
  }

  return '.owl';
}

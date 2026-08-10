import { minimatch } from 'minimatch';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export interface ExternalOntology {
  url: string;
  label?: string;
}

export interface SwateDbConfig {
  import: {
    include: string[];
    exclude: string[];
  };
  externals: ExternalOntology[];
  settings?: Record<string, unknown>;
}

const externalSchema = z
  .union([
    z.string().url().transform((url): ExternalOntology => ({ url })),
    z.object({
      url: z.string().url(),
      label: z.string().optional(),
    }),
  ])
  .transform((value): ExternalOntology => {
    if (typeof value === 'string') {
      return { url: value };
    }

    return value;
  });

export const swateDbConfigSchema = z.object({
  import: z
    .object({
      include: z.array(z.string()).default(['**/*.obo', '**/*.owl']),
      exclude: z.array(z.string()).default([]),
    })
    .default({ include: ['**/*.obo', '**/*.owl'], exclude: [] }),
  externals: z.array(externalSchema).default([]),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export function parseConfig(yamlText: string): SwateDbConfig {
  const parsed = parseYaml(yamlText);
  return swateDbConfigSchema.parse(parsed);
}

export function matchesImportPatterns(filePath: string, config: SwateDbConfig): boolean {
  const normalizedPath = normalizePath(filePath);
  const includePatterns = config.import.include;
  const excludePatterns = config.import.exclude;

  const isIncluded =
    includePatterns.length === 0
      ? true
      : includePatterns.some((pattern) =>
          minimatch(normalizedPath, pattern, {
            dot: true,
            nocase: true,
            noglobstar: false,
          }),
        );

  if (!isIncluded) {
    return false;
  }

  const isExcluded = excludePatterns.some((pattern) =>
    minimatch(normalizedPath, pattern, {
      dot: true,
      nocase: true,
      noglobstar: false,
    }),
  );

  return !isExcluded;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

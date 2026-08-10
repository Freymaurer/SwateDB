import { describe, expect, it } from 'vitest';
import { matchesImportPatterns, parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('parses valid YAML config', () => {
    const yaml = `
import:
  include:
    - "**/*.obo"
    - "**/*.owl"
  exclude:
    - "**/draft/**"
externals:
  - "https://example.org/ext1.obo"
  - url: "https://example.org/ext2.owl"
    label: "external-2"
settings:
  source: "test"
`;

    const config = parseConfig(yaml);

    expect(config.import.include).toEqual(['**/*.obo', '**/*.owl']);
    expect(config.import.exclude).toEqual(['**/draft/**']);
    expect(config.externals).toHaveLength(2);
    expect(config.externals[1]).toEqual({
      url: 'https://example.org/ext2.owl',
      label: 'external-2',
    });
    expect(config.settings).toEqual({ source: 'test' });
  });

  it('throws for invalid config shape', () => {
    const yaml = `
import:
  include: 42
`;

    expect(() => parseConfig(yaml)).toThrowError();
  });
});

describe('matchesImportPatterns', () => {
  it('includes and excludes based on glob patterns', () => {
    const config = parseConfig(`
import:
  include:
    - "**/*.obo"
  exclude:
    - "**/draft/**"
`);

    expect(matchesImportPatterns('ontology/main/file.obo', config)).toBe(true);
    expect(matchesImportPatterns('ontology/draft/file.obo', config)).toBe(false);
    expect(matchesImportPatterns('ontology/main/file.owl', config)).toBe(false);
  });
});

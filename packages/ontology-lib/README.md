# @swatedb/ontology-lib

Shared parsing and validation library consumed by backend and CI tools.

Status: Phase 2 implementation.

## Responsibilities

- Initialize and call Java parser JAR.
- Validate parsed ontology payloads.
- Parse and validate .swatedb.yml configuration.

## Requirements

- Node.js 20+
- Java Runtime 17+ (for `java-bridge` parser calls)
- Access to parser fat JAR via one of:
	- `initJvm('/path/to/java-parser-<version>-all.jar')`
	- `JAVA_BRIDGE_JAR_PATH=/path/to/java-parser-<version>-all.jar`

## Public API

- `initJvm(jarPath)`
- `ensureJvm()`
- `parseOntologyFile(filePath)`
- `parseFile(filePath, options?)`
- `parseFromUrl(url, options?)`
- `parseConfig(yamlText)`
- `matchesImportPatterns(filePath, config)`
- `validateNoDuplicateAccessions(ontology)`
- `validateTermCompleteness(ontology)`
- `validateOntology(ontology)`

## .swatedb.yml schema

```yaml
import:
	include:
		- "**/*.obo"
		- "**/*.owl"
	exclude:
		- "**/draft/**"
externals:
	- "https://example.org/ext.obo"
	- url: "https://example.org/ext.owl"
		label: "optional-name"
settings:
	source: "github"
```

## Test coverage

- Config parsing (valid/invalid)
- Include/exclude pattern matching
- Ontology validation logic
- Optional integration test with real parser JAR

Integration test behavior:

- `npm run test` now auto-detects Java and attempts to resolve a parser fat JAR automatically.
- If no JAR exists, it triggers `@swatedb/java-parser` build and then sets `JAVA_BRIDGE_JAR_PATH` for the test process.
- If Java is unavailable, integration tests are skipped and unit tests still run.

## Current Commands

```bash
npm run lint
npm run build
npm run test
```

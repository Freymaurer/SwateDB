# @swatedb/java-parser

Java OWL/OBO parser package.

Status: Phase 1 implementation.

## Responsibilities

- Parse .owl and .obo files.
- Expose a stable parser entrypoint for TypeScript bridge usage.
- Produce a shaded fat JAR for runtime usage.

## Parser Entry Points

- `com.swatedb.parser.OntologyParser.parseToJson(String filePath)`
- `com.swatedb.parser.OntologyParserCli` (CLI wrapper)

## Build

Run from `packages/java-parser`:

```bash
mvn -q clean package
```

This produces:

- `target/java-parser-0.1.0.jar`
- `target/java-parser-0.1.0-all.jar` (shaded, includes dependencies)

## Test

Run from `packages/java-parser`:

```bash
mvn -q test
```

Tests cover:

- `test-fixtures/small.obo`
- `test-fixtures/small.owl`
- malformed fixture handling
- obsolete term detection

## CLI Usage

Run from `packages/java-parser` after build:

```bash
java -cp target/java-parser-0.1.0-all.jar com.swatedb.parser.OntologyParserCli ../../test-fixtures/small.obo
```

## Output Schema

The parser emits JSON with this shape:

```json
{
	"name": "string",
	"version": "string",
	"metadata": {
		"title": "string",
		"description": "string",
		"license": "string",
		"creator": "string",
		"versionIRI": "string"
	},
	"terms": [
		{
			"accession": "string",
			"name": "string",
			"definition": "string",
			"obsolete": false,
			"synonyms": ["string"],
			"relationships": [
				{
					"type": "string",
					"targetAccession": "string"
				}
			]
		}
	]
}
```

## Current Commands

```bash
npm run lint
npm run build
npm run test
```

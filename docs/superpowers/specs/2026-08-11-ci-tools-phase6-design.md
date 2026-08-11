# Phase 6: CI Tools and Ontology Template Workflow

## Goal

Provide reusable CLI checks for ontology repositories, a template CI workflow, and issue templates — all self-contained within the `ci-tools` package.

## Current State

- `ci-tools/src/cli.ts`: scaffold only, prints placeholder message
- `ci-tools/package.json`: `bin` field set to `swatedb-ci`, no dependencies, no tests
- `@swatedb/ontology-lib`: fully implemented with `parseFile`, `parseConfig`, `validateOntology`, `matchesImportPatterns`, `ParserError`
- No `.github/` directory exists — no workflows, no issue templates

## Design

### Architecture

```
ci-tools/
├── src/
│   └── cli.ts                      # CLI entry point: manual argv parsing
├── templates/
│   ├── ontology-ci-template.yml    # Reusable workflow_call
│   ├── new-term-request.yml        # Issue form template
│   └── bug-report.yml              # Issue form template
├── tests/
│   └── cli.test.ts                 # Tests for commands, flags, exit codes
├── package.json
├── tsconfig.json
└── README.md
```

### CLI Commands

Manual `process.argv` parsing — no external CLI library. All commands support `--json` for machine-readable output.

| Command | Behavior | Exit 0 | Exit 1 | Exit 2 |
|---|---|---|---|---|
| `swatedb-ci validate <file>` | Parse + validate single ontology file | No validation issues | Validation errors found | Parse/runtime error |
| `swatedb-ci validate-all --config <path>` | Parse `.swatedb.yml`, glob-match files, validate each | All files pass | One or more validation errors | Parse/runtime error |
| `swatedb-ci check-duplicates <dir>` | Scan all `.obo`/`.owl` files in directory for duplicate accessions across files | No duplicates | Duplicates found | Parse/runtime error |
| `swatedb-ci setup-templates [--dir <path>]` | Copy `templates/` to `<path>/.github/` | Success | N/A | Filesystem error |

### Output Formats

**Human-readable (default):** Each validation result printed as `[severity] code: message (path)`.

**Machine-readable (`--json`):** Single JSON object printed to stdout:
```json
{
  "status": "ok" | "failed" | "error",
  "exitCode": 0 | 1 | 2,
  "command": "validate",
  "results": [...],
  "parseErrors": [...],
  "stats": { "filesChecked": 3, "errors": 1, "warnings": 2 }
}
```

### Dependencies

ci-tools depends on `@swatedb/ontology-lib` (workspace reference). Uses `glob` (already a transitive dep via minimatch in ontology-lib) for file discovery in `validate-all` and `check-duplicates`.

### Templates

**`ontology-ci-template.yml`:** Reusable workflow:
- Inputs: `java_version` (default 17), `working_directory` (default '.')
- Steps: checkout, setup Node + Java, install `@swatedb/ci-tools`, run `swatedb-ci validate-all --config .swatedb.yml`

**`new-term-request.yml`:** Issue form with fields: term name (required), definition (required), parent term, references (textarea), justification (textarea).

**`bug-report.yml`:** Issue form with fields: description (required), ontology file path, expected behavior, actual behavior.

### `setup-templates` Command

Copies all files from `ci-tools/templates/` into `--dir/.github/` (defaults to `process.cwd()`). Creates `workflows/` and `ISSUE_TEMPLATE/` subdirectories. Skips existing files (no overwrite).

### Testing

Tests in `ci-tools/tests/cli.test.ts` using vitest:
- Spawn `node dist/cli.js` as child process, assert exit codes and stdout
- Test `validate` with `small.obo` (exit 0), `malformed.obo` (exit 2)
- Test `validate-all` with fixture config
- Test `check-duplicates` with fixture directory
- Test `--json` output is valid JSON with expected fields
- Test `setup-templates` creates expected files

## What's Not Included

- Publishing to npm registry (package remains `"private": true`)
- Docker integration for ci-tools
- Windows-specific path handling beyond Node.js built-in `path` module

## Verification

1. `swatedb-ci validate test-fixtures/small.obo` exits 0
2. `swatedb-ci validate test-fixtures/malformed.obo` exits 2
3. `swatedb-ci check-duplicates test-fixtures/` finds no cross-file duplicates
4. `npm test` in ci-tools passes
5. Workflow template passes YAML syntax validation

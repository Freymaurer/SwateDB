# @swatedb/ci-tools

CLI tooling for ontology repository CI validation. Provides deterministic exit codes and machine-readable output suitable for CI pipelines.

## Commands

```bash
# Validate a single ontology file
swatedb-ci validate path/to/ontology.obo

# Validate all ontology files per .swatedb.yml config
swatedb-ci validate-all --config .swatedb.yml

# Check for duplicate term accessions across all files in a directory
swatedb-ci check-duplicates ontologies/

# Copy CI workflow and issue templates into a repository
swatedb-ci setup-templates --dir /path/to/repo
```

## Options

| Flag | Description |
|---|---|
| `--json` | Output results as JSON (machine-readable) |
| `--config <path>` | Path to `.swatedb.yml` (required for `validate-all`) |
| `--dir <path>` | Target directory for `setup-templates` (defaults to cwd) |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success — no validation issues found |
| 1 | Validation errors found (duplicates, missing fields, etc.) |
| 2 | Parse or runtime error (malformed file, Java not found, etc.) |

## JSON Output

When run with `--json`, results are printed to stdout as:

```json
{
  "status": "ok" | "failed" | "error",
  "exitCode": 0 | 1 | 2,
  "command": "validate",
  "results": [{ "code": "...", "message": "...", "path": "...", "severity": "error" | "warning" }],
  "parseErrors": ["error message..."],
  "stats": { "filesChecked": 3, "errors": 1, "warnings": 2 }
}
```

## Setup Templates

The `setup-templates` command copies the following into `<dir>/.github/`:

- `workflows/ontology-ci-template.yml` — reusable CI workflow (`workflow_call`)
- `ISSUE_TEMPLATE/new-term-request.yml` — issue form for new term requests
- `ISSUE_TEMPLATE/bug-report.yml` — issue form for bug reports

Existing files are skipped (no overwrite).

## Development

```bash
npm run build   # Compile TypeScript
npm run test    # Run tests
npm run lint    # Lint source files
```

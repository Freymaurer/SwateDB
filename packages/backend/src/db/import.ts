import type { Driver } from 'neo4j-driver';
import type { Ontology } from '@swatedb/ontology-lib';

export const DEFAULT_IMPORT_CHUNK_SIZE = 1000;

export interface ImportOptions {
  chunkSize?: number;
}

export interface ImportSummary {
  ontologyName: string;
  termsProcessed: number;
  relationshipsProcessed: number;
}

interface TermRow {
  accession: string;
  name: string;
  definition: string | null;
  isObsolete: boolean;
  synonyms: string[];
}

interface RelationshipRow {
  sourceAccession: string;
  targetAccession: string;
  type: string;
}

interface TransactionRunner {
  run(query: string, parameters?: Record<string, unknown>): Promise<unknown>;
}

export function normalizeChunkSize(chunkSize: number | undefined): number {
  if (chunkSize === undefined) {
    return DEFAULT_IMPORT_CHUNK_SIZE;
  }

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Import chunk size must be a positive integer.');
  }

  return chunkSize;
}

export async function importOntology(
  driver: Driver,
  ontology: Ontology,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  if (ontology.name.trim().length === 0) {
    throw new Error('Ontology name is required for import.');
  }

  const chunkSize = normalizeChunkSize(options.chunkSize);
  const termRows = ontology.terms.map<TermRow>((term) => ({
    accession: term.accession,
    name: term.name,
    definition: term.definition,
    isObsolete: term.isObsolete,
    synonyms: term.synonyms,
  }));

  const relationshipRows = buildRelationshipRows(ontology);
  const session = driver.session();

  try {
    const summary = await session.executeWrite(async (transaction) => {
      await upsertOntologyNode(transaction, ontology);

      for (const chunk of chunkArray(termRows, chunkSize)) {
        await upsertTermsChunk(transaction, ontology.name, chunk);
      }

      for (const chunk of chunkArray(relationshipRows, chunkSize)) {
        await upsertRelationshipsChunk(transaction, chunk);
      }

      return {
        ontologyName: ontology.name,
        termsProcessed: termRows.length,
        relationshipsProcessed: relationshipRows.length,
      } as ImportSummary;
    });

    return summary;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Ontology import transaction failed: ${detail}`);
  } finally {
    await session.close();
  }
}

function chunkArray<T>(values: readonly T[], chunkSize: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

async function upsertOntologyNode(
  transaction: TransactionRunner,
  ontology: Ontology,
): Promise<void> {
  await transaction.run(
    `
      MERGE (o:Ontology {name: $name})
      SET
        o.version = $version,
        o.title = $title,
        o.description = $description,
        o.license = $license,
        o.creator = $creator,
        o.versionIRI = $versionIRI,
        o.updatedAt = datetime()
    `,
    {
      name: ontology.name,
      version: ontology.version,
      title: ontology.metadata.title,
      description: ontology.metadata.description,
      license: ontology.metadata.license,
      creator: ontology.metadata.creator,
      versionIRI: ontology.metadata.versionIRI,
    },
  );
}

async function upsertTermsChunk(
  transaction: TransactionRunner,
  ontologyName: string,
  chunk: readonly TermRow[],
): Promise<void> {
  await transaction.run(
    `
      UNWIND $terms AS term
      MERGE (t:Term {accession: term.accession})
      SET
        t.name = term.name,
        t.definition = term.definition,
        t.isObsolete = term.isObsolete,
        t.synonyms = term.synonyms,
        t.updatedAt = datetime()
      WITH t
      MATCH (o:Ontology {name: $ontologyName})
      MERGE (t)-[contained:CONTAINED_IN]->(o)
      SET contained.name = 'CONTAINED_IN'
    `,
    {
      ontologyName,
      terms: chunk,
    },
  );
}

async function upsertRelationshipsChunk(
  transaction: TransactionRunner,
  chunk: readonly RelationshipRow[],
): Promise<void> {
  const rowsByType = new Map<string, RelationshipRow[]>();

  for (const row of chunk) {
    const relationType = row.type.trim();
    if (relationType.length === 0) {
      throw new Error(`Relationship type cannot be empty for source accession ${row.sourceAccession}.`);
    }

    const existing = rowsByType.get(relationType);
    if (existing === undefined) {
      rowsByType.set(relationType, [row]);
    } else {
      existing.push(row);
    }
  }

  for (const [relationType, rows] of rowsByType.entries()) {
    const escapedRelationshipType = escapeRelationshipType(relationType);
    await transaction.run(
      `
        UNWIND $rows AS row
        MATCH (source:Term {accession: row.sourceAccession})
        MATCH (target:Term {accession: row.targetAccession})
        MERGE (source)-[relation:\`${escapedRelationshipType}\`]->(target)
        SET relation.name = row.type
      `,
      {
        rows,
      },
    );
  }
}

function buildRelationshipRows(ontology: Ontology): RelationshipRow[] {
  const rows: RelationshipRow[] = [];

  for (const term of ontology.terms) {
    for (const relationship of term.relationships) {
      rows.push({
        sourceAccession: term.accession,
        targetAccession: relationship.targetAccession,
        type: relationship.type,
      });
    }
  }

  return rows;
}

function escapeRelationshipType(value: string): string {
  return value.replace(/`/g, '``');
}

import { z } from 'zod';

export interface Relation {
  type: string;
  targetAccession: string;
}

export interface OntologyMetadata {
  title: string | null;
  description: string | null;
  license: string | null;
  creator: string | null;
  versionIRI: string | null;
}

export interface Term {
  accession: string;
  name: string;
  definition: string | null;
  isObsolete: boolean;
  synonyms: string[];
  relationships: Relation[];
}

export interface Ontology {
  name: string;
  version: string;
  terms: Term[];
  metadata: OntologyMetadata;
}

export const relationSchema = z.object({
  type: z.string().min(1, 'Relationship type is required.'),
  targetAccession: z.string().min(1, 'Relationship target accession is required.'),
});

export const metadataSchema = z
  .object({
    title: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    license: z.string().nullable().default(null),
    creator: z.string().nullable().default(null),
    versionIRI: z.string().nullable().default(null),
  })
  .transform((raw): OntologyMetadata => ({
    title: raw.title,
    description: raw.description,
    license: raw.license,
    creator: raw.creator,
    versionIRI: raw.versionIRI,
  }));

const javaTermSchema = z
  .object({
    accession: z.string().min(1, 'Term accession is required.'),
    name: z.string().min(1, 'Term name is required.'),
    definition: z.string().nullable().optional(),
    obsolete: z.boolean().optional(),
    isObsolete: z.boolean().optional(),
    synonyms: z.array(z.string()).default([]),
    relationships: z.array(relationSchema).default([]),
  })
  .transform((raw): Term => ({
    accession: raw.accession,
    name: raw.name,
    definition: raw.definition ?? null,
    isObsolete: raw.isObsolete ?? raw.obsolete ?? false,
    synonyms: raw.synonyms,
    relationships: raw.relationships,
  }));

export const ontologySchema = z
  .object({
    name: z.string().min(1, 'Ontology name is required.'),
    version: z.string().default(''),
    terms: z.array(javaTermSchema),
    metadata: metadataSchema.default({
      title: null,
      description: null,
      license: null,
      creator: null,
      versionIRI: null,
    }),
  })
  .transform((raw) => ({
    name: raw.name,
    version: raw.version,
    terms: raw.terms,
    metadata: raw.metadata,
  }));

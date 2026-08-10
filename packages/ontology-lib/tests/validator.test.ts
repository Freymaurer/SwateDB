import { describe, expect, it } from 'vitest';
import type { Ontology } from '../src/model';
import {
  validateNoDuplicateAccessions,
  validateOntology,
  validateTermCompleteness,
} from '../src/validator';

function makeBaseOntology(): Ontology {
  return {
    name: 'test-ontology',
    version: '1.0.0',
    metadata: {
      title: 'Test Ontology',
      description: null,
      license: null,
      creator: null,
      versionIRI: null,
    },
    terms: [
      {
        accession: 'TEST:0001',
        name: 'term-one',
        definition: 'A test definition',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
    ],
  };
}

describe('validateNoDuplicateAccessions', () => {
  it('detects duplicate term accessions', () => {
    const ontology = makeBaseOntology();
    ontology.terms.push({
      ...ontology.terms[0],
      name: 'term-two',
    });

    const results = validateNoDuplicateAccessions(ontology);

    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('duplicate_accession');
    expect(results[0].severity).toBe('error');
  });
});

describe('validateTermCompleteness', () => {
  it('returns errors for missing required term fields', () => {
    const ontology = makeBaseOntology();
    ontology.terms = [
      {
        accession: '',
        name: '',
        definition: '',
        isObsolete: false,
        synonyms: [],
        relationships: [],
      },
    ];

    const results = validateTermCompleteness(ontology);

    expect(results.some((result) => result.code === 'missing_accession')).toBe(true);
    expect(results.some((result) => result.code === 'missing_name')).toBe(true);
    expect(results.some((result) => result.code === 'missing_definition')).toBe(true);
  });
});

describe('validateOntology', () => {
  it('combines ontology and term validation checks', () => {
    const ontology = makeBaseOntology();
    ontology.name = '';
    ontology.terms.push({
      ...ontology.terms[0],
      name: 'duplicate-accession-term',
    });

    const results = validateOntology(ontology);

    expect(results.some((result) => result.code === 'missing_ontology_name')).toBe(true);
    expect(results.some((result) => result.code === 'duplicate_accession')).toBe(true);
  });
});

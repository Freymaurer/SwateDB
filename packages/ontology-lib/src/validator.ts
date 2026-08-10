import type { Ontology, Term } from './model';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationResult {
  code: string;
  message: string;
  path: string;
  severity: ValidationSeverity;
}

export function validateNoDuplicateAccessions(ontology: Ontology): ValidationResult[] {
  const seen = new Map<string, number[]>();

  ontology.terms.forEach((term, index) => {
    const key = term.accession.trim();
    const indices = seen.get(key);
    if (indices === undefined) {
      seen.set(key, [index]);
      return;
    }

    indices.push(index);
  });

  const results: ValidationResult[] = [];
  for (const [accession, indices] of seen.entries()) {
    if (indices.length <= 1) {
      continue;
    }

    results.push({
      code: 'duplicate_accession',
      message: `Duplicate accession detected: ${accession}.`,
      path: `/terms/${indices.join(',')}/accession`,
      severity: 'error',
    });
  }

  return results;
}

export function validateTermCompleteness(ontology: Ontology): ValidationResult[] {
  return ontology.terms.flatMap((term, index) => validateTerm(index, term));
}

export function validateOntology(ontology: Ontology): ValidationResult[] {
  const issues: ValidationResult[] = [];

  if (ontology.name.trim().length === 0) {
    issues.push({
      code: 'missing_ontology_name',
      message: 'Ontology name is required.',
      path: '/name',
      severity: 'error',
    });
  }

  issues.push(...validateNoDuplicateAccessions(ontology));
  issues.push(...validateTermCompleteness(ontology));

  return issues;
}

function validateTerm(index: number, term: Term): ValidationResult[] {
  const issues: ValidationResult[] = [];

  if (term.accession.trim().length === 0) {
    issues.push({
      code: 'missing_accession',
      message: 'Term accession is required.',
      path: `/terms/${index}/accession`,
      severity: 'error',
    });
  }

  if (term.name.trim().length === 0) {
    issues.push({
      code: 'missing_name',
      message: 'Term name is required.',
      path: `/terms/${index}/name`,
      severity: 'error',
    });
  }

  if (term.definition === null || term.definition.trim().length === 0) {
    issues.push({
      code: 'missing_definition',
      message: 'Term definition is missing.',
      path: `/terms/${index}/definition`,
      severity: 'warning',
    });
  }

  return issues;
}

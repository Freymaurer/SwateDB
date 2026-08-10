import type { Driver } from 'neo4j-driver';

export const SCHEMA_STATEMENTS = [
	'CREATE CONSTRAINT ontology_name_unique IF NOT EXISTS FOR (o:Ontology) REQUIRE o.name IS UNIQUE',
	'CREATE CONSTRAINT term_accession_unique IF NOT EXISTS FOR (t:Term) REQUIRE t.accession IS UNIQUE',
	'CREATE FULLTEXT INDEX TermName IF NOT EXISTS FOR (t:Term) ON EACH [t.name]',
	'CREATE FULLTEXT INDEX TermDefinition IF NOT EXISTS FOR (t:Term) ON EACH [t.definition]',
	'CREATE FULLTEXT INDEX TermNameAndDefinition IF NOT EXISTS FOR (t:Term) ON EACH [t.name, t.definition]',
] as const;

export async function ensureSchema(driver: Driver): Promise<void> {
	const session = driver.session();

	try {
		for (const statement of SCHEMA_STATEMENTS) {
			await session.run(statement);
		}
	} finally {
		await session.close();
	}
}

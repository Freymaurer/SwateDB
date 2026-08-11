import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';
import { parse as parseYaml } from 'yaml';

const referenceSpecDir = 'docs';

interface ReferenceSpec {
	tags?: unknown[];
	components?: Record<string, unknown>;
}

export function generateSpec(): Record<string, unknown> {
	const reference = loadReferenceSpec();

	const definition: Record<string, unknown> = {
		openapi: '3.1.0',
		info: {
			title: 'Metadata for Ontology Description and Publication Ontology Application Program Interface',
			version: '0.0.1',
			description:
				'This Application Programming Interface (API) has been developed to promote interoperability of Semantic Artefact Catalogues in the European Open Science Cloud (EOSC) ecosystem and beyond.',
		},
		servers: [
			{
				url: `http://localhost:${process.env.PORT ?? '3000'}`,
				description: 'Local development server',
			},
		],
	};

	if (reference !== null) {
		if (reference.tags !== undefined) {
			definition.tags = reference.tags;
		}
		if (reference.components !== undefined) {
			definition.components = reference.components;
		}
	}

	const generated = swaggerJsdoc({
		definition,
		apis: [normalizeGlobPath(path.resolve(__dirname, '..', 'routes', 'mod-api', '**/*.{ts,js}'))],
	} as never) as Record<string, unknown>;

	const paths = (generated.paths as Record<string, unknown> | undefined) ?? {};

	return {
		...generated,
		documentationPaths: Object.keys(paths).sort(),
	};
}

function loadReferenceSpec(): ReferenceSpec | null {
	const candidates = [
		path.resolve(process.cwd(), referenceSpecDir, 'openapi.yaml'),
		path.resolve(process.cwd(), '..', referenceSpecDir, 'openapi.yaml'),
		path.resolve(process.cwd(), '..', '..', referenceSpecDir, 'openapi.yaml'),
		path.resolve(__dirname, '..', '..', '..', '..', '..', referenceSpecDir, 'openapi.yaml'),
		path.resolve(process.cwd(), '..', '..', '..', referenceSpecDir, 'openapi.yaml'),
	];

	for (const candidate of candidates) {
		if (!existsSync(candidate)) {
			continue;
		}

		const raw = readFileSync(candidate, 'utf8');
		const parsed = parseYaml(raw);

		if (parsed !== null && typeof parsed === 'object') {
			const spec = parsed as Record<string, unknown>;
			return {
				tags: Array.isArray(spec.tags) ? spec.tags : undefined,
				components:
					spec.components !== null && typeof spec.components === 'object'
						? (spec.components as Record<string, unknown>)
						: undefined,
			};
		}
	}

	return null;
}

function normalizeGlobPath(rawPath: string): string {
	return rawPath.replace(/\\/g, '/');
}

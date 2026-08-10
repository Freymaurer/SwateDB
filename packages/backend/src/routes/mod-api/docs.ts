import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';

export interface DocsRouterOptions {
	openApiSpec?: Record<string, unknown>;
}

export function createDocsRouter(options: DocsRouterOptions = {}): Router {
	const router = Router();
	const openApiSpec = options.openApiSpec ?? loadOpenApiSpec();

	router.use('/', swaggerUi.serve);
	router.get('/', swaggerUi.setup(openApiSpec, { explorer: true }));

	return router;
}

function loadOpenApiSpec(): Record<string, unknown> {
	const candidates = [
		path.resolve(process.cwd(), 'openapi.yaml'),
		path.resolve(process.cwd(), '..', '..', 'openapi.yaml'),
		path.resolve(process.cwd(), '..', '..', '..', 'openapi.yaml'),
		path.resolve(__dirname, '..', '..', '..', '..', '..', 'openapi.yaml'),
	];

	for (const candidate of candidates) {
		if (!existsSync(candidate)) {
			continue;
		}

		const raw = readFileSync(candidate, 'utf8');
		const parsed = parseYaml(raw);

		if (parsed !== null && typeof parsed === 'object') {
			return parsed as Record<string, unknown>;
		}
	}

	throw new Error('Unable to locate openapi.yaml for /doc/api documentation route.');
}

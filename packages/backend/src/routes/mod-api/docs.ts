import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateSpec } from '../../openapi/generate-spec';

export interface DocsRouterOptions {
	openApiSpec?: Record<string, unknown>;
}

/**
 * @openapi
 * /doc/api:
 *   get:
 *     tags:
 *       - Documentation
 *     summary: Get the API documentation
 *     operationId: docs
 *     responses:
 *       '200':
 *         $ref: '#/components/responses/notes'
 */
export function createDocsRouter(options: DocsRouterOptions = {}): Router {
	const router = Router();
	const openApiSpec = options.openApiSpec ?? generateSpec();

	router.use('/', swaggerUi.serve);
	router.get('/', swaggerUi.setup(openApiSpec, { explorer: true }));

	return router;
}

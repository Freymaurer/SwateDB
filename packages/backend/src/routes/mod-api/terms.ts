import { Router } from 'express';
import type { ModApiService } from './service';

export function createTermsRouter(service: Pick<ModApiService, 'countTerms'>): Router {
	const router = Router();

	/**
	 * @openapi
	 * /terms/count:
	 *   get:
	 *     tags:
	 *       - Terms
	 *     summary: Get the total number of terms in the catalogue
	 *     operationId: getTermsCount
	 *     responses:
	 *       '200':
	 *         description: The total number of terms
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 count:
	 *                   type: integer
	 */
	router.get('/count', async (_request, response, next) => {
		try {
			const count = await service.countTerms();
			response.status(200).json({ count });
		} catch (error) {
			next(error);
		}
	});

	return router;
}

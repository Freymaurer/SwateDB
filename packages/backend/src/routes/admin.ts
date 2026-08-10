import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { createAdminAuthMiddleware } from '../middleware/auth';
import { HttpError } from '../middleware/error-handler';
import { getImportJobById, listImportJobs } from '../services/job-queue';
import type { ImportService } from '../services/import-service';

const listJobsQuerySchema = z.object({
	limit: z.coerce.number().int().positive().max(200).optional(),
});

const syncRequestSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	ref: z.string().min(1).default('main'),
	installationId: z.number().int().positive(),
});

export interface AdminRouterOptions {
	importService: Pick<ImportService, 'enqueueManualSync'>;
	authMiddleware?: RequestHandler;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
	const router = Router();
	const auth = options.authMiddleware ?? createAdminAuthMiddleware();

	router.use(auth);

	router.post('/sync', async (request, response, next) => {
		try {
			const parsed = syncRequestSchema.parse(request.body);
			const requestedBy = request.header('x-swatedb-user') ?? undefined;

			const queued = await options.importService.enqueueManualSync({
				...parsed,
				requestedBy,
			});

			response.status(202).json({
				status: 'queued',
				jobId: queued.jobId,
				matchedFiles: queued.matchedFiles,
				externals: queued.externals,
			});
		} catch (error) {
			next(error);
		}
	});

	router.get('/jobs', async (request, response, next) => {
		try {
			const query = listJobsQuerySchema.parse(request.query);
			const jobs = await listImportJobs(query.limit ?? 50);

			response.status(200).json({
				jobs,
			});
		} catch (error) {
			next(error);
		}
	});

	router.get('/jobs/:id', async (request, response, next) => {
		try {
			const { id } = request.params;
			const job = await getImportJobById(id);

			if (job === null) {
				throw new HttpError(404, 'job_not_found', `Job not found: ${id}`);
			}

			response.status(200).json(job);
		} catch (error) {
			next(error);
		}
	});

	return router;
}

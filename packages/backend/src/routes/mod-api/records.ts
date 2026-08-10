import { Router } from 'express';
import { HttpError } from '../../middleware/error-handler';
import { paginate, parseCollectionQuery, sendByFormat, toJsonLd } from './helpers';
import type { ModApiService, RecordEntry } from './service';

const recordsContext = {
	dcterms: 'http://purl.org/dc/terms/',
	hydra: 'http://www.w3.org/ns/hydra/core#',
	mod: 'https://w3id.org/mod#',
};

export function createRecordsRouter(service: Pick<ModApiService, 'listRecords' | 'getRecord'>): Router {
	const router = Router();

	router.get('/', async (request, response, next) => {
		try {
			const query = parseCollectionQuery(request);
			const records = await service.listRecords({
				page: query.page,
				pageSize: query.pageSize,
			});

			const payload = paginate(
				request,
				records.members.map((entry) => toRecordJsonLd(entry)),
				records.totalItems,
				query.page,
				query.pageSize,
			);

			const body = toJsonLd(
				{
					'@context': recordsContext,
					...payload,
				},
				query.display,
			);

			const formatted = sendByFormat(request, body, query.format);
			response.status(200).type(formatted.contentType).send(formatted.body);
		} catch (error) {
			next(error);
		}
	});

	router.get('/:artefactID', async (request, response, next) => {
		try {
			const query = parseCollectionQuery(request);
			const record = await service.getRecord(request.params.artefactID);

			if (record === null) {
				throw new HttpError(404, 'record_not_found', `Record not found: ${request.params.artefactID}`);
			}

			const body = toJsonLd(
				{
					'@context': recordsContext,
					...toRecordJsonLd(record),
				},
				query.display,
			);

			const formatted = sendByFormat(request, body, query.format);
			response.status(200).type(formatted.contentType).send(formatted.body);
		} catch (error) {
			next(error);
		}
	});

	return router;
}

function toRecordJsonLd(record: RecordEntry): Record<string, unknown> {
	return {
		'@id': `/records/${encodeURIComponent(record.artefactId)}`,
		'@type': 'mod:SemanticArtefactCatalogRecord',
		'dcterms:identifier': record.artefactId,
		'dcterms:created': record.created,
		'dcterms:modified': record.modified,
	};
}

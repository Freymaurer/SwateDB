import { Router } from 'express';
import { paginate, parseSearchQuery, sendByFormat, toJsonLd } from './helpers';
import type { ModApiService, SearchEntry } from './service';

const searchContext = {
	dcterms: 'http://purl.org/dc/terms/',
	hydra: 'http://www.w3.org/ns/hydra/core#',
	mod: 'https://w3id.org/mod#',
};

export function createSearchRouter(service: Pick<ModApiService, 'search'>): Router {
	const router = Router();

	router.get('/', async (request, response, next) => {
		try {
			const query = parseSearchQuery(request);
			const result = await service.search(
				query.q,
				{
					page: query.page,
					pageSize: query.pageSize,
				},
				'all',
			);

			const payload = paginate(
				request,
				result.members.map((entry) => toSearchJsonLd(entry)),
				result.totalItems,
				query.page,
				query.pageSize,
			);

			const body = toJsonLd(
				{
					'@context': searchContext,
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

	router.get('/content', async (request, response, next) => {
		try {
			const query = parseSearchQuery(request);
			const result = await service.search(
				query.q,
				{
					page: query.page,
					pageSize: query.pageSize,
				},
				'content',
			);

			const payload = paginate(
				request,
				result.members.map((entry) => toSearchJsonLd(entry)),
				result.totalItems,
				query.page,
				query.pageSize,
			);

			const body = toJsonLd(
				{
					'@context': searchContext,
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

	router.get('/metadata', async (request, response, next) => {
		try {
			const query = parseSearchQuery(request);
			const result = await service.search(
				query.q,
				{
					page: query.page,
					pageSize: query.pageSize,
				},
				'metadata',
			);

			const payload = paginate(
				request,
				result.members.map((entry) => toSearchJsonLd(entry)),
				result.totalItems,
				query.page,
				query.pageSize,
			);

			const body = toJsonLd(
				{
					'@context': searchContext,
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

	return router;
}

function toSearchJsonLd(entry: SearchEntry): Record<string, unknown> {
	const resourcePath =
		entry.resultType === 'content'
			? `/artefacts/${encodeURIComponent(entry.artefactId)}/resources/${encodeURIComponent(entry.id)}`
			: `/artefacts/${encodeURIComponent(entry.artefactId)}`;

	return {
		'@id': resourcePath,
		'@type': entry.resultType === 'content' ? 'mod:SearchContentResult' : 'mod:SearchMetadataResult',
		'dcterms:identifier': entry.id,
		'dcterms:title': entry.label,
		'dcterms:description': entry.description,
		'mod:resultType': entry.resultType,
		'mod:artefact': entry.artefactId,
	};
}

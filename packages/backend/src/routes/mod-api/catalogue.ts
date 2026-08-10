import { Router } from 'express';
import { parseCollectionQuery, sendByFormat, toJsonLd } from './helpers';
import type { ModApiService } from './service';

const catalogueContext = {
	dcterms: 'http://purl.org/dc/terms/',
	dcat: 'http://www.w3.org/ns/dcat#',
	mod: 'https://w3id.org/mod#',
};

export function createCatalogueRouter(service: Pick<ModApiService, 'getCatalogue'>): Router {
	const router = Router();

	router.get('/', async (request, response, next) => {
		try {
			const query = parseCollectionQuery(request);
			const catalogue = await service.getCatalogue();

			const body = toJsonLd(
				{
					'@context': catalogueContext,
					'@id': '/',
					'@type': 'mod:SemanticArtefactCatalog',
					'dcterms:identifier': catalogue.id,
					'dcterms:title': catalogue.title,
					'dcterms:description': catalogue.description,
					'dcterms:creator': catalogue.creator,
					'dcterms:license': catalogue.license,
					'dcterms:modified': catalogue.modified,
					'dcterms:type': 'SemanticArtefactCatalogue',
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

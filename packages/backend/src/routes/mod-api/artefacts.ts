import { type NextFunction, type Request, type Response, Router } from 'express';
import { HttpError } from '../../middleware/error-handler';
import { paginate, parseCollectionQuery, sendByFormat, toJsonLd } from './helpers';
import type {
	ArtefactEntry,
	DistributionEntry,
	ModApiService,
	ResourceEntry,
} from './service';

const artefactsContext = {
	dcat: 'http://www.w3.org/ns/dcat#',
	dcterms: 'http://purl.org/dc/terms/',
	hydra: 'http://www.w3.org/ns/hydra/core#',
	mod: 'https://w3id.org/mod#',
};

export function createArtefactsRouter(
	service: Pick<
		ModApiService,
		| 'listArtefacts'
		| 'getArtefact'
		| 'listDistributions'
		| 'getDistribution'
		| 'getLatestDistribution'
		| 'getRecord'
		| 'listResources'
		| 'getResource'
	>,
): Router {
	const router = Router();

	router.get('/', async (request, response, next) => {
		try {
			const query = parseCollectionQuery(request);
			const artefacts = await service.listArtefacts({
				page: query.page,
				pageSize: query.pageSize,
			});

			const payload = paginate(
				request,
				artefacts.members.map((entry) => toArtefactJsonLd(entry)),
				artefacts.totalItems,
				query.page,
				query.pageSize,
			);

			const body = toJsonLd(
				{
					'@context': artefactsContext,
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
			const artefactId = requirePathParam(request, 'artefactID');
			const query = parseCollectionQuery(request);
			const artefact = await service.getArtefact(artefactId);
			if (artefact === null) {
				throw new HttpError(404, 'artefact_not_found', `Artefact not found: ${artefactId}`);
			}

			const body = toJsonLd(
				{
					'@context': artefactsContext,
					...toArtefactJsonLd(artefact),
				},
				query.display,
			);

			const formatted = sendByFormat(request, body, query.format);
			response.status(200).type(formatted.contentType).send(formatted.body);
		} catch (error) {
			next(error);
		}
	});

	router.get('/:artefactID/distributions', async (request, response, next) => {
		try {
			const artefactId = requirePathParam(request, 'artefactID');
			const query = parseCollectionQuery(request);
			const distributions = await service.listDistributions(artefactId, {
				page: query.page,
				pageSize: query.pageSize,
			});

			if (distributions.totalItems === 0) {
				throw new HttpError(404, 'distribution_not_found', `Artefact not found: ${artefactId}`);
			}

			const payload = paginate(
				request,
				distributions.members.map((entry) => toDistributionJsonLd(entry)),
				distributions.totalItems,
				query.page,
				query.pageSize,
			);

			const body = toJsonLd(
				{
					'@context': artefactsContext,
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

	router.get('/:artefactID/distributions/latest', async (request, response, next) => {
		try {
			const artefactId = requirePathParam(request, 'artefactID');
			const query = parseCollectionQuery(request);
			const distribution = await service.getLatestDistribution(artefactId);
			if (distribution === null) {
				throw new HttpError(404, 'distribution_not_found', `Artefact not found: ${artefactId}`);
			}

			const body = toJsonLd(
				{
					'@context': artefactsContext,
					...toDistributionJsonLd(distribution),
				},
				query.display,
			);

			const formatted = sendByFormat(request, body, query.format);
			response.status(200).type(formatted.contentType).send(formatted.body);
		} catch (error) {
			next(error);
		}
	});

	router.get('/:artefactID/distributions/:distributionID', async (request, response, next) => {
		try {
			const artefactId = requirePathParam(request, 'artefactID');
			const distributionId = requirePathParam(request, 'distributionID');
			const query = parseCollectionQuery(request);
			const distribution = await service.getDistribution(artefactId, distributionId);

			if (distribution === null) {
				throw new HttpError(
					404,
					'distribution_not_found',
					`Distribution ${distributionId} not found for artefact ${artefactId}`,
				);
			}

			const body = toJsonLd(
				{
					'@context': artefactsContext,
					...toDistributionJsonLd(distribution),
				},
				query.display,
			);

			const formatted = sendByFormat(request, body, query.format);
			response.status(200).type(formatted.contentType).send(formatted.body);
		} catch (error) {
			next(error);
		}
	});

	router.get('/:artefactID/record', async (request, response, next) => {
		try {
			const artefactId = requirePathParam(request, 'artefactID');
			const query = parseCollectionQuery(request);
			const record = await service.getRecord(artefactId);
			if (record === null) {
				throw new HttpError(404, 'record_not_found', `Record not found: ${artefactId}`);
			}

			const body = toJsonLd(
				{
					'@context': artefactsContext,
					'@id': `/records/${encodeURIComponent(record.artefactId)}`,
					'@type': 'mod:SemanticArtefactCatalogRecord',
					'dcterms:identifier': record.artefactId,
					'dcterms:created': record.created,
					'dcterms:modified': record.modified,
				},
				query.display,
			);

			const formatted = sendByFormat(request, body, query.format);
			response.status(200).type(formatted.contentType).send(formatted.body);
		} catch (error) {
			next(error);
		}
	});

	router.get('/:artefactID/resources', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'owl:Class');
	});

	router.get('/:artefactID/resources/classes', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'owl:Class');
	});

	router.get('/:artefactID/resources/concepts', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skos:Concept');
	});

	router.get('/:artefactID/resources/properties', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'rdf:Property');
	});

	router.get('/:artefactID/resources/individuals', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'owl:NamedIndividual');
	});

	router.get('/:artefactID/resources/schemes', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skos:ConceptScheme');
	});

	router.get('/:artefactID/resources/collections', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skos:Collection');
	});

	router.get('/:artefactID/resources/labels', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skosxl:Label');
	});

	router.get('/:artefactID/resources/:resourceID', async (request, response, next) => {
		try {
			const artefactId = requirePathParam(request, 'artefactID');
			const resourceId = requirePathParam(request, 'resourceID');
			const query = parseCollectionQuery(request);
			const resource = await service.getResource(artefactId, resourceId);
			if (resource === null) {
				throw new HttpError(
					404,
					'resource_not_found',
					`Resource ${resourceId} not found for artefact ${artefactId}`,
				);
			}

			const body = toJsonLd(
				{
					'@context': artefactsContext,
					...toResourceJsonLd(resource),
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

async function respondResourceCollection(
	service: Pick<ModApiService, 'listResources'>,
	request: Request,
	response: Response,
	next: NextFunction,
	resourceType: string,
): Promise<void> {
	try {
		const artefactId = requirePathParam(request, 'artefactID');
		const query = parseCollectionQuery(request);
		const resources = await service.listResources(
			artefactId,
			{
				page: query.page,
				pageSize: query.pageSize,
			},
			resourceType,
		);

		if (resources.totalItems === 0) {
			throw new HttpError(404, 'resource_not_found', `Artefact not found: ${artefactId}`);
		}

		const payload = paginate(
			request,
			resources.members.map((entry) => toResourceJsonLd(entry)),
			resources.totalItems,
			query.page,
			query.pageSize,
		);

		const body = toJsonLd(
			{
				'@context': artefactsContext,
				...payload,
			},
			query.display,
		);

		const formatted = sendByFormat(request, body, query.format);
		response.status(200).type(formatted.contentType).send(formatted.body);
	} catch (error) {
		next(error);
	}
}

function toArtefactJsonLd(artefact: ArtefactEntry): Record<string, unknown> {
	return {
		'@id': `/artefacts/${encodeURIComponent(artefact.id)}`,
		'@type': 'mod:SemanticArtefact',
		'dcterms:identifier': artefact.id,
		'dcterms:title': artefact.title,
		'dcterms:description': artefact.description,
		'dcterms:creator': artefact.creator,
		'dcterms:license': artefact.license,
		'owl:versionIRI': artefact.versionIRI,
		'dcterms:modified': artefact.modified,
		'mod:acronym': artefact.id,
	};
}

function toDistributionJsonLd(distribution: DistributionEntry): Record<string, unknown> {
	return {
		'@id': `/artefacts/${encodeURIComponent(distribution.artefactId)}/distributions/${encodeURIComponent(distribution.id)}`,
		'@type': 'dcat:Distribution',
		'dcterms:identifier': distribution.id,
		'dcterms:title': distribution.title,
		'dcat:mediaType': distribution.mediaType,
		'dcat:downloadURL': distribution.downloadURL,
		'dcterms:modified': distribution.modified,
		'mod:isLatest': distribution.isLatest,
	};
}

function toResourceJsonLd(resource: ResourceEntry): Record<string, unknown> {
	return {
		'@id': `/artefacts/${encodeURIComponent(resource.artefactId)}/resources/${encodeURIComponent(resource.id)}`,
		'@type': resource.resourceType,
		'dcterms:identifier': resource.accession,
		'rdfs:label': resource.label,
		'dcterms:description': resource.definition,
		'owl:deprecated': resource.isObsolete,
	};
}

function requirePathParam(request: Request, key: string): string {
	const value = request.params[key];
	if (value === undefined || value.trim().length === 0) {
		throw new HttpError(400, 'missing_path_param', `Missing required path parameter: ${key}`);
	}

	return value;
}

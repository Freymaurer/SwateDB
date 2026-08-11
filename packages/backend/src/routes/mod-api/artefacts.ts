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

	/**
	 * @openapi
	 * /artefacts:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get information about all semantic artefacts
	 *     operationId: getArtefacts
	 *     parameters:
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *       - $ref: '#/components/parameters/displaySemanticArtefact'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/artefacts'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

	/**
	 * @openapi
	 * /artefacts/{artefactID}:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get information about a semantic artefact
	 *     operationId: getArtefact
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/displaySemanticArtefact'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/artefact'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

	/**
	 * @openapi
	 * /artefacts/{artefactID}/distributions:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get information about a semantic artefact's distributions
	 *     operationId: getArtefactDistributions
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *       - $ref: '#/components/parameters/display'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/distributions'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

	/**
	 * @openapi
	 * /artefacts/{artefactID}/distributions/latest:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get information about a semantic artefact's latest distribution
	 *     operationId: getArtefactDistributionsLatest
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/display'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/distribution'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

	/**
	 * @openapi
	 * /artefacts/{artefactID}/distributions/{distributionID}:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get information about a semantic artefact's distribution
	 *     operationId: getArtefactDistribution
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/distributionID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/display'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/distribution'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

	/**
	 * @openapi
	 * /artefacts/{artefactID}/record:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get information about a semantic artefact catalog record
	 *     operationId: getArtefactRecord
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/display'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/record'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all the resources within an artefact
	 *     operationId: getArtefactResources
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/resources'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'owl:Class');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/classes:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all owl:Classes within an artefact
	 *     operationId: getArtefactClasses
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/classes'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/classes', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'owl:Class');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/concepts:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all skos:Concept within an artefact
	 *     operationId: getArtefactConcepts
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/concepts'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/concepts', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skos:Concept');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/properties:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all the rdf:Property within an artefact
	 *     operationId: getArtefactProperties
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/properties'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/properties', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'rdf:Property');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/individuals:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all the instances (owl named individual) within an artefact
	 *     operationId: getArtefactIndividuals
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/individuals'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/individuals', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'owl:NamedIndividual');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/schemes:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all the skos:ConceptScheme within an artefact
	 *     operationId: getArtefactSchemes
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/schemes'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/schemes', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skos:ConceptScheme');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/collections:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all the skos:Collection within an artefact
	 *     operationId: getArtefactCollections
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/collections'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/collections', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skos:Collection');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/labels:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a list of all the skos-xl:Label within an artefact
	 *     operationId: getArtefactLabels
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/resources'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
	router.get('/:artefactID/resources/labels', async (request, response, next) => {
		await respondResourceCollection(service, request, response, next, 'skosxl:Label');
	});

	/**
	 * @openapi
	 * /artefacts/{artefactID}/resources/{resourceID}:
	 *   get:
	 *     tags:
	 *       - Artefact
	 *     summary: Get a specific resource from within an artefact
	 *     operationId: getArtefactResource
	 *     parameters:
	 *       - $ref: '#/components/parameters/artefactID'
	 *       - $ref: '#/components/parameters/resourceID'
	 *       - $ref: '#/components/parameters/format_param'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/resource'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 */
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

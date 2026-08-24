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

	/**
	 * @openapi
	 * /search:
	 *   get:
	 *     tags:
	 *       - Search
	 *     summary: Search metadata and content across all semantic artefacts
	 *     description: |
	 *       Performs a full-text search across all ontologies in the catalogue, returning
	 *       results from both **metadata** (ontology names, titles, descriptions) and
	 *       **content** (term names, definitions).
	 *
     *       **Search behaviour:**
     *       - Full-text search via Neo4j full-text indexes (tokenized, case-insensitive).
     *       - Searching `instrument` matches fields containing the `instrument` token.
     *       - Multi-word queries like `cell culture` match any record whose searched fields
     *         contain both words as tokens, in any order or field.
     *       - Results are sorted by relevance score (descending), then alphabetically by label.
	 *       - An empty or missing `q` parameter returns a `400 Bad Request`.
	 *
	 *       **Result shape:**
	 *       Each result entry includes:
	 *       - `dcterms:identifier` — the ontology `name` (metadata) or term `accession` (content).
	 *       - `dcterms:title` — the ontology title or term name.
	 *       - `dcterms:description` — the ontology or term description/definition.
	 *       - `mod:resultType` — `"metadata"` for ontology-level hits, `"content"` for term-level hits.
	 *       - `mod:artefact` — the parent ontology name.
	 *       - `@id` — a resolvable resource URL:
	 *         - Metadata results link to `/artefacts/{artefactID}`.
	 *         - Content results link to `/artefacts/{artefactID}/resources/{resourceID}`.
	 *
	 *       **Pagination:**
	 *       - Default page size is 50. Max page size is 200.
	 *       - The response includes `hydra:view` with `first`, `last`, `next`, and `previous`
	 *         page links.
	 *       - Requesting a page beyond the last available page returns an empty `member`
	 *         array with the correct `totalItems`.
	 *
	 *       **Empty results:**
	 *       When no matches are found the response body contains `totalItems: 0` and an
	 *       empty `member` array. This is **not** a 404 — the catalogue exists but the
	 *       search yielded no hits.
	 *
	 *       **Example usage:**
	 *
	 *       Single-word search for terms relating to instrumentation:
	 *       ```
	 *       GET /search?q=instrument&page=1&pagesize=10&format=jsonld
	 *       ```
	 *
	 *       Multi-word search narrowing results:
	 *       ```
	 *       GET /search?q=cell culture&page=1&pagesize=20&format=jsonld
	 *       ```
	 *
	 *       Search with explicit display field filtering:
	 *       ```
	 *       GET /search?q=assay&display=dcterms:title,dcterms:identifier&format=jsonld
	 *       ```
	 *
	 *       HTML response (browser-friendly):
	 *       ```
	 *       GET /search?q=gene&format=html
	 *       ```
	 *     operationId: search
	 *     parameters:
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/query'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *       - $ref: '#/components/parameters/display'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/searchResult'
	 *       '400':
	 *         description: Missing or empty search query
	 *         content:
	 *           application/ld+json:
	 *             schema:
	 *               $ref: '#/components/schemas/error_message'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 *       '406':
	 *         description: Requested format is not supported
	 *         content:
	 *           application/ld+json:
	 *             schema:
	 *               $ref: '#/components/schemas/error_message'
	 *     x-code-samples:
	 *       - lang: shell
	 *         label: 'Search for instrument terms (JSON-LD)'
	 *         source: |
	 *           curl -s 'http://localhost:3000/search?q=instrument&page=1&pagesize=5&format=jsonld'
	 *       - lang: shell
	 *         label: 'Search for instrument in HTML format'
	 *         source: |
	 *           curl -s 'http://localhost:3000/search?q=instrument&format=html'
	 */
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

	/**
	 * @openapi
	 * /search/content:
	 *   get:
	 *     tags:
	 *       - Search
	 *     summary: Search content (terms, classes, concepts) across all semantic artefacts
	 *     description: |
	 *       Searches **only the content** of ontologies — individual terms, classes,
	 *       concepts, properties, and individuals. Does **not** return ontology-level
	 *       metadata matches.
	 *
     *       **What is searched:**
     *       - Term `name` (the human-readable label). Definitions are **not** searched.
     *
     *       **What is NOT searched:**
     *       - Term definitions, ontology names, titles, or descriptions (use `/search/metadata`
     *         for ontology metadata).
     *
     *       **Search behaviour:**
     *       - Full-text search via the `TermName` index (tokenized, case-insensitive).
     *       - Searching `instrument` matches terms whose name contains the `instrument` token.
     *       - Results are sorted by relevance score (descending), then alphabetically by label.
	 *
	 *       **Result shape:**
	 *       Each result entry includes:
	 *       - `dcterms:identifier` — the term accession (e.g. `OBI:0000400`).
	 *       - `dcterms:title` — the term name/label.
	 *       - `dcterms:description` — the term definition.
	 *       - `mod:resultType` — always `"content"`.
	 *       - `mod:artefact` — the parent ontology name (e.g. `obi`).
	 *       - `@id` — links to `/artefacts/{artefactID}/resources/{resourceID}`.
	 *
	 *       **Pagination:**
	 *       - Default page size is 50. Max page size is 200.
	 *       - The response includes `hydra:view` with page navigation links.
	 *
	 *       **Example usage:**
	 *
	 *       Find terms matching `instrument`:
	 *       ```
	 *       GET /search/content?q=instrument&page=1&pagesize=10&format=jsonld
	 *       ```
	 *
	 *       Find classes matching `temperature`:
	 *       ```
	 *       GET /search/content?q=temperature&page=1&pagesize=20&format=jsonld
	 *       ```
	 *
	 *       Paginate through large result sets:
	 *       ```
	 *       GET /search/content?q=cell&page=3&pagesize=50&format=jsonld
	 *       ```
	 *     operationId: searchContent
	 *     parameters:
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/query'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/searchResultContent'
	 *       '400':
	 *         description: Missing or empty search query
	 *         content:
	 *           application/ld+json:
	 *             schema:
	 *               $ref: '#/components/schemas/error_message'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 *       '406':
	 *         description: Requested format is not supported
	 *         content:
	 *           application/ld+json:
	 *             schema:
	 *               $ref: '#/components/schemas/error_message'
	 *     x-code-samples:
	 *       - lang: shell
	 *         label: 'Search content for instrument'
	 *         source: |
	 *           curl -s 'http://localhost:3000/search/content?q=instrument&page=1&pagesize=10&format=jsonld'
	 *       - lang: shell
	 *         label: 'Search content for tissue'
	 *         source: |
	 *           curl -s 'http://localhost:3000/search/content?q=tissue&page=1&pagesize=5&format=jsonld'
	 */
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

	/**
	 * @openapi
	 * /search/metadata:
	 *   get:
	 *     tags:
	 *       - Search
	 *     summary: Search metadata (ontologies, artefacts) across the catalogue
	 *     description: |
	 *       Searches **only the metadata** of ontologies — their names, titles, and
	 *       descriptions. Does **not** return individual term/class hits.
	 *
	 *       **What is searched:**
	 *       - Ontology `name` (the internal identifier, e.g. `obi`, `cl`).
	 *       - Ontology `title` (the human-readable display name).
	 *       - Ontology `description` (the textual description of the ontology).
	 *
	 *       **What is NOT searched:**
	 *       - Individual terms, classes, or concepts (use `/search/content` for those).
	 *
     *       **Search behaviour:**
     *       - Full-text search via the `OntologyMetadata` index (tokenized,
     *         case-insensitive).
     *       - Searching `bio` matches ontologies whose name, title, or description contains
     *         the `bio` token.
     *       - Results are sorted by relevance score (descending), then alphabetically by name.
	 *
	 *       **Result shape:**
	 *       Each result entry includes:
	 *       - `dcterms:identifier` — the ontology name.
	 *       - `dcterms:title` — the ontology title.
	 *       - `dcterms:description` — the ontology description.
	 *       - `mod:resultType` — always `"metadata"`.
	 *       - `mod:artefact` — same as the ontology name.
	 *       - `@id` — links to `/artefacts/{artefactID}`.
	 *
	 *       **Pagination:**
	 *       - Default page size is 50. Max page size is 200.
	 *       - The response includes `hydra:view` with page navigation links.
	 *
	 *       **Example usage:**
	 *
	 *       Find ontologies whose metadata mentions `assay`:
	 *       ```
	 *       GET /search/metadata?q=assay&page=1&pagesize=10&format=jsonld
	 *       ```
	 *
	 *       Find ontologies by name pattern:
	 *       ```
	 *       GET /search/metadata?q=obi&page=1&pagesize=20&format=jsonld
	 *       ```
	 *
	 *       Combine with display filtering to get only titles:
	 *       ```
	 *       GET /search/metadata?q=chemistry&display=dcterms:title&format=jsonld
	 *       ```
	 *
	 *       Browse all ontologies with a partial name match:
	 *       ```
	 *       GET /search/metadata?q=onto&page=1&pagesize=50&format=html
	 *       ```
	 *     operationId: searchMetadata
	 *     parameters:
	 *       - $ref: '#/components/parameters/format_param'
	 *       - $ref: '#/components/parameters/query'
	 *       - $ref: '#/components/parameters/page'
	 *       - $ref: '#/components/parameters/pagesize'
	 *       - $ref: '#/components/parameters/display'
	 *     responses:
	 *       '200':
	 *         $ref: '#/components/responses/searchResultMetadata'
	 *       '400':
	 *         description: Missing or empty search query
	 *         content:
	 *           application/ld+json:
	 *             schema:
	 *               $ref: '#/components/schemas/error_message'
	 *       '404':
	 *         $ref: '#/components/responses/error_message'
	 *       '406':
	 *         description: Requested format is not supported
	 *         content:
	 *           application/ld+json:
	 *             schema:
	 *               $ref: '#/components/schemas/error_message'
	 *     x-code-samples:
	 *       - lang: shell
	 *         label: 'Search metadata for assay'
	 *         source: |
	 *           curl -s 'http://localhost:3000/search/metadata?q=assay&page=1&pagesize=10&format=jsonld'
	 *       - lang: shell
	 *         label: 'Search metadata for obi'
	 *         source: |
	 *           curl -s 'http://localhost:3000/search/metadata?q=obi&page=1&pagesize=20&format=jsonld'
	 */
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

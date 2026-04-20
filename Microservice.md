# Goal

Create a microservice for a community maintained neo4j graph database for ontologies. 
The microservice will allow organisation and management of the graph database based on a GitHub repository.
The microservice will implement the [MOD-API](https://fair-impact.github.io/MOD-API/) for interoperability with the [api gateway](https://ts4nfdi.github.io/api-gateway/) from ts4nfdi.
The microservice must offer OpenAPI documentation for the available API endpoints.
The microservice and all adjacent tools MUST be deployable via docker-compose and MUST be open source.

# Technical details

## Programming language

We should use a language that has support for neo4j and ontology file parsing.

### OGM (Object Graph Mapping) libraries

OGM (Object Graph Mapping) libraries are available for multiple languages and provide more robustness in a synced data model with actual database schema:
- 1. Java - official (https://neo4j.com/docs/ogm-manual/current/tutorial/)
- 2. TypeScript - community (https://themetalfleece.github.io/neogma/)
- 3. .NET - community, not sure about matureness (https://www.youtube.com/watch?v=14SVhbEFQpM, https://github.com/berrybeat/Neo4j.Berries.OGM)
- 4. Create and develop a custom OGM library.

### `.owl` and `.obo` file parsing

The microservice should be able to parse `.owl` and `.obo` files to import ontologies into the graph database.

- 1. Java - gold standard for obo and others. (https://github.com/owlcs/owlapi)
- 2. TypeScript - rdf library that can read java owl-api output. owl/obo -> owl-api -> rdf format -> rdflib.js (https://github.com/linkeddata/rdflib.js/)
- 3. dotNetRDF (and OBO.NET) - Either mimic TypeScript approach and use owl-api to transform readable format or use dotNetRDF for owl and OBO.NET for obo, which then must be unified into a common model for db transfer (https://dotnetrdf.org/, https://github.com/CSBiology/OBO.NET)


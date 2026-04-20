# Goal

Create a microservice for a community maintained neo4j graph database for ontologies.

- The microservice will allow organisation and management of the graph database based on a GitHub repository.
- The microservice will implement the [MOD-API](https://fair-impact.github.io/MOD-API/) for interoperability with the [api gateway](https://ts4nfdi.github.io/api-gateway/) from ts4nfdi.
- The microservice must offer OpenAPI documentation for the available API endpoints.
- The microservice and all adjacent tools MUST be deployable via docker-compose and MUST be open source.

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

## Current DB Schema

### Nodes

```json
[
  {
    "identity": -4,
    "labels": ["Ontology"],
    "properties": {
      "name": "Ontology",
      "indexes": [],
      "constraints": [
        "Constraint( id=4, name='constraint_aeb653d4', type='UNIQUENESS', schema=(:Ontology {name}), ownedIndex=3 )"
      ]
    },
    "elementId": "-4"
  },
  {
    "identity": -5,
    "labels": ["Term"],
    "properties": {
      "name": "Term",
      "indexes": ["name", "definition", "name,definition"],
      "constraints": []
    },
    "elementId": "-5"
  }
]
```

### Relationships

Each term has one: :Term -CONTAINED_IN> :Ontology relationship, and multiple relationships to other terms, including :Term -has_part> :Term, :Term -part_of> :Term, :Term -located_in> :Term, etc. The relationships are not limited to these examples and can include any relevant relationships between terms in the ontology. The specific relationships and their properties will depend on the structure and content of the ontology being represented in the graph database. 

```json
{
  "identity": -199,
  "start": -8,
  "end": -7,
  "type": "CONTAINED_IN",
  "properties": {
    "name": "CONTAINED_IN"
  },
  "elementId": "-199",
  "startNodeElementId": "-8",
  "endNodeElementId": "-7"
},
```

Some examples for :Term -> :Term relationships include:

<details>
<summary>Example relationships between terms</summary>

```json
[
  {
    "identity": -293,
    "start": -8,
    "end": -8,
    "type": "determined by part of",
    "properties": {
      "name": "determined by part of"
    },
    "elementId": "-293",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -230,
    "start": -8,
    "end": -8,
    "type": "has_column",
    "properties": {
      "name": "has_column"
    },
    "elementId": "-230",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -287,
    "start": -8,
    "end": -8,
    "type": "starts during",
    "properties": {
      "name": "starts during"
    },
    "elementId": "-287",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -292,
    "start": -8,
    "end": -8,
    "type": "characteristic of part of",
    "properties": {
      "name": "characteristic of part of"
    },
    "elementId": "-292",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -238,
    "start": -8,
    "end": -8,
    "type": "has quality",
    "properties": {
      "name": "has quality"
    },
    "elementId": "-238",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -251,
    "start": -8,
    "end": -8,
    "type": "connects",
    "properties": {
      "name": "connects"
    },
    "elementId": "-251",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -280,
    "start": -8,
    "end": -8,
    "type": "preceded by",
    "properties": {
      "name": "preceded by"
    },
    "elementId": "-280",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -273,
    "start": -8,
    "end": -8,
    "type": "process has causal agent",
    "properties": {
      "name": "process has causal agent"
    },
    "elementId": "-273",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -208,
    "start": -8,
    "end": -8,
    "type": "has_part",
    "properties": {
      "name": "has_part"
    },
    "elementId": "-208",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -241,
    "start": -8,
    "end": -8,
    "type": "located in",
    "properties": {
      "name": "located in"
    },
    "elementId": "-241",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  },
  {
    "identity": -207,
    "start": -8,
    "end": -8,
    "type": "part_of",
    "properties": {
      "name": "part_of"
    },
    "elementId": "-207",
    "startNodeElementId": "-8",
    "endNodeElementId": "-8"
  }
]
```

</details>

### Indexes and constraints

This was created via `:schema`

| Index Name            | Type     | Uniqueness | EntityType   | LabelsOrTypes  | Properties               |
|-----------------------|----------|------------|--------------|----------------|--------------------------|
| TermDefinition        | FULLTEXT |            | NODE         | [ "Term" ]     | [ "definition" ]         |
| TermName              | FULLTEXT |            | NODE         | [ "Term" ]     | [ "name" ]               |
| TermNameAndDefinition | FULLTEXT |            | NODE         | [ "Term" ]     | [ "name", "definition" ] |
| constraint_68af9dff   | RANGE    |            | NODE         | [ "Term" ]     | [ "accession" ]          |
| constraint_aeb653d4   | RANGE    |            | NODE         | [ "Ontology" ] | [ "name" ]               |
| index_343aff4e        | LOOKUP   |            | NODE         | null           | null                     |
| index_f7700477        | LOOKUP   |            | RELATIONSHIP | null           | null                     |


| Constraint Name     | Type       | EntityType | LabelsOrTypes  | Properties |
|---------------------|------------|------------|----------------|------------|
| constraint_aeb653d4 | UNIQUENESS | NODE       | [ "Ontology" ] | [ "name" ] |

:::IMPORTANT
This schema might require an additional constraint on the `Term` nodes to ensure that each term has a unique identifier (e.g., `accession`) to prevent duplicate entries in the graph database. This would help maintain data integrity and consistency when importing ontologies.
:::

# Features

## General

- All parts must be containerized and deployable via docker-compose. 
- The only sources required for a full start up must be configurable via docker-compose file and fully recoverable from the connected ontology GitHub repository. This means that the microservice should be able to initialize and populate the graph database with the necessary data from the GitHub repository without requiring any additional manual setup or configuration steps. This ensures that the microservice can be easily deployed and maintained, and that all necessary data is stored in a centralized location (the GitHub repository) for easy access and version control.

## GitHub repository

### Goal

Users and Admins should be able to set up a webhook for a GitHub repository containing ontology files. The microservice will listen for events from the GitHub repository and trigger the import process when changes are detected in the ontology files. This allows for seamless integration and automatic updates of the graph database whenever changes are made to the ontology files in the GitHub repository.

### Details

- The microservice will provide an API endpoint for users and admins to configure the webhook for their GitHub repository.
- The microservice MUST check for a "config" file with a specific name to determine which files to import and how to process them. 
  - The microserive should have a configurable setting via "config" file to determine regex file patterns for which files to import AND not import. 
- The microservice MUST be able to import external ontologies by their raw url. This can be done by defining a specific "externals" file with the relevant urls or as argument in the "config" file. The microservice should then fetch the external ontologies from the provided urls and import them into the graph database.

## GitHub repository and CI

### Goal

The repository should include a CI workflow template (tool + setup example) for users to easily set up a unified CI workflow in support of the overall tool goal.

### Details

- Ensure non-external ontology correctness (readability, no duplicate ids) as CI on PRs against main branch.
- Include issue templates for users to request new Terms with information about the term, its definition, and any relevant relationships to other terms in the ontology. This will help streamline the process of adding new terms to the ontology and ensure that all necessary information is provided for each term.
- (optional) automated PR creation for new Terms requested via issue template. New Term id should be generated automatically based on existing terms and (optional) settings in "config" file.
- CI tools should reuse the same parsing logic as the microservice to ensure consistency between the CI checks and the actual import process.

## Server Database backend

### Goal

Use neo4j as the graph database backend for storing and managing the ontologies. The microservice will interact with the neo4j database to perform operations such as importing ontology data, querying the graph, and managing the schema.

In addition it must implement the MOD-API for interoperability with the api gateway from ts4nfdi. 

### Details

- The microservice MUST be able to read .owl and .obo files, parse their contents, and import the relevant data into the graph database according to the defined schema. This includes creating nodes for ontologies and terms, as well as establishing relationships between terms based on the structure of the ontology files. The microservice MUST also handle any necessary data transformations or mappings to ensure that the imported data is consistent with the existing data in the graph database.
- The microservice MUST ensure indexing and constraints are properly applied on startup.
- The microservice should be designed to handle large ontology files and ensure that the import process is efficient and does not cause performance issues for the graph database. This may involve implementing batching or streaming techniques to process the ontology files in smaller chunks, as well as optimizing the database operations to minimize the impact on performance and parallelizing the import process where possible.
- The microservice should include a authentiation mechanism to ensure only authorized users can configure the push and trigger the import process. This could involve implementing a simple authentication system or integrating with an existing authentication provider (e.g., OAuth, JWT) to secure access to the microservice's API endpoints and frontend interface. Or a whitelist of allowed GitHub repositories that can trigger the push, ensuring that only trusted sources can initiate the import process.

## Frontend

### Goal

Give feedback on import and request status to users and admins. 

### Details

- The microservice MUST include a minimal frontend interface for users and admins to view the status of the webhook, and monitor the import process. This interface should be user-friendly and provide clear information about the current state of the graph database and any recent changes.
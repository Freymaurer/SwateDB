package com.swatedb.parser;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.swatedb.parser.model.OntologyMetadata;
import com.swatedb.parser.model.ParsedOntology;
import com.swatedb.parser.model.ParsedRelation;
import com.swatedb.parser.model.ParsedTerm;
import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLAnnotation;
import org.semanticweb.owlapi.model.OWLAnnotationValue;
import org.semanticweb.owlapi.model.OWLClass;
import org.semanticweb.owlapi.model.OWLClassExpression;
import org.semanticweb.owlapi.model.OWLLiteral;
import org.semanticweb.owlapi.model.OWLObjectIntersectionOf;
import org.semanticweb.owlapi.model.OWLObjectPropertyExpression;
import org.semanticweb.owlapi.model.OWLObjectSomeValuesFrom;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyCreationException;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.model.parameters.Imports;
import org.semanticweb.owlapi.search.EntitySearcher;

public final class OntologyParser {
    private static final ObjectMapper JSON =
        new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    private OntologyParser() {
    }

    public static String parseToJson(String filePath) {
        if (filePath == null || filePath.isBlank()) {
            throw new ParserException("Ontology file path is required.");
        }

        final Path path = Paths.get(filePath).toAbsolutePath().normalize();
        final File ontologyFile = path.toFile();
        if (!ontologyFile.exists() || !ontologyFile.isFile()) {
            throw new ParserException("Ontology file does not exist: " + path);
        }

        final String normalized = ontologyFile.getName().toLowerCase(Locale.ROOT);
        if (!normalized.endsWith(".obo") && !normalized.endsWith(".owl")) {
            throw new ParserException("Unsupported ontology format for file: " + ontologyFile.getName());
        }

        try {
            final OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
            final OWLOntology ontology = manager.loadOntologyFromOntologyDocument(ontologyFile);
            final ParsedOntology parsedOntology = toParsedOntology(ontology);
            return JSON.writeValueAsString(parsedOntology);
        } catch (OWLOntologyCreationException e) {
            throw new ParserException("Unable to parse ontology document: " + path, e);
        } catch (JsonProcessingException e) {
            throw new ParserException("Unable to serialize ontology payload: " + path, e);
        } catch (Exception e) {
            throw new ParserException("Unexpected error parsing ontology document: " + path, e);
        }
    }

    private static ParsedOntology toParsedOntology(OWLOntology ontology) {
        final ParsedOntology parsed = new ParsedOntology();
        parsed.setMetadata(extractMetadata(ontology));
        parsed.setName(extractOntologyName(ontology, parsed.getMetadata()));
        parsed.setVersion(extractOntologyVersion(ontology, parsed.getMetadata()));

        final List<ParsedTerm> terms = ontology
            .getClassesInSignature(Imports.INCLUDED)
            .stream()
            .map(clazz -> toParsedTerm(ontology, clazz))
            .sorted(Comparator.comparing(ParsedTerm::getAccession, Comparator.nullsLast(String::compareTo)))
            .toList();

        parsed.setTerms(new ArrayList<>(terms));
        return parsed;
    }

    private static ParsedTerm toParsedTerm(OWLOntology ontology, OWLClass clazz) {
        final List<OWLAnnotation> annotations = EntitySearcher.getAnnotations(clazz, ontology).toList();

        final ParsedTerm parsedTerm = new ParsedTerm();
        parsedTerm.setAccession(
            firstNonBlank(
                findAnnotationValue(annotations, "id"),
                toIdentifier(clazz.getIRI())
            )
        );
        parsedTerm.setName(firstNonBlank(findAnnotationValue(annotations, "label"), parsedTerm.getAccession()));
        parsedTerm.setDefinition(findDefinition(annotations));
        parsedTerm.setObsolete(isObsolete(annotations));
        parsedTerm.setSynonyms(extractSynonyms(annotations));
        parsedTerm.setRelationships(extractRelationships(ontology, clazz));
        return parsedTerm;
    }

    private static List<ParsedRelation> extractRelationships(OWLOntology ontology, OWLClass clazz) {
        final Set<String> unique = new LinkedHashSet<>();
        final List<ParsedRelation> relations = new ArrayList<>();

        ontology.getSubClassAxiomsForSubClass(clazz).forEach(axiom -> {
            collectRelationsFromExpression(axiom.getSuperClass(), unique, relations);
        });

        return relations;
    }

    private static void collectRelationsFromExpression(
        OWLClassExpression expression,
        Set<String> unique,
        List<ParsedRelation> relations
    ) {
        if (expression instanceof OWLClass superClass) {
            addRelation("is_a", toIdentifier(superClass.getIRI()), unique, relations);
            return;
        }

        if (expression instanceof OWLObjectSomeValuesFrom someValuesFrom) {
            final String relationType = toPropertyName(someValuesFrom.getProperty());
            final String targetAccession = extractTargetAccession(someValuesFrom.getFiller());
            addRelation(relationType, targetAccession, unique, relations);
            return;
        }

        if (expression instanceof OWLObjectIntersectionOf intersectionOf) {
            intersectionOf
                .operands()
                .forEach(operand -> collectRelationsFromExpression(operand, unique, relations));
        }
    }

    private static String extractTargetAccession(OWLClassExpression filler) {
        if (filler instanceof OWLClass fillerClass) {
            return toIdentifier(fillerClass.getIRI());
        }

        if (filler instanceof OWLObjectIntersectionOf intersectionOf) {
            return intersectionOf
                .operands()
                .filter(OWLClass.class::isInstance)
                .map(OWLClass.class::cast)
                .map(OWLClass::getIRI)
                .map(OntologyParser::toIdentifier)
                .findFirst()
                .orElse(null);
        }

        return null;
    }

    private static void addRelation(
        String relationType,
        String targetAccession,
        Set<String> unique,
        List<ParsedRelation> relations
    ) {
        if (relationType == null || relationType.isBlank()) {
            return;
        }

        if (targetAccession == null || targetAccession.isBlank()) {
            return;
        }

        final String key = relationType + "||" + targetAccession;
        if (unique.add(key)) {
            relations.add(new ParsedRelation(relationType, targetAccession));
        }
    }

    private static String toPropertyName(OWLObjectPropertyExpression expression) {
        if (expression.isAnonymous()) {
            return expression.toString();
        }

        final String shortName = shortName(expression.asOWLObjectProperty().getIRI());
        return shortName == null || shortName.isBlank() ? expression.toString() : shortName;
    }

    private static OntologyMetadata extractMetadata(OWLOntology ontology) {
        final OntologyMetadata metadata = new OntologyMetadata();

        for (OWLAnnotation annotation : ontology.getAnnotations()) {
            final String property = annotation.getProperty().getIRI().toString().toLowerCase(Locale.ROOT);
            final String value = renderValue(annotation.getValue());

            if (value == null || value.isBlank()) {
                continue;
            }

            if (property.contains("title") && metadata.getTitle() == null) {
                metadata.setTitle(value);
            } else if (property.contains("description") && metadata.getDescription() == null) {
                metadata.setDescription(value);
            } else if (property.contains("license") && metadata.getLicense() == null) {
                metadata.setLicense(value);
            } else if (property.contains("creator") && metadata.getCreator() == null) {
                metadata.setCreator(value);
            } else if (property.contains("versioniri") && metadata.getVersionIRI() == null) {
                metadata.setVersionIRI(value);
            }
        }

        if (metadata.getVersionIRI() == null) {
            ontology.getOntologyID().getVersionIRI().ifPresent(iri -> metadata.setVersionIRI(iri.toString()));
        }

        return metadata;
    }

    private static String extractOntologyName(OWLOntology ontology, OntologyMetadata metadata) {
        if (metadata.getTitle() != null && !metadata.getTitle().isBlank()) {
            return metadata.getTitle();
        }

        final Optional<IRI> iri = ontology.getOntologyID().getOntologyIRI();
        return iri.map(OntologyParser::toIdentifier).orElse("unknown");
    }

    private static String extractOntologyVersion(OWLOntology ontology, OntologyMetadata metadata) {
        if (metadata.getVersionIRI() != null && !metadata.getVersionIRI().isBlank()) {
            return metadata.getVersionIRI();
        }

        return ontology.getOntologyID().getVersionIRI().map(IRI::toString).orElse("");
    }

    private static String findDefinition(List<OWLAnnotation> annotations) {
        final String byIao = findAnnotationValue(annotations, "iao_0000115");
        if (byIao != null && !byIao.isBlank()) {
            return byIao;
        }

        return findAnnotationValue(annotations, "definition");
    }

    private static boolean isObsolete(List<OWLAnnotation> annotations) {
        return annotations.stream().anyMatch(annotation -> {
            final String property = annotation.getProperty().getIRI().toString().toLowerCase(Locale.ROOT);
            if (!property.contains("deprecated") && !property.contains("is_obsolete")) {
                return false;
            }

            final String value = renderValue(annotation.getValue());
            if (value == null) {
                return false;
            }

            final String normalized = value.trim().toLowerCase(Locale.ROOT);
            return "true".equals(normalized) || "1".equals(normalized);
        });
    }

    private static List<String> extractSynonyms(List<OWLAnnotation> annotations) {
        final LinkedHashSet<String> values = new LinkedHashSet<>();

        for (OWLAnnotation annotation : annotations) {
            final String property = annotation.getProperty().getIRI().toString().toLowerCase(Locale.ROOT);
            if (!property.contains("synonym")) {
                continue;
            }

            final String value = renderValue(annotation.getValue());
            if (value != null && !value.isBlank()) {
                values.add(value.trim());
            }
        }

        return new ArrayList<>(values);
    }

    private static String findAnnotationValue(List<OWLAnnotation> annotations, String propertyToken) {
        final String normalizedToken = propertyToken.toLowerCase(Locale.ROOT);

        for (OWLAnnotation annotation : annotations) {
            final String property = annotation.getProperty().getIRI().toString().toLowerCase(Locale.ROOT);
            if (!property.contains(normalizedToken)) {
                continue;
            }

            final String value = renderValue(annotation.getValue());
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }

        return null;
    }

    private static String renderValue(OWLAnnotationValue value) {
        if (value instanceof OWLLiteral literal) {
            return literal.getLiteral();
        }

        if (value instanceof IRI iri) {
            return iri.toString();
        }

        return value.toString();
    }

    private static String toIdentifier(IRI iri) {
        final String iriText = iri.toString();

        if (iriText.startsWith("http://purl.obolibrary.org/obo/")) {
            final String local = iriText.substring("http://purl.obolibrary.org/obo/".length());
            final int underscoreIdx = local.indexOf('_');
            if (underscoreIdx > 0 && underscoreIdx < local.length() - 1) {
                return local.substring(0, underscoreIdx) + ":" + local.substring(underscoreIdx + 1);
            }
            return local;
        }

        final String shortName = shortName(iri);
        if (shortName == null || shortName.isBlank()) {
            return iriText;
        }

        final int underscoreIdx = shortName.indexOf('_');
        if (underscoreIdx > 0 && underscoreIdx < shortName.length() - 1) {
            final String prefix = shortName.substring(0, underscoreIdx);
            final String suffix = shortName.substring(underscoreIdx + 1);
            if (prefix.matches("[A-Za-z][A-Za-z0-9]*") && suffix.matches("[0-9]+")) {
                return prefix + ":" + suffix;
            }
        }

        return shortName;
    }

    private static String shortName(IRI iri) {
        final String fragment = iri.getFragment();
        if (fragment != null && !fragment.isBlank()) {
            return fragment;
        }

        final String iriText = iri.toString();
        final int slashIdx = iriText.lastIndexOf('/');
        if (slashIdx >= 0 && slashIdx < iriText.length() - 1) {
            return iriText.substring(slashIdx + 1);
        }

        return iriText;
    }

    private static String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) {
            return first;
        }
        return second;
    }
}

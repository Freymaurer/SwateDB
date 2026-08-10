package com.swatedb.parser;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swatedb.parser.model.ParsedOntology;
import com.swatedb.parser.model.ParsedTerm;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;
import org.junit.jupiter.api.Test;

public final class OntologyParserTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void parsesSmallOboFixture() throws Exception {
        final ParsedOntology parsed = parseFixture("small.obo");
        assertNotNull(parsed);
        assertNotNull(parsed.getTerms());
        assertFalse(parsed.getTerms().isEmpty());

        final Optional<ParsedTerm> firstTerm = findTerm(parsed, "TEST:0001");
        assertTrue(firstTerm.isPresent(), "Expected TEST:0001 in parsed terms");
        assertEquals("term one", firstTerm.get().getName());
        assertEquals("definition one", firstTerm.get().getDefinition());
        assertFalse(firstTerm.get().getSynonyms().isEmpty());
    }

    @Test
    void parsesSmallOwlFixture() throws Exception {
        final ParsedOntology parsed = parseFixture("small.owl");
        assertNotNull(parsed);
        assertNotNull(parsed.getTerms());
        assertFalse(parsed.getTerms().isEmpty());

        final Optional<ParsedTerm> firstTerm = findTerm(parsed, "TEST:0001");
        assertTrue(firstTerm.isPresent(), "Expected TEST:0001 in parsed terms");
        assertEquals("term one", firstTerm.get().getName());
        assertEquals("definition one", firstTerm.get().getDefinition());
    }

    @Test
    void malformedFileThrowsParserException() {
        final String malformedPath = fixturePath("malformed.obo").toString();
        assertThrows(ParserException.class, () -> OntologyParser.parseToJson(malformedPath));
    }

    @Test
    void detectsObsoleteTerm() throws Exception {
        final ParsedOntology parsed = parseFixture("small.obo");
        final Optional<ParsedTerm> obsoleteTerm = findTerm(parsed, "TEST:0002");

        assertTrue(obsoleteTerm.isPresent(), "Expected TEST:0002 in parsed terms");
        assertTrue(obsoleteTerm.get().isObsolete(), "Expected TEST:0002 to be marked obsolete");
    }

    private static ParsedOntology parseFixture(String fixtureName) throws Exception {
        final String json = OntologyParser.parseToJson(fixturePath(fixtureName).toString());
        return JSON.readValue(json, ParsedOntology.class);
    }

    private static Optional<ParsedTerm> findTerm(ParsedOntology parsedOntology, String accession) {
        return parsedOntology
            .getTerms()
            .stream()
            .filter(term -> accession.equals(term.getAccession()))
            .findFirst();
    }

    private static Path fixturePath(String fixtureName) {
        return Paths.get("..", "..", "test-fixtures", fixtureName).toAbsolutePath().normalize();
    }
}

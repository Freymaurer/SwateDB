package com.swatedb.parser.model;

import java.util.ArrayList;
import java.util.List;

public final class ParsedTerm {
    private String accession;
    private String name;
    private String definition;
    private boolean isObsolete;
    private List<String> synonyms = new ArrayList<>();
    private List<ParsedRelation> relationships = new ArrayList<>();

    public ParsedTerm() {
    }

    public String getAccession() {
        return accession;
    }

    public void setAccession(String accession) {
        this.accession = accession;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDefinition() {
        return definition;
    }

    public void setDefinition(String definition) {
        this.definition = definition;
    }

    public boolean isObsolete() {
        return isObsolete;
    }

    public void setObsolete(boolean obsolete) {
        isObsolete = obsolete;
    }

    public List<String> getSynonyms() {
        return synonyms;
    }

    public void setSynonyms(List<String> synonyms) {
        this.synonyms = synonyms;
    }

    public List<ParsedRelation> getRelationships() {
        return relationships;
    }

    public void setRelationships(List<ParsedRelation> relationships) {
        this.relationships = relationships;
    }
}

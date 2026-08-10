package com.swatedb.parser.model;

public final class ParsedRelation {
    private String type;
    private String targetAccession;

    public ParsedRelation() {
    }

    public ParsedRelation(String type, String targetAccession) {
        this.type = type;
        this.targetAccession = targetAccession;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTargetAccession() {
        return targetAccession;
    }

    public void setTargetAccession(String targetAccession) {
        this.targetAccession = targetAccession;
    }
}

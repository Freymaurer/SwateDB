package com.swatedb.parser.model;

public final class OntologyMetadata {
    private String title;
    private String description;
    private String license;
    private String creator;
    private String versionIRI;

    public OntologyMetadata() {
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getLicense() {
        return license;
    }

    public void setLicense(String license) {
        this.license = license;
    }

    public String getCreator() {
        return creator;
    }

    public void setCreator(String creator) {
        this.creator = creator;
    }

    public String getVersionIRI() {
        return versionIRI;
    }

    public void setVersionIRI(String versionIRI) {
        this.versionIRI = versionIRI;
    }
}

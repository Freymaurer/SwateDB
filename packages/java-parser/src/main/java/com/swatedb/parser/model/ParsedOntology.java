package com.swatedb.parser.model;

import java.util.ArrayList;
import java.util.List;

public final class ParsedOntology {
	private String name;
	private String version;
	private List<ParsedTerm> terms = new ArrayList<>();
	private OntologyMetadata metadata = new OntologyMetadata();

	public ParsedOntology() {
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getVersion() {
		return version;
	}

	public void setVersion(String version) {
		this.version = version;
	}

	public List<ParsedTerm> getTerms() {
		return terms;
	}

	public void setTerms(List<ParsedTerm> terms) {
		this.terms = terms;
	}

	public OntologyMetadata getMetadata() {
		return metadata;
	}

	public void setMetadata(OntologyMetadata metadata) {
		this.metadata = metadata;
	}
}

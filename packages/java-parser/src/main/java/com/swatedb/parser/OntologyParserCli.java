package com.swatedb.parser;

public final class OntologyParserCli {
    private OntologyParserCli() {
    }

    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("Usage: java -cp <jar> com.swatedb.parser.OntologyParserCli <ontology-file>");
            System.exit(1);
            return;
        }

        try {
            final String json = OntologyParser.parseToJson(args[0]);
            System.out.println(json);
        } catch (ParserException ex) {
            System.err.println("Parser error: " + ex.getMessage());
            if (ex.getCause() != null) {
                System.err.println("Caused by: " + ex.getCause().toString());
            }
            ex.printStackTrace(System.err);
            System.exit(2);
        } catch (Exception ex) {
            System.err.println("Unexpected error: " + ex.getMessage());
            if (ex.getCause() != null) {
                System.err.println("Caused by: " + ex.getCause().toString());
            }
            ex.printStackTrace(System.err);
            System.exit(3);
        }
    }
}

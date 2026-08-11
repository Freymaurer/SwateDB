FROM maven:3.9.9-eclipse-temurin-17 AS parser-build

WORKDIR /build/java-parser

COPY packages/java-parser/pom.xml ./pom.xml
COPY packages/java-parser/src ./src

RUN mvn -q clean package -DskipTests \
    && mv /build/java-parser/target/java-parser-*-all.jar /build/java-parser/target/java-parser-all.jar

FROM node:20-alpine AS deps

WORKDIR /app

COPY . .

RUN npm ci

FROM deps AS dev

RUN apk add --no-cache openjdk21 ca-certificates

COPY --from=parser-build /build/java-parser/target/java-parser-all.jar /opt/swatedb/java-parser.jar

ENV JAVA_BRIDGE_JAR_PATH=/opt/swatedb/java-parser.jar

WORKDIR /app

CMD ["npm", "run", "dev", "--workspace=@swatedb/backend"]

FROM dev AS build

RUN rm -rf /app/packages/ontology-lib/dist /app/packages/backend/dist \
	&& rm -f /app/packages/ontology-lib/tsconfig.tsbuildinfo /app/packages/backend/tsconfig.tsbuildinfo \
	&& npm run build --workspace=@swatedb/ontology-lib \
	&& npm run build --workspace=@swatedb/backend

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV JAVA_BRIDGE_JAR_PATH=/opt/swatedb/java-parser.jar
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk

RUN apk add --no-cache openjdk21 ca-certificates

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY ci-tools/package.json ./ci-tools/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/java-parser/package.json ./packages/java-parser/package.json
COPY packages/ontology-lib/package.json ./packages/ontology-lib/package.json
COPY packages/backend/package.json ./packages/backend/package.json

RUN npm ci --omit=dev --workspace=@swatedb/ontology-lib --workspace=@swatedb/backend

COPY --from=build /app/packages/ontology-lib/dist ./packages/ontology-lib/dist
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/openapi.yaml ./openapi.yaml
COPY --from=parser-build /build/java-parser/target/java-parser-all.jar /opt/swatedb/java-parser.jar

WORKDIR /app/packages/backend

EXPOSE 3000

CMD ["node", "dist/index.js"]

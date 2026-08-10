FROM node:20-bookworm-slim AS frontend-deps

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/frontend/package.json ./packages/frontend/package.json

RUN npm ci

FROM frontend-deps AS dev

COPY packages/frontend ./packages/frontend

WORKDIR /app/packages/frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/frontend ./packages/frontend

RUN npm ci
RUN npm run build --workspace=@swatedb/frontend

FROM nginx:1.27-alpine

COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html

EXPOSE 80

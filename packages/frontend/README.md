# @swatedb/frontend

Admin dashboard for SwateDB operations.

## Features

- Health dashboard for backend and dependencies.
- Import log with selectable job details.
- Manual sync form for queuing ontology imports.
- Admin bearer token authentication persisted in browser `sessionStorage`.

## Local Development

From repository root:

```bash
npm install
npm run dev --workspace=@swatedb/frontend
```

The Vite app runs on `http://localhost:5173` and proxies API calls to `http://localhost:3000` by default.

Optional environment variables:

- `VITE_API_PROXY_TARGET`: override dev proxy target (default `http://localhost:3000`)
- `VITE_API_BASE_URL`: override direct API base URL used by fetch calls (optional)

## Production Build

```bash
npm run build --workspace=@swatedb/frontend
```

## Docker

The Docker image builds frontend assets with Node and serves the SPA via nginx using:

- SPA fallback routing (`try_files ... /index.html`)
- API proxy to backend service at `http://backend:3000`

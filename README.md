# SwateDB

SwateDB is a monorepo for an ontology-focused microservice platform backed by Neo4j.
It ingests ontology files from GitHub repositories, parses .obo/.owl data through a Java parser bridge,
and exposes MOD-API compatible endpoints for discovery and interoperability.

## Architecture

```mermaid
flowchart LR
    GH[GitHub Repository] -->|Webhook Push Events| BE[Backend Service]
    BE -->|Fetch .swatedb.yml + ontology files| GH
    BE -->|Queue Import Jobs| Q[(Redis/BullMQ)]
    Q -->|Worker| IMP[Import Pipeline]
    IMP -->|Parse via java-bridge| JP[Java Parser JAR]
    IMP -->|Upsert| N[(Neo4j)]
    FE[Frontend Admin UI] -->|REST API| BE
    BE -->|MOD-API| CLIENTS[External MOD-API Clients]
```

## Repository Layout

- [packages/java-parser/README.md](packages/java-parser/README.md): Java OWL/OBO parsing library.
- [packages/ontology-lib/README.md](packages/ontology-lib/README.md): TypeScript parsing and validation library.
- [packages/backend/README.md](packages/backend/README.md): Express microservice and Neo4j integration.
- [packages/frontend/README.md](packages/frontend/README.md): Admin dashboard for sync and status.
- [ci-tools/README.md](ci-tools/README.md): CLI tooling for ontology repository CI.

## Getting Started

Follow these steps to get the full stack running locally in development mode,
including registering a GitHub App and importing your first ontology.

### Prerequisites

- **Node.js** 20.x
- **Java** 17 (JDK for building the parser JAR)
- **Docker** with Compose v2 (`docker compose`)
- A **GitHub account** (for creating a GitHub App)
- An ontology repository on GitHub containing `.obo` or `.owl` files

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/<your-org>/SwateDB.git
cd SwateDB
npm install
```

Verify everything builds and passes checks:

```bash
npm run check
```

### 2. Build the Java Parser

The ontology-lib and backend use a shaded JAR produced by the Java parser package.
Build it once (or after any parser changes):

```bash
npm run build --workspace=@swatedb/java-parser
```

This produces `packages/java-parser/target/java-parser-0.1.0-all.jar`.
The Docker backend build handles this automatically, but running tests or local
development outside Docker requires the JAR at the path set in `JAVA_BRIDGE_JAR_PATH`.

### 3. Configure Environment Variables

Copy the example environment file and fill in the required values:

```bash
copy .env.example .env
```

The files that read `.env` are `docker-compose.yml` and `docker-compose.dev.yml`.
Each variable is documented inside `.env.example`. The critical ones:

| Variable | Purpose |
|---|---|
| `ADMIN_TOKEN` | Bearer token for admin API and frontend authentication. Generate a strong random value. |
| `NEO4J_USER` / `NEO4J_PASSWORD` | Neo4j credentials. docker-compose uses these to construct the container's initial auth. |
| `GITHUB_APP_ID` | Numeric ID of your GitHub App (see Step 4). |
| `GITHUB_PRIVATE_KEY` | PEM private key from your GitHub App. Replace real newlines with `\n`. |
| `GITHUB_WEBHOOK_SECRET` | A random secret string you choose during GitHub App registration. |

### 4. Register a GitHub App

The backend uses a GitHub App to authenticate with the GitHub API and read
ontology files from repositories.

**You have two paths — pick the one that fits your needs:**

- **Manual sync only** (recommended for local testing): no webhook required.
  You'll trigger imports through the admin UI. Steps 1-5 below, skip steps 6-7.
- **Webhook-driven** (for automatic push-triggered imports): also complete
  steps 6-7 to set up a tunnel.

#### 4a. Create the GitHub App (both paths)

1. Go to **GitHub Settings > Developer settings > GitHub Apps > New GitHub App**:
   - **GitHub App name**: `SwateDB Local Dev` (or any name you prefer)
   - **Homepage URL**: `http://localhost:8080`
   - **Webhook URL**: leave blank (manual sync only) or see step 6 below.
   - **Webhook secret**: Generate a random string:
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
     Save this as `GITHUB_WEBHOOK_SECRET` in `.env`.

2. **Repository permissions** (required):
   - **Contents**: Read-only
   - **Metadata**: Read-only (auto-selected)

3. **Subscribe to events**: It is safe to subscribe to **Push** events even if
   you skip webhook setup — the backend simply won't receive them until you
   configure a webhook URL.

4. Click **Create GitHub App**.

5. After creation, note these values and add them to your `.env`:
   - **App ID** (number at the top) → `GITHUB_APP_ID`
   - Scroll down to **Private keys**, click **Generate a private key**.
     The downloaded `.pem` file content goes into `GITHUB_PRIVATE_KEY`.
     Replace each newline with the literal string `\n` so the entire key fits on one line:
     ```
     GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIEpA...\n-----END RSA PRIVATE KEY-----
     ```
   - **Install the App** on your ontology repository:
     - Go to **Install App** in the left sidebar.
     - Choose **Only select repositories** and pick your ontology repo.
     - Click **Install**.
     - After installation, the URL will contain an **Installation ID** (numeric).
       Save this — you'll need it for manual sync.

At this point you have everything needed for manual sync.
**Skip to Step 5** unless you also want push-triggered imports.

#### 4b. Optional: Add webhook support

6. Go back to your GitHub App settings > **General** and update the
   **Webhook URL**. Since your backend runs on `localhost`, you need a tunnel.
   Use [smee.io](https://smee.io) or [ngrok](https://ngrok.com):
   - smee.io: click "Start a new channel", copy the URL.
   - ngrok: run `ngrok http 3000` and copy the forwarding URL.
   - Set the webhook URL to `https://<your-tunnel>/api/github/webhooks`

7. Make sure `GITHUB_WEBHOOK_SECRET` in `.env` matches the webhook secret you
   configured in the GitHub App. The backend verifies webhook signatures using
   this secret.

With webhooks enabled, every push to the installed repository will automatically
enqueue an import job.

### 5. Start the Full Stack

```bash
docker compose up -d --build
```

This starts four services with proper startup ordering (Neo4j and Redis must be
healthy before the backend; the backend must be healthy before the frontend):

| Service | URL |
|---|---|
| Frontend Admin UI | http://localhost:8080 |
| Backend API | http://localhost:3000 |
| Swagger / OpenAPI docs | http://localhost:3000/doc/api/ |
| Neo4j Browser | http://localhost:7474 |

To view logs from all services:

```bash
docker compose logs -f
```

To stop:

```bash
docker compose down
```

### 6. Verify with Smoke Tests

Once all services report healthy (`docker compose ps` shows all "healthy"):

```bash
npm run smoke:e2e
```

Expected output:

```
[smoke] Starting end-to-end smoke checks
[smoke] backend health: ok
[smoke] artefacts totalItems: 0
[smoke] frontend reachability: ok
[smoke] All smoke checks passed
```

(`totalItems: 0` is expected — no ontologies have been imported yet.)

### 7. Import Your First Ontology

1. Open the frontend at http://localhost:8080.
2. Enter your `ADMIN_TOKEN` value in the token prompt.
3. Go to the **Manual Sync** tab.
4. Fill in:
   - **Owner**: your GitHub username or org
   - **Repo**: the ontology repository name
   - **Ref**: `main` (or the branch with your ontology files)
   - **Installation ID**: the numeric installation ID from Step 4
5. Click **Trigger Sync** and confirm.
6. Switch to the **Import Log** tab to watch job progress.
7. When the job completes, visit http://localhost:3000/artefacts to see imported data.

**Repository requirements for import:**

- The repo must contain a `.swatedb.yml` file at its root:
  ```yaml
  import:
    include:
      - "*.obo"
      - "*.owl"
  ```
- Ontology files matching the include patterns are parsed and loaded into Neo4j.
- Re-importing the same repository is idempotent — existing terms are updated, not duplicated.

### 8. Development Mode (Hot Reload + Debug)

For active development with live reload and debugging:

```bash
npm run compose:dev:up
```

Dev overrides (on top of the base compose services):

- Backend source is mounted into the container with `tsx watch` hot reload.
- Frontend runs the Vite dev server at http://localhost:5173 with HMR.
- Backend debugger listens on port 9229 (attach with VS Code or Chrome DevTools).
- Neo4j and Redis are shared from the base `docker-compose.yml`.

Stop the dev stack:

```bash
npm run compose:dev:down
```

### Troubleshooting

**Neo4j fails to start with authentication error:**
If you changed credentials after the first run, remove the persisted data volume:

```bash
docker compose down -v
docker compose up -d --build
```

**`JAVA_BRIDGE_JAR_PATH` not found when running tests locally:**
Build the parser JAR first (`npm run build --workspace=@swatedb/java-parser`),
then set the env var or let the test runner auto-detect it.

**Webhook delivery failing (webhook setup only):**
Verify the tunnel (smee.io / ngrok) is running and forwarding to port 3000.
The webhook URL must include `/api/github/webhooks`.
Use smee.io's web dashboard to inspect delivery attempts.
Not relevant if you chose the manual-sync-only path — imports still work
through the admin UI.

**Port conflicts:**
To use different host ports, override them in `.env`:
```bash
PORT=3001
```
Then adjust `docker-compose.yml` port mappings accordingly, or use the
`--scale` approach if you need multiple instances.

## Quick Reference

### Running checks

```bash
npm run check          # lint + build + test (all workspaces)
npm run lint           # ESLint across workspaces
npm run test           # all tests
npm run build          # build all packages
```

### Docker commands

```bash
docker compose up -d --build     # production-like stack
docker compose down              # stop and remove containers
docker compose logs -f           # follow logs
docker compose down -v           # stop, remove containers AND volumes
```

## GitHub App Setup (Reference)

Detailed reference for GitHub App configuration values:

| Variable | How to obtain |
|---|---|---|
| `GITHUB_APP_ID` | Numeric ID shown at the top of your GitHub App settings page. |
| `GITHUB_PRIVATE_KEY` | Downloaded `.pem` file. Replace real newlines with `\n` for `.env`. |
| `GITHUB_WEBHOOK_SECRET` | The random string you set when creating the App (under "Webhook secret"). Must be set even for manual-sync-only usage. |
| `GITHUB_API_BASE_URL` | Only change for GitHub Enterprise Server (`https://github.example.com/api/v3`). Default: `https://api.github.com`. |

**Manual sync only?** You're done. The four variables above (plus a valid
`ADMIN_TOKEN`) are all you need. Skip the webhook section below.

#### Optional: webhook configuration

If you want push-triggered imports, use a tunnel service
([smee.io](https://smee.io) or [ngrok](https://ngrok.com)) to expose
`localhost:3000`, then set the webhook URL in your GitHub App to:

```
https://<your-tunnel>/api/github/webhooks
```

Keep the tunnel running alongside your docker-compose stack.
https://<your-tunnel>/api/github/webhooks
```

## First Sync Flow (Reference)

Manual sync parameters:

| Parameter | Description |
|---|---|
| `owner` | GitHub user or organization that owns the repository. |
| `repo` | Repository name. |
| `ref` | Branch name (e.g. `main`) or tag. |
| `installationId` | Numeric Installation ID from GitHub App install page. |

The frontend admin UI provides a form for these values. Alternatively, call the
admin API directly:

```bash
curl -X POST http://localhost:3000/api/admin/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"owner":"my-org","repo":"my-ontology","ref":"main","installationId":12345678}'
```

Repository expectations:

- A repository-level `.swatedb.yml` controls include/exclude paths and externals.
- Ontology files are discovered from include/exclude patterns and imported to Neo4j.
- Repeated imports of the same repo + ref are idempotent.

## End-to-End Smoke Check

After services are up:

```bash
npm run smoke:e2e
```

The smoke script checks:

- Backend health endpoint returns 200.
- Artefacts endpoint returns a hydra collection payload.
- Frontend root URL is reachable.

Optional environment variables for smoke target overrides are listed in .env.example.

## Development Workflow

- Keep package READMEs updated as functionality evolves.
- Follow phase-gated implementation in [Plan.md](Plan.md).
- Keep API intent aligned with [docs/Microservice.md](docs/Microservice.md) and [docs/openapi.yaml](docs/openapi.yaml).

## Contributing

1. Create a feature branch.
2. Make focused changes by phase.
3. Run `npm run check` before opening a PR.
4. Fill out the PR checklist in the pull request template.

## License

MIT

# CLIFlow

CLIFlow is a visual automation studio for composing and executing dependency-based CLI workflows. The React Flow editor provides shell, SSH, Docker, and HTTP webhook nodes; the Node.js engine evaluates graphs as DAGs, runs independent nodes in parallel, and streams terminal output over authenticated WebSockets.

## Features

- Dark workflow editor with drag-and-drop nodes, typed inspector, custom templates, minimap, and live terminal output.
- Shell, SSH, Docker container, and webhook execution adapters.
- Parallel DAG scheduler with cycle validation, failure propagation, cancellation, and JSON data chaining.
- MySQL persistence for users, sessions, and per-user workflows.
- Password-hashed accounts with opaque database-backed `HttpOnly` session cookies.
- Protected REST and WebSocket paths, workflow ownership enforcement, origin validation, authentication rate limiting, and security headers.

## Project Structure

```text
client/                     Vite + React + Tailwind + React Flow UI
server/
  src/index.js              Authenticated REST API, WebSocket and static hosting
  src/auth.js               Password accounts and session middleware
  src/db.js                 MySQL initialization and connection pool
  src/store.js              User-scoped workflow persistence
  src/engine.js             Parallel DAG scheduler and event stream
  src/executors.js          Shell, SSH, Docker and webhook runtimes
  seeds/                    Example workflow copied per account on first listing
compose.yaml                Application and MySQL service definitions
Dockerfile                  Multi-stage application container image
NODE_USAGE.md               Workflow-builder and per-node usage guide
```

## Docker Compose Setup

Prerequisite: Docker with Docker Compose.

Start the complete application and MySQL database:

```bash
cp .env.example .env
docker compose up -d --build
```

After initial image creation, the normal start command is:

```bash
docker compose up -d
```

Open `http://localhost:4000`, register an account, and load **Parallel JSON report**. The `app` container creates the MySQL tables automatically and starts only after MySQL is healthy.

## Using The Workflow Builder

1. Drag a node from the left palette onto the canvas.
2. Connect a node's bottom handle to another node's top handle. An edge means the downstream node waits for the upstream result.
3. Select each node and configure it in the inspector on the right.
4. Choose **Save changes** to persist the workflow to MySQL.
5. Choose **Run workflow** and watch live output in the execution console.

Nodes without dependencies execute immediately and in parallel. Nodes with dependencies start once all incoming nodes complete. See [NODE_USAGE.md](NODE_USAGE.md) for complete Shell, SSH, Docker, Webhook, JSON data-flow, templates, error-handling, and log-streaming instructions.

Useful commands:

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

Database data is kept in the named `cliflow_mysql` volume when containers are stopped or replaced.
MySQL password variables are applied when the volume is first initialized; changing them later requires corresponding database credential changes or a newly initialized volume.

## Development Without Containers

Prerequisites: Node.js 20 or later, npm, and a running MySQL 8 instance. Set `DB_HOST=127.0.0.1` and `CLIENT_ORIGIN=http://localhost:5173` in `.env`, then:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Authentication

Sessions are opaque random tokens. Only their SHA-256 hashes are persisted in MySQL; cookies are `HttpOnly` and `SameSite=Strict`. Passwords are hashed with bcrypt. State-changing browser requests must originate from `CLIENT_ORIGIN`.

In production, registration defaults to disabled. Create the initial allowed user from the application host:

```bash
docker compose run --rm -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD='use-a-long-random-password' app npm run create-user -w server
```

To intentionally permit registration, set `ALLOW_REGISTRATION=true`. Do not do this for an internet-facing command runner unless newly registered users are isolated from the host and from other infrastructure.

## Production Configuration

The Compose service binds the application to `127.0.0.1:4000` so it can be forwarded by a same-host HTTPS reverse proxy, and does not publish MySQL. Replace all supplied local passwords before deployment. A minimal public-server `.env` is:

```dotenv
NODE_ENV=production
CLIENT_ORIGIN=https://flow.example.com
DB_NAME=cliflow
DB_USER=cliflow
DB_PASSWORD=replace-with-a-long-random-password
MYSQL_ROOT_PASSWORD=replace-with-another-long-random-password
SESSION_DAYS=7
COOKIE_SECURE=true
ALLOW_REGISTRATION=false
```

Then run:

```bash
docker compose up -d --build
docker compose run --rm -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD='use-a-long-random-password' app npm run create-user -w server
```

Terminate TLS at a reverse proxy and forward HTTPS traffic and WebSocket upgrades to `127.0.0.1:4000`. Do not publish the Node service without TLS or publish MySQL directly to the internet.

## API

Public routes:

- `GET /api/health`
- `GET /api/auth/config`
- `POST /api/auth/register` when enabled
- `POST /api/auth/login`
- `POST /api/auth/logout`

Authenticated routes:

- `GET /api/auth/me`
- `GET/POST /api/workflows`, `GET/PUT/DELETE /api/workflows/:id`
- `POST /api/workflows/:id/run`
- `GET /api/executions/:id`, `POST /api/executions/:id/cancel`
- `ws(s)://<host>/ws?executionId=<id>` for owner-authorized terminal events

## Node Usage

The full operator guide is in [NODE_USAGE.md](NODE_USAGE.md). Key runtime facts:

- **Shell command** runs via the chosen shell (`/bin/sh -lc` by default) in the application execution environment. With Docker Compose, that means inside the `app` container.
- **SSH command** invokes `ssh` from the application execution environment. SSH keys and host verification files must exist inside that environment.
- **Docker container** invokes `docker run --rm`. The supplied public-server Compose setup intentionally has no Docker socket or Docker CLI access, so Docker nodes require a separately isolated Docker-capable execution environment.
- **Webhook** issues HTTP requests using server-side `fetch`; restrict allowed destinations before allowing untrusted operators.

When a node prints valid JSON, it becomes structured downstream output. Otherwise the engine creates `{ "stdout": "...", "stderr": "..." }`. Downstream shell, SSH, and Docker tasks receive dependency results through `FLOW_INPUT_JSON`; shell commands, SSH commands, Docker commands, webhook URLs, and webhook request bodies may use `{{input}}`.

## Security Boundary

Authentication prevents anonymous and cross-account use; it does not sandbox an authenticated user. Each authorized account can intentionally execute shell commands, containers, SSH operations, and outbound requests from the application host.

For an internet-facing deployment:

- Keep registration disabled and restrict accounts to fully trusted operators.
- Run CLIFlow as an unprivileged OS user on a dedicated host or tightly constrained container/worker environment.
- Do not mount the host Docker socket into `app`; it grants authenticated command workflows effective host control. Implement Docker execution through a separately isolated worker if needed.
- Restrict network egress and secrets available to the worker.
- Add centralized audit logging, secret management, backups, monitoring, and a reverse-proxy rate limit before operational use.

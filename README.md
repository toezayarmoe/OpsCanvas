# CLIFlow

CLIFlow is a visual automation studio for composing and executing dependency-based CLI workflows. The React Flow editor provides variables, shell, SSH, Docker, and HTTP webhook nodes; the Node.js engine evaluates graphs as DAGs, runs independent nodes in parallel, and streams terminal output over authenticated WebSockets.

## Features

- Dark workflow editor with drag-and-drop nodes, typed inspector, custom templates, minimap, workflow logs, and an optional interactive terminal.
- Variables, parser/filter, For Each, conditional, shell, SSH, Docker container, webhook, and downloadable output-file nodes.
- App-container Shell workflows include pinned `httpx`, `subfinder`, `gobuster`, and selected SecLists wordlists for authorized reconnaissance tasks.
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
  src/artifacts.js          User-scoped downloadable output-file persistence
  src/engine.js             Parallel DAG scheduler and event stream
  src/scheduler.js          Cron evaluator for scheduled workflow runs
  src/executors.js          Parser, For Each, Conditional, Shell, SSH, Docker and webhook runtimes
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
The development `.env.example` enables the authenticated interactive terminal. It runs a shell inside the `app` container, not on the Docker host.

## Using The Workflow Builder

1. Drag a node from the left palette onto the canvas.
2. Connect a node's bottom handle to another node's top handle. An edge means the downstream node waits for the upstream result.
3. Select each node and configure it in the inspector on the right.
4. Choose **Save changes** to persist the workflow to MySQL.
5. Choose **Run workflow** and watch live output in the execution console.
6. Use **Export** to download the current canvas as a `.cliflow.json` file, or **Import** to create a new workflow from a previously exported file.
7. Use **Inputs** to define workflow-level values such as `{domain}` or `{wordlist}`. These values are available to every node when the workflow runs.
8. Use **Schedule** to enable cron-based workflow runs with schedule-specific input values.

Nodes without dependencies execute immediately and in parallel. Nodes with dependencies start once all incoming nodes complete. See [NODE_USAGE.md](NODE_USAGE.md) for complete Variables, Parser/Filter, For Each, Conditional, Shell, SSH, Docker, Webhook, Output File, JSON data-flow, templates, error-handling, and log-streaming instructions.

## Feature Roadmap

| Feature | Status |
| --- | --- |
| Output parser / filter | Implemented |
| For Each node | Implemented |
| Conditional branching node | Implemented |
| Retry and timeout per node | Implemented |
| Scheduler / cron runs | Implemented |
| Run history detail page | Implemented |
| Reusable workflow templates | Implemented |

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

## Standalone Deployment

Use this path when you want to run OpsCanvas directly on the host without Docker. You still need MySQL 8 and Node.js 20 or later.

1. Install host packages:

```bash
sudo apt update
sudo apt install -y nodejs npm mysql-server nginx git build-essential python3 make g++
```

If your distribution package manager does not provide Node.js 20+, install Node.js from NodeSource or your standard server build process before running `npm ci`.

2. Create the MySQL database and user:

```sql
CREATE DATABASE cliflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cliflow'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-long-random-password';
GRANT ALL PRIVILEGES ON cliflow.* TO 'cliflow'@'127.0.0.1';
FLUSH PRIVILEGES;
```

3. Place the application at `/opt/opscanvas`:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin opscanvas
sudo mkdir -p /opt/opscanvas /etc/opscanvas
sudo rsync -a --delete ./ /opt/opscanvas/
sudo chown -R opscanvas:opscanvas /opt/opscanvas
```

4. Configure environment:

```bash
sudo cp /opt/opscanvas/deploy/standalone/opscanvas.env.example /etc/opscanvas/opscanvas.env
sudo nano /etc/opscanvas/opscanvas.env
```

Set `CLIENT_ORIGIN` to your public HTTPS origin, set `DB_PASSWORD`, keep `ALLOW_REGISTRATION=false`, and keep `ENABLE_TERMINAL=false` unless every account is fully trusted.

5. Build the app:

```bash
cd /opt/opscanvas
sudo -u opscanvas npm ci
sudo -u opscanvas npm run build
sudo -u opscanvas npm prune --omit=dev
```

6. Install and start systemd service:

```bash
sudo cp /opt/opscanvas/deploy/standalone/opscanvas.service /etc/systemd/system/opscanvas.service
sudo systemctl daemon-reload
sudo systemctl enable --now opscanvas
sudo systemctl status opscanvas
```

7. Create the first admin account:

```bash
cd /opt/opscanvas
sudo -u opscanvas env $(sudo cat /etc/opscanvas/opscanvas.env | xargs) \
  ADMIN_EMAIL=admin@example.com \
  ADMIN_PASSWORD='use-a-long-random-password' \
  npm run create-user -w server
```

8. Configure Nginx reverse proxy:

```bash
sudo cp /opt/opscanvas/deploy/standalone/opscanvas-nginx.conf /etc/nginx/sites-available/opscanvas
sudo ln -sf /etc/nginx/sites-available/opscanvas /etc/nginx/sites-enabled/opscanvas
sudo nginx -t
sudo systemctl reload nginx
```

Replace `flow.example.com` in the Nginx file with your domain and add TLS with Certbot or your normal certificate process. WebSocket paths `/ws` and `/terminal` must be proxied with upgrade headers.

Useful standalone commands:

```bash
sudo systemctl restart opscanvas
sudo journalctl -u opscanvas -f
curl http://127.0.0.1:4000/api/health
```

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
ENABLE_TERMINAL=false
```

Then run:

```bash
docker compose up -d --build
docker compose run --rm -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD='use-a-long-random-password' app npm run create-user -w server
```

Terminate TLS at a reverse proxy and forward HTTPS traffic and WebSocket upgrades to `127.0.0.1:4000`. Do not publish the Node service without TLS or publish MySQL directly to the internet.

`ENABLE_TERMINAL` defaults to `false` in Compose. Turning it on grants each authenticated operator an interactive shell inside the application runtime. Enable it on a public deployment only for fully trusted accounts on a constrained worker/container environment.

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
- `GET /api/executions?workflowId=<id>`, `GET /api/executions/:id`, `POST /api/executions/:id/cancel`
- `GET/POST /api/templates`, `POST /api/templates/:id/create-workflow`, `DELETE /api/templates/:id`
- `GET /api/artifacts?workflowId=<id>`, `GET /api/artifacts/:id/download`, `DELETE /api/artifacts/:id`
- `ws(s)://<host>/ws?executionId=<id>` for owner-authorized terminal events
- `ws(s)://<host>/terminal` for an authenticated interactive shell when explicitly enabled

## Node Usage

The full operator guide is in [NODE_USAGE.md](NODE_USAGE.md). Key runtime facts:

- **Variables** defines named values for directly connected task nodes. For example, define `{ "url": "google.com" }`, connect it to a Shell node, and run `curl https://{url}`.
- **Workflow inputs** define run-time values for the whole workflow. Configure defaults with **Inputs**, then use placeholders such as `{domain}` in any shell, SSH, Docker, webhook, or output node field that supports interpolation.
- **Parser / Filter** cleans upstream stdout or JSON arrays. Use it to split lines, remove empty values, dedupe, apply include/exclude regex filters, and pass either text lines or a JSON array to downstream nodes.
- **For Each** consumes upstream parser items, arrays, or stdout lines and runs one shell command per item with bounded concurrency. Use `{item}` in the command or read `FLOW_ITEM`.
- **Conditional** gates downstream nodes based on a JSON path, text match, regex, numeric comparison, or item count. Use two Conditional nodes with inverse rules for true and false branches.
- **Retry / timeout** settings are available on every node. Retries rerun the node after failure; timeout kills the current attempt.
- **Scheduler** runs enabled workflows from five-field cron expressions such as `*/15 * * * *` using server local time.
- **Run history** stores completed execution status, node results, and logs in MySQL. Use **History** to inspect previous runs.
- **Reusable workflow templates** save the current workflow as a user-owned template and create new workflows from it later.
- **Output file** stores connected node output or a temporary execution-workspace file as an authenticated downloadable artifact in MySQL. Shell nodes in one run may share relative files, for example `subfinder ... > file1.txt` followed by `cat file1.txt file2.txt > final_sub.txt`.
- **Shell command** runs via the chosen shell (`/bin/sh -lc` by default) in the application execution environment. With Docker Compose, that means inside the `app` container.
- **Included shell tools** in the Compose app image: ProjectDiscovery `httpx v1.9.0`, ProjectDiscovery `subfinder v2.14.0`, `gobuster v3.8.2`, and selected SecLists wordlists at `/opt/seclists` with `SECLISTS=/opt/seclists`. Use them only against assets you are authorized to assess.
- **SSH command** invokes `ssh` from the application execution environment. SSH keys and host verification files must exist inside that environment.
- **Docker container** invokes `docker run --rm`. The supplied public-server Compose setup intentionally has no Docker socket or Docker CLI access, so Docker nodes require a separately isolated Docker-capable execution environment.
- **Webhook** issues HTTP requests using server-side `fetch`; restrict allowed destinations before allowing untrusted operators.

When a node prints valid JSON, it becomes structured downstream output. Otherwise the engine creates `{ "stdout": "...", "stderr": "..." }`. Downstream shell, SSH, and Docker tasks receive dependency results through `FLOW_INPUT_JSON`; shell commands, SSH commands, Docker commands, webhook URLs, and webhook request bodies may use `{{input}}` and named `{variable}` placeholders from connected Variables nodes. Relative files written by Shell nodes are kept in a private temporary directory for that run and deleted when execution finishes unless an Output file node publishes them.

## Security Boundary

Authentication prevents anonymous and cross-account use; it does not sandbox an authenticated user. Each authorized account can intentionally execute shell commands, containers, SSH operations, and outbound requests from the application host.

For an internet-facing deployment:

- Keep registration disabled and restrict accounts to fully trusted operators.
- Run CLIFlow as an unprivileged OS user on a dedicated host or tightly constrained container/worker environment.
- Do not mount the host Docker socket into `app`; it grants authenticated command workflows effective host control. Implement Docker execution through a separately isolated worker if needed.
- Restrict network egress and secrets available to the worker.
- Keep `ENABLE_TERMINAL=false` unless trusted operators explicitly require direct shell access in the constrained runtime.
- Add centralized audit logging, secret management, backups, monitoring, and a reverse-proxy rate limit before operational use.

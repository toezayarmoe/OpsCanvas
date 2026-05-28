# CLIFlow Node Usage Guide

This guide explains how to build, connect, configure, and execute workflows in CLIFlow. It documents the behavior implemented by the current Variables, Parser / Filter, Output file, Shell command, SSH command, Docker container, and Webhook nodes.

## Start And Sign In

Start the application and MySQL with Docker Compose:

```bash
docker compose up -d
```

Open `http://localhost:4000`. In a local development deployment with registration enabled, create an account in the sign-in screen. In production, use an account created by an administrator.

## Build A Workflow

1. Select an existing workflow in the left sidebar or create a new workflow.
2. Drag a node type from the palette onto the canvas.
3. Connect the bottom output handle of an upstream node to the top input handle of a downstream node.
4. Select a node to open its inspector and set its label and execution configuration.
5. Use **Save changes** to persist the workflow.
6. Use **Run workflow** to start an execution and view live node logs in the bottom console.

## Import And Export Workflows

Use **Export** in the header to download the current canvas as a `.cliflow.json` file. The export includes node configuration, positions, edges, and custom templates; it does not include previous executions or downloadable output artifacts.

Use **Import** to select a previously exported JSON file. Import validates supported node types and connections, then creates a new workflow named with an `(imported)` suffix so it does not overwrite an existing canvas.

## Workflow Inputs

Use **Inputs** in the header to define JSON values for the whole workflow:

```json
{
  "domain": "example.com",
  "wordlist": "/opt/seclists/Discovery/Web-Content/common.txt",
  "threads": 25
}
```

When the workflow runs, CLIFlow shows the same JSON so you can adjust values for that execution. Inputs are available to every node as placeholders:

```sh
subfinder -d {domain} -silent > subdomains.txt
httpx -l subdomains.txt -silent > live-hosts.txt
gobuster dir -u https://{domain} -w {wordlist} -t {threads}
```

Input names must start with a letter or underscore and may contain letters, numbers, and underscores. Values may be strings, numbers, booleans, or `null`.

Use `Delete` or `Backspace` on a selected node, or the inspector's **Delete node** button, to remove a node and its connections.

## Execution And Data Flow

Connections define dependencies, not just drawing order:

- All nodes with no incoming connection are ready at startup and execute in parallel.
- A downstream node starts when all its upstream dependencies have completed.
- Cycles are rejected because execution requires a directed acyclic graph (DAG).
- A failed dependency causes a downstream node to be skipped unless **Run when a dependency fails** is enabled for that node.
- **Cancel** terminates running shell/SSH/Docker child processes and aborts active webhooks.

### Structured Output

If a Shell, SSH, or Docker node writes valid JSON to standard output and exits successfully, the JSON becomes its output:

```sh
printf '{"status":"ready","count":3}\n'
```

If its standard output is not valid JSON, downstream nodes receive an object containing output streams:

```json
{
  "stdout": "plain text result",
  "stderr": ""
}
```

A Webhook node parses a JSON response body as output. A non-JSON successful response becomes:

```json
{
  "status": 200,
  "body": "response text"
}
```

### Input From Earlier Nodes

For one incoming dependency, `FLOW_INPUT_JSON` and `{{input}}` represent that node's output. For multiple incoming dependencies, they contain an array shaped like:

```json
[
  {
    "nodeId": "first-node-id",
    "output": {
      "status": "ready"
    }
  },
  {
    "nodeId": "second-node-id",
    "output": {
      "count": 3
    }
  }
]
```

`FLOW_INPUT_JSON` is automatically set for Shell, SSH, and Docker nodes. `{{input}}` substitution is supported in Shell commands, SSH remote commands, Docker container commands, Webhook URLs, and Webhook request bodies.

## Variables Node

Use a Variables node to define reusable values and insert them into connected execution nodes with `{name}` placeholders.

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Label | Display name shown on the canvas and in logs. |
| Variables JSON | A JSON object whose keys become placeholder names. |
| Run when a dependency fails | Allows execution after upstream failure or skip. |

Variable names must begin with a letter or underscore and may contain letters, numbers, and underscores, such as `url`, `api_host`, or `RELEASE_1`.

### Example: Curl A Configured URL

1. Drag **Variables** to the canvas and set:

```json
{
  "url": "google.com"
}
```

2. Drag **Shell command** to the canvas and set its command:

```sh
curl https://{url}
```

3. Connect the Variables node's output handle to the Shell command node's input handle.
4. Save and run the workflow.

The command executed by the shell node is:

```sh
curl https://google.com
```

### Placeholder Scope

Named placeholders are available only to nodes that receive the Variables node as an incoming dependency. Connect one Variables node directly to each task that uses its values. Multiple connected Variables nodes are merged; if they declare the same key, the later incoming value wins.

For command nodes, `{name}` is inserted into command text before the shell runs. Use it only for operator-controlled values; do not substitute user-provided or external untrusted text into a shell command.

The following fields accept `{name}` placeholders:

- Shell **Command**
- SSH **Host**, **User**, and **Remote command**
- Docker **Image** and **Container command**
- Webhook **URL** and **Request body**

Variables node output is also visible as structured input:

```json
{
  "variables": {
    "url": "google.com"
  }
}
```

## Output File Node

Use an Output file node to turn connected task output into a durable file that can be downloaded from the workflow UI. Files are stored as user-owned MySQL artifacts; the node does not write arbitrary files onto the application server filesystem.

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Filename | Download filename, such as `google.html` or `result.json`. Path separators are not allowed. |
| Content type | MIME type sent on download, such as `text/html` or `application/json`. |
| Source | Choose connected node output or a relative file from this execution's temporary workspace. |
| File content | For connected output, the content template. The default `{{input}}` saves incoming output. |
| Workspace file path | For workspace files, a relative path such as `final_sub.txt`. |
| Run when a dependency fails | Allows the node to run after upstream failure or skip. |

Output files have a maximum size of 5 MB. They are scoped to the authenticated owner of the workflow.

### Example: Combine Files From Multiple Commands

Shell command nodes in the same workflow execution share a temporary working directory. This supports redirects and later processing steps.

Create this graph, making sure both producer nodes connect to the merge node:

```text
Variables -> Subfinder first  --\
Variables -> Subfinder second ----> Merge files -> Output file
```

Configure **Variables**:

```json
{
  "domain1": "test.com",
  "domain2": "example.com"
}
```

Configure the first two **Shell command** nodes:

```sh
subfinder -d {domain1} --silent > file1.txt
```

```sh
subfinder -d {domain2} --silent > file2.txt
```

Configure **Merge files**:

```sh
cat file1.txt file2.txt | sort -u > final_sub.txt
```

Configure **Output file**:

```text
Filename: final_sub.txt
Content type: text/plain
Source: Workspace file path
Workspace file path: final_sub.txt
```

Run the workflow and open **Outputs** to download `final_sub.txt`.

The graph connections matter: the merge command must depend on both producer nodes so it cannot run before both files have been written; the Output file node must depend on the merge command so it reads the completed final file.

`subfinder` must be installed in the execution environment. With Docker Compose, Shell nodes execute inside the `app` container; build a controlled worker/runtime that includes the CLI tools required by your workflows.

## Parser / Filter Node

Use a Parser / Filter node between producer and consumer nodes when command output needs cleanup before the next step. It can consume upstream stdout, raw strings, JSON arrays, or JSON objects with `items`, `lines`, or `results` arrays.

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Split lines | Splits text on newlines. Keep enabled for command output such as `subfinder` or `httpx`. |
| Trim values | Removes leading and trailing whitespace from each item. |
| Remove empty | Drops blank items. |
| Dedupe | Keeps only the first copy of each item. |
| Include regex | Optional JavaScript regular expression; only matching items are kept. |
| Exclude regex | Optional JavaScript regular expression; matching items are removed. |
| Limit | Optional maximum number of items; `0` means no limit. |
| Output mode | `Text lines` returns `{ "items": [...], "stdout": "...", "count": n }`; `JSON array` returns `{ "items": [...], "count": n }`. |

### Example: Clean Subdomains Before HTTP Probing

Create this graph:

```text
Shell command -> Parser / Filter -> Shell command -> Output file
```

First **Shell command**:

```sh
subfinder -d {domain} -silent
```

**Parser / Filter**:

```text
Split lines: enabled
Trim values: enabled
Remove empty: enabled
Dedupe: enabled
Include regex: ^[a-zA-Z0-9.-]+$
Output mode: Text lines
```

Second **Shell command**:

```sh
printf '%s\n' "$FLOW_INPUT_JSON" > parsed.json
node -e 'const input=JSON.parse(process.env.FLOW_INPUT_JSON); console.log(input.stdout)' > subdomains.txt
httpx -l subdomains.txt -silent > live-hosts.txt
```

Then configure **Output file** with **Source: Workspace file path** and **Workspace file path: live-hosts.txt**.

### Example: Save A Clean List Directly

Connect:

```text
Shell command -> Parser / Filter -> Output file
```

Set **Parser / Filter** output mode to **Text lines**. Configure **Output file**:

```text
Filename: cleaned.txt
Content type: text/plain
Source: Connected node output
File content: {{input}}
```

Because Text lines mode includes `stdout`, the Output file node saves the cleaned newline-separated list.

### Example: Download Curl Output

Create and connect this graph:

```text
Variables -> Shell command -> Output file
```

Set **Variables JSON**:

```json
{
  "url": "google.com"
}
```

Set the **Shell command**:

```sh
curl -L https://{url}
```

Set **Output file** fields:

```text
Filename: google.html
Content type: text/html
Source: Connected node output
File content: {{input}}
```

Run the workflow, select **Outputs** in the header, and download `google.html`. When a Shell, SSH, or Docker node produces ordinary non-JSON stdout, default `{{input}}` content stores the raw stdout. For a structured JSON result, it stores formatted JSON.

### Example: JSON Report

Connect a node that prints valid JSON to an Output file node configured as:

```text
Filename: report.json
Content type: application/json
Source: Connected node output
File content: {{input}}
```

Each successful run creates a new downloadable artifact. Use the trash action in **Outputs** to delete files no longer needed.

### Output File Security

- Filenames are download labels only; slashes, backslashes, and control characters are rejected.
- Workspace file paths must be relative and cannot escape the private execution directory.
- The application limits each stored file to 5 MB.
- Users can list, download, and delete only their own output files.
- Do not deliberately store credentials or sensitive raw command output without appropriate operational controls and retention policies.

## Shell Command Node

Use a Shell command node for local command-line tasks executed by the CLIFlow runtime.

Important: when CLIFlow runs from `compose.yaml`, the command runs inside the `app` container, not directly on the Docker host. Commands can access only tools and files included or mounted in that container.

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Label | Display name shown on the canvas and in logs. |
| Shell | Executable used to run the command; defaults to `/bin/sh`. |
| Command | Script passed as `<shell> -lc <command>`. |
| Environment JSON | Extra environment variables supplied to the command. |
| Run when a dependency fails | Allows execution after upstream failure or skip. |

### Example: Produce JSON

Drag **Shell command** onto the canvas and set:

```text
Label: Generate build metadata
Shell: /bin/sh
Command: printf '{"service":"api","version":"%s"}\n' "$RELEASE_VERSION"
Environment JSON: { "RELEASE_VERSION": "1.4.2" }
```

The node returns:

```json
{
  "service": "api",
  "version": "1.4.2"
}
```

### Example: Consume Upstream JSON

Connect an upstream node to a Shell command node and set:

```sh
printf '{"received":%s}\n' "$FLOW_INPUT_JSON"
```

Alternatively, use direct interpolation:

```sh
printf '{"received":%s}\n' '{{input}}'
```

Using `FLOW_INPUT_JSON` is preferable for shell scripts because it avoids inserting data into the command text.

### Command Failure

Any non-zero exit status fails the node. Standard output and standard error are shown in the live console and retained in the failure details.

### Included Reconnaissance Tools In Docker Compose

The supplied `app` image includes these pinned tools and wordlists for Shell command nodes:

| Tool | Version | Example command |
| --- | --- | --- |
| `subfinder` | `v2.14.0` | `subfinder -d example.com -silent > subdomains.txt` |
| `httpx` | `v1.9.0` | `httpx -l subdomains.txt -silent > live-hosts.txt` |
| `gobuster` | `v3.8.2` | `gobuster dir -u https://example.com -w "$SECLISTS/Discovery/Web-Content/common.txt"` |
| Selected SecLists wordlists | downloaded at image build time | `$SECLISTS/Discovery/Web-Content/raft-small-words.txt` |

Files written with relative paths are shared only within that workflow execution. Connect an **Output file** node configured with **Source: Workspace file path** to publish results for download, for example `live-hosts.txt`.

The image installs selected SecLists files at `/opt/seclists` and sets `SECLISTS=/opt/seclists`:

- `Discovery/Web-Content/common.txt`
- `Discovery/Web-Content/raft-small-words.txt`
- `Fuzzing/special-chars.txt`

These tools send network requests. Run them only for targets where you have authorization. `subfinder` may require configured provider API keys for some passive sources.

## SSH Command Node

Use an SSH command node to execute a command on a remote machine. CLIFlow starts the local `ssh` client and streams its output.

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Host | DNS name or IP address of the remote system. |
| User | Optional remote SSH username. |
| Port | SSH port; defaults to `22`. |
| Private key path | Path to a key readable by the CLIFlow application process. |
| Remote command | Command executed by SSH on the remote system. |
| Remote environment JSON | Variables prefixed to the remote command. |
| Run when a dependency fails | Allows execution after upstream failure or skip. |

### Required SSH Setup With Compose

The application image contains `openssh-client`, but it does not contain your private key or host verification records. Mount both read-only into the app container. For example, create `compose.override.yaml`:

```yaml
services:
  app:
    volumes:
      - ${HOME}/.ssh/cliflow_ed25519:/run/secrets/cliflow_ed25519:ro
      - ${HOME}/.ssh/known_hosts:/home/node/.ssh/known_hosts:ro
```

Restart the application:

```bash
docker compose up -d
```

Set the node's **Private key path** to:

```text
/run/secrets/cliflow_ed25519
```

Provision the `known_hosts` entry deliberately before running workflows. Do not disable host key verification for an internet-facing system.

### Example: Remote Health Command

```text
Host: server.example.com
User: deploy
Port: 22
Private key path: /run/secrets/cliflow_ed25519
Remote command: printf '{"hostname":"%s","uptime":"%s"}\n' "$(hostname)" "$(uptime -p)"
Remote environment JSON: {}
```

### Example: Pass Input To A Remote Script

Connect an earlier node, then configure:

```text
Remote command: /opt/automation/deploy-from-json "$FLOW_INPUT_JSON"
Remote environment JSON: { "DEPLOY_ENV": "staging" }
```

CLIFlow sets `FLOW_INPUT_JSON` remotely along with configured remote environment values. The remote command should print one valid JSON document when its output needs to feed another node.

### SSH Operational Notes

- Password prompts cannot be answered through the workflow UI. Use a non-interactive key or an external SSH authentication arrangement.
- An unreachable host, authentication failure, host-key verification failure, or non-zero remote command exit status fails the node.
- Values placed in **Remote environment JSON** are stored as workflow configuration; do not store credentials there.

## Docker Container Node

Use a Docker container node to run a disposable container:

```text
docker run --rm -e FLOW_INPUT_JSON=<input> ... <image> sh -lc <command>
```

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Image | Container image reference, such as `alpine:latest` or `node:20-alpine`. |
| Container command | Optional command executed with `sh -lc` inside the image. |
| Environment JSON | Additional environment variables supplied with `docker run -e`. |
| Run when a dependency fails | Allows execution after upstream failure or skip. |

### Example: Transform Upstream JSON

```text
Image: node:20-alpine
Container command: node -e 'const v=JSON.parse(process.env.FLOW_INPUT_JSON); console.log(JSON.stringify({container:true,input:v}))'
Environment JSON: {}
```

Connect another node above it; its JSON output is available in `FLOW_INPUT_JSON`.

### Public Compose Deployment Boundary

The supplied Compose deployment intentionally does not mount `/var/run/docker.sock` into the application container and does not provide host Docker access to workflows. Therefore Docker nodes will fail in that default deployment.

Mounting the host Docker socket into an internet-facing command application gives authenticated users effective control of the server. Do not enable Docker nodes by mounting the host socket on a public server. Use an isolated worker/runner with constrained credentials, networking, storage, resource limits, and image allowlists for container execution.

For trusted local development only, Docker nodes may be executed from a CLIFlow server process that has access to a Docker CLI and Docker daemon.

## Webhook Node

Use a Webhook node to call an HTTP API from the CLIFlow server runtime.

### Inspector Fields

| Field | Meaning |
| --- | --- |
| Method | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| URL | Destination URL; supports `{{input}}` substitution. |
| Headers JSON | HTTP headers added to the request. |
| Request body | Body for non-GET requests; supports `{{input}}`. |
| Run when a dependency fails | Allows execution after upstream failure or skip. |

CLIFlow defaults `content-type` to `application/json`. A `GET` request does not send a request body.

### Example: POST Upstream JSON

```text
Method: POST
URL: https://api.example.com/events
Headers JSON: { "authorization": "Bearer configured-outside-production-workflows" }
Request body: {{input}}
```

### Example: Use Input In A URL

If the preceding output is a JSON string or value suitable for the URL:

```text
Method: GET
URL: https://api.example.com/status/{{input}}
Headers JSON: {}
```

Prefer a Shell node to extract and encode an individual URL parameter when the upstream output is an object.

### Webhook Failure And Security

- Any HTTP response outside the `200` to `299` range fails the node.
- Request and response activity is written to the live execution console.
- Header values placed in a workflow are stored in MySQL. Avoid permanent API secrets in node configuration until a server-side secret-reference system is added.
- For shared or public deployments, outbound network access must be restricted to prevent requests to internal administrative or metadata endpoints.

## Custom Node Templates

Select **Create template** in the sidebar to create a reusable palette item based on the built-in node types. Drag the template onto the canvas and configure the resulting node in the inspector. Templates are stored with the workflow when you save it.

Templates are configuration conveniences; they do not introduce new execution adapters or sandboxing.

## Live Logs And Results

When a workflow runs:

- Running node state appears on the canvas.
- Standard output and standard error stream to the execution console in real time over the authenticated WebSocket connection.
- Select a node to filter output to that node.
- Successful, failed, skipped, and cancelled status is tracked per node.

Logs and execution status are intended for active workflow observation. Persist important results to a durable external destination through an approved node.

## Interactive Terminal

When `ENABLE_TERMINAL=true`, select **Terminal** in the application header to open an interactive shell backed by a pseudo-terminal. Input, terminal resizing, prompts, ANSI output, and interactive CLI behavior are streamed over an authenticated WebSocket.

Under Docker Compose, this terminal runs inside the `app` container. It can use tools installed in that image, such as `curl` and `ssh`; it is not a terminal on the Docker host.

Local development configuration:

```dotenv
ENABLE_TERMINAL=true
```

Public-server configuration:

```dotenv
ENABLE_TERMINAL=false
```

An interactive terminal grants an authenticated account general shell access in the application runtime. Keep it disabled for public deployments unless every authorized user is fully trusted and the runtime is isolated from sensitive host resources, credentials, and internal networks.

## Safe Production Use

CLIFlow executes operational commands for authenticated accounts. Authentication is an access control layer, not execution isolation.

- Disable public registration and grant accounts only to trusted operators.
- Terminate HTTPS at a reverse proxy and preserve WebSocket upgrade forwarding.
- Do not store passwords, private keys, or bearer tokens directly in workflow configuration.
- Keep SSH keys read-only and narrowly authorized on remote machines.
- Do not mount the host Docker socket into the public application container.
- Keep the interactive terminal disabled unless it is explicitly needed by fully trusted operators in an isolated runtime.
- Restrict outbound network destinations available to Webhook and SSH tasks.
- Run sensitive execution work in a dedicated, constrained worker environment before exposing the platform broadly.

import { promises as fs } from "node:fs";

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const edge = (id, source, target) => ({ id, source, target, animated: true, style: { stroke: "#34d399" } });

function commandNode(id, label, description, x, y, command, extra = {}) {
  return {
    id,
    type: "command",
    position: { x, y },
    data: {
      label,
      description,
      status: "idle",
      config: {
        shell: "/bin/sh",
        command,
        env: {},
        retryCount: 0,
        retryDelayMs: 0,
        timeoutSeconds: 60,
        ...extra,
      },
    },
  };
}

function parserNode(id, label, description, x, y, config = {}) {
  return {
    id,
    type: "parser",
    position: { x, y },
    data: {
      label,
      description,
      status: "idle",
      config: {
        splitLines: true,
        trim: true,
        removeEmpty: true,
        dedupe: true,
        includeRegex: "^https?://",
        excludeRegex: "",
        limit: 0,
        outputMode: "lines",
        ...config,
      },
    },
  };
}

function foreachNode(id, label, description, x, y, command, extra = {}) {
  return {
    id,
    type: "foreach",
    position: { x, y },
    data: {
      label,
      description,
      status: "idle",
      config: {
        shell: "/bin/sh",
        command,
        itemVariable: "item",
        concurrency: 2,
        splitLines: true,
        trim: true,
        removeEmpty: true,
        continueOnError: true,
        retryCount: 0,
        retryDelayMs: 0,
        timeoutSeconds: 600,
        ...extra,
      },
    },
  };
}

function outputNode(id, label, description, x, y, filename, contentType, sourcePath, extra = {}) {
  return {
    id,
    type: "output",
    position: { x, y },
    data: {
      label,
      description,
      status: "idle",
      config: {
        filename,
        contentType,
        sourceMode: sourcePath ? "workspace" : "input",
        sourcePath: sourcePath || "",
        content: "{{input}}",
        ...extra,
      },
    },
  };
}

const subscraper = await readJson("examples/subscraper-style-recon.cliflow.json");
const wf = subscraper.workflow;
wf.description = "Authorized recon workflow inspired by subScraper: passive subdomain collection, cleanup, live probing, JSONL technology output, and optional Nuclei/Gobuster/Nikto branches.";

const optionalNuclei = wf.nodes.find((node) => node.id === "optional-nuclei");
optionalNuclei.data.config.command = `set -eu
node -e 'const input=JSON.parse(process.env.FLOW_INPUT_JSON); const items=input.items||String(input.stdout||"").split(/\\r?\\n/).filter(Boolean); console.log(items.join("\\n"));' > live_hosts.txt
mkdir -p reports
write_status() { node -e 'console.log(JSON.stringify({tool:process.argv[1],status:process.argv[2],reason:process.argv[3]||"",findings:Number(process.argv[4]||0),timestamp:new Date().toISOString()}))' "$1" "$2" "$3" "$4"; }
if [ ! -s live_hosts.txt ]; then
  write_status nuclei skipped 'no live hosts available' 0 > reports/nuclei.jsonl
  cat reports/nuclei.jsonl
  exit 0
fi
if [ "{run_nuclei}" != "true" ]; then
  write_status nuclei disabled 'set run_nuclei=true for authorized targets' 0 > reports/nuclei.jsonl
  cat reports/nuclei.jsonl
  exit 0
fi
if command -v nuclei >/dev/null 2>&1; then
  nuclei -l live_hosts.txt -severity "{nuclei_severity}" -jsonl -o reports/nuclei.jsonl || true
  if [ ! -s reports/nuclei.jsonl ]; then write_status nuclei completed 'no findings returned' 0 > reports/nuclei.jsonl; fi
else
  write_status nuclei missing 'nuclei not installed in this runtime' 0 > reports/nuclei.jsonl
fi
cat reports/nuclei.jsonl`;
optionalNuclei.data.config.timeoutSeconds = 900;

const fingerprint = wf.nodes.find((node) => node.id === "fingerprint-servers");
fingerprint.data.config.command = `mkdir -p reports
server=$(curl -k -I -sS --max-time 8 "$FLOW_ITEM" 2>/dev/null | awk -F': ' 'tolower($1)=="server"{print $2; exit}' | tr -d '\\r')
server=\${server:-unknown}
printf '%s\\t%s\\n' "$FLOW_ITEM" "$server" >> reports/technology.tsv
node -e 'console.log(JSON.stringify({url:process.argv[1],server:process.argv[2],status:"fingerprinted",timestamp:new Date().toISOString()}))' "$FLOW_ITEM" "$server" >> reports/technology.jsonl`;

const ensureTechnology = wf.nodes.find((node) => node.id === "ensure-technology");
ensureTechnology.data.config.command = `mkdir -p reports
if [ ! -f reports/technology.tsv ]; then echo 'No live hosts to fingerprint.' > reports/technology.tsv; fi
if [ ! -f reports/technology.jsonl ]; then printf '{"tool":"fingerprint","status":"skipped","reason":"no live hosts","rows":0}\\n' > reports/technology.jsonl; fi
cat reports/technology.tsv`;

if (!wf.nodes.some((node) => node.id === "save-technology-json")) {
  wf.nodes.push(outputNode("save-technology-json", "Download technology JSONL", "Save URL/server-header mapping as JSONL for table preview", -260, 2050, "technology.jsonl", "application/jsonl", "reports/technology.jsonl", { runAfterFailure: true }));
}
if (!wf.edges.some((item) => item.id === "e21")) wf.edges.push(edge("e21", "ensure-technology", "save-technology-json"));

await writeJson("examples/subscraper-style-recon.cliflow.json", subscraper);
await writeJson("server/seeds/subscraper-style-recon.json", { id: "subscraper-style-recon", ...wf });

const targetValidateCommand = `set -eu
mkdir -p reports
TARGET='{target_url}' node <<'JS' > reports/target.json
const raw = process.env.TARGET.trim();
const value = raw.includes('://') ? raw : \`http://\${raw}\`;
let url;
try { url = new URL(value); } catch { console.error('Invalid target_url. Use http://127.0.0.1, https://example.com, or a host/IP.'); process.exit(2); }
if (!['http:', 'https:'].includes(url.protocol)) { console.error('Only http and https targets are supported.'); process.exit(2); }
url.hash = '';
const normalized = url.toString().replace(/\\/$/, '');
console.log(JSON.stringify({ target_url: normalized, hostname: url.hostname, protocol: url.protocol.slice(0, -1), started: new Date().toISOString(), note: 'authorized targets only' }));
JS
node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync("reports/target.json","utf8")); console.log(data.target_url)' > target_urls.txt
cat reports/target.json`;

const probeCommand = `set -eu
mkdir -p reports
url=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync("reports/target.json","utf8")); console.log(data.target_url)')
: > live_hosts.txt
: > reports/http_probe.jsonl
: > reports/tech_headers.txt
headers=$(mktemp)
code=$(curl -k -L -I -sS --max-time 8 -o "$headers" -w '%{http_code}' "$url" 2>/dev/null || true)
server=$(awk -F': ' 'tolower($1)=="server"{print $2; exit}' "$headers" | tr -d '\\r')
if [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 600 ] 2>/dev/null; then
  echo "$url" > live_hosts.txt
  live=true
else
  live=false
fi
{
  printf '### %s (%s)\\n' "$url" "\${code:-000}"
  cat "$headers"
  printf '\\n'
} > reports/tech_headers.txt
node -e 'console.log(JSON.stringify({url:process.argv[1],live:process.argv[2]==="true",status_code:Number(process.argv[3]||0),server:process.argv[4]||"unknown",timestamp:new Date().toISOString()}))' "$url" "$live" "\${code:-0}" "\${server:-unknown}" > reports/http_probe.jsonl
rm -f "$headers"
cat live_hosts.txt`;

const nucleiCommand = `set -eu
node -e 'const input=JSON.parse(process.env.FLOW_INPUT_JSON); const items=input.items||String(input.stdout||"").split(/\\r?\\n/).filter(Boolean); console.log(items.join("\\n"));' > live_hosts.txt
mkdir -p reports
write_status() { node -e 'console.log(JSON.stringify({tool:process.argv[1],status:process.argv[2],reason:process.argv[3]||"",findings:Number(process.argv[4]||0),timestamp:new Date().toISOString()}))' "$1" "$2" "$3" "$4"; }
if [ ! -s live_hosts.txt ]; then write_status nuclei skipped 'target is not reachable over HTTP(S)' 0 > reports/nuclei.jsonl; cat reports/nuclei.jsonl; exit 0; fi
if [ "{run_nuclei}" != "true" ]; then write_status nuclei disabled 'set run_nuclei=true for authorized targets' 0 > reports/nuclei.jsonl; cat reports/nuclei.jsonl; exit 0; fi
if command -v nuclei >/dev/null 2>&1; then
  nuclei -l live_hosts.txt -severity "{nuclei_severity}" -jsonl -o reports/nuclei.jsonl || true
  if [ ! -s reports/nuclei.jsonl ]; then write_status nuclei completed 'no findings returned' 0 > reports/nuclei.jsonl; fi
else
  write_status nuclei missing 'nuclei not installed in this runtime' 0 > reports/nuclei.jsonl
fi
cat reports/nuclei.jsonl`;

const gobusterCommand = `mkdir -p reports/gobuster
if [ "{run_gobuster}" != "true" ]; then exit 0; fi
if ! command -v gobuster >/dev/null 2>&1; then echo 'gobuster not installed' >> reports/gobuster.txt; exit 0; fi
safe=$(printf '%s' "$FLOW_ITEM" | tr '/:?' '___')
gobuster dir -u "$FLOW_ITEM" -w "{wordlist}" -q -o "reports/gobuster/$safe.txt" || true`;

const mergeGobusterCommand = `mkdir -p reports/gobuster
if [ "{run_gobuster}" != "true" ]; then echo 'Gobuster disabled. Set run_gobuster=true for authorized targets.' > reports/gobuster.txt; cat reports/gobuster.txt; exit 0; fi
cat reports/gobuster/*.txt > reports/gobuster.txt 2>/dev/null || echo 'No gobuster findings or reports.' > reports/gobuster.txt
cat reports/gobuster.txt`;

const ipWorkflow = {
  format: "cliflow-workflow",
  version: 1,
  workflow: {
    name: "URL/IP recon pipeline",
    description: "Authorized single-target workflow for HTTP/S URLs and IP addresses such as http://127.0.0.1. Probes the target, creates JSONL table-friendly output, and optionally runs Nuclei/Gobuster.",
    inputs: {
      target_url: "http://127.0.0.1",
      wordlist: "/opt/seclists/Discovery/Web-Content/common.txt",
      run_nuclei: false,
      nuclei_severity: "low,medium,high,critical",
      run_gobuster: false,
    },
    schedule: { enabled: false, cron: "", inputs: {} },
    nodes: [
      commandNode("validate-target-url", "Validate URL/IP target", "Normalize target_url into a HTTP/S URL", 100, 80, targetValidateCommand, { timeoutSeconds: 30 }),
      commandNode("probe-target-url", "Probe target URL", "Check reachability and save HTTP headers plus JSONL probe metadata", 100, 280, probeCommand, { retryCount: 1, retryDelayMs: 2000, timeoutSeconds: 60 }),
      parserNode("clean-live-url", "Clean live URL", "Normalize reachable URL output", 100, 480),
      outputNode("save-target-metadata", "Download target metadata", "Save normalized target metadata", -260, 280, "target.json", "application/json", "reports/target.json"),
      outputNode("save-live-url", "Download live URL", "Save reachable URL if the target responded", -260, 680, "live-hosts.txt", "text/plain", ""),
      outputNode("save-http-probe", "Download HTTP probe JSONL", "Save table-friendly HTTP probe result", -260, 880, "http-probe.jsonl", "application/jsonl", "reports/http_probe.jsonl", { runAfterFailure: true }),
      outputNode("save-target-headers", "Download target headers", "Save raw response headers", -260, 1080, "technology-headers.txt", "text/plain", "reports/tech_headers.txt", { runAfterFailure: true }),
      commandNode("optional-nuclei-url", "Optional Nuclei scan", "Disabled by default; set run_nuclei=true for authorized targets", 420, 680, nucleiCommand, { timeoutSeconds: 900, runAfterFailure: true }),
      outputNode("save-nuclei-url", "Download Nuclei JSONL", "Save Nuclei findings or status as JSONL", 420, 880, "nuclei.jsonl", "application/jsonl", "reports/nuclei.jsonl", { runAfterFailure: true }),
      foreachNode("optional-gobuster-url", "Optional Gobuster directories", "Disabled by default; set run_gobuster=true", 760, 680, gobusterCommand),
      commandNode("merge-gobuster-url", "Merge Gobuster reports", "Merge optional Gobuster output", 760, 880, mergeGobusterCommand, { runAfterFailure: true, timeoutSeconds: 60 }),
      outputNode("save-gobuster-url", "Download Gobuster report", "Save optional Gobuster merged output", 760, 1080, "gobuster.txt", "text/plain", "reports/gobuster.txt", { runAfterFailure: true }),
    ],
    edges: [
      edge("url-e1", "validate-target-url", "probe-target-url"),
      edge("url-e2", "validate-target-url", "save-target-metadata"),
      edge("url-e3", "probe-target-url", "clean-live-url"),
      edge("url-e4", "clean-live-url", "save-live-url"),
      edge("url-e5", "probe-target-url", "save-http-probe"),
      edge("url-e6", "probe-target-url", "save-target-headers"),
      edge("url-e7", "clean-live-url", "optional-nuclei-url"),
      edge("url-e8", "optional-nuclei-url", "save-nuclei-url"),
      edge("url-e9", "clean-live-url", "optional-gobuster-url"),
      edge("url-e10", "optional-gobuster-url", "merge-gobuster-url"),
      edge("url-e11", "merge-gobuster-url", "save-gobuster-url"),
    ],
    templates: [],
  },
};

await writeJson("examples/url-ip-recon.cliflow.json", ipWorkflow);
await writeJson("server/seeds/url-ip-recon.json", { id: "url-ip-recon", ...ipWorkflow.workflow });

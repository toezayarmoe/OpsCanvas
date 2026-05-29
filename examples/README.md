# Example Workflows

## subScraper-style recon pipeline

File: `subscraper-style-recon.cliflow.json`

This workflow is inspired by the subScraper / Recon Command Center style of pipeline:

```text
validate target
  -> passive subdomain collection
  -> parser / dedupe
  -> live host probing
  -> technology header capture
  -> optional Nuclei / Gobuster / Nikto branches
  -> downloadable reports
```

Import it from the app header with **Import**.

Default inputs:

```json
{
  "domain": "example.com",
  "wordlist": "/opt/seclists/Discovery/Web-Content/common.txt",
  "run_nuclei": false,
  "nuclei_severity": "low,medium,high,critical",
  "run_gobuster": false,
  "run_nikto": false
}
```

The optional scanner branches are disabled by default. Enable them only for targets you are authorized to test.

Expected downloadable outputs:

- `subdomains.txt`
- `live-hosts.txt`
- `technology-headers.txt`
- `technology.tsv`
- `technology.jsonl`
- `nuclei.jsonl`
- `gobuster.txt`
- `nikto.txt`

The workflow is designed to continue when optional tools are missing. JSONL reports such as `nuclei.jsonl` and `technology.jsonl` always contain valid JSONL status rows, so they can be opened with the Outputs table viewer even when a tool is disabled or returns no findings.

## URL/IP recon pipeline

File: `url-ip-recon.cliflow.json`

Use this workflow for a single HTTP/S URL or IP target, for example:

```json
{
  "target_url": "http://127.0.0.1",
  "wordlist": "/opt/seclists/Discovery/Web-Content/common.txt",
  "run_nuclei": false,
  "nuclei_severity": "low,medium,high,critical",
  "run_gobuster": false
}
```

It normalizes the target, probes HTTP response metadata, saves table-friendly JSONL output, and can optionally run Nuclei or Gobuster against the reachable URL.

Expected downloadable outputs:

- `target.json`
- `live-hosts.txt`
- `http-probe.jsonl`
- `technology-headers.txt`
- `nuclei.jsonl`
- `gobuster.txt`

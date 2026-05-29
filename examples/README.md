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
- `nuclei.jsonl`
- `gobuster.txt`
- `nikto.txt`

The workflow is designed to continue when optional tools are missing. It writes a clear message into the corresponding report instead of blocking the whole run.

# LinkedIn Job Scanner

Find fresh LinkedIn jobs from your terminal — **no login, no account, no ban risk.**

It uses LinkedIn's public "see more jobs" guest API (the same one a logged-out
visitor hits). It never signs in, never touches your `li_at` cookie, and never
puts your account on the line. LinkedIn bans automation of *logged-in* sessions;
this stays logged out.

Results land in `results.csv` (open in Excel/Sheets) and `results.jsonl`.

## Setup

Needs [Node.js](https://nodejs.org) 18+ (for built-in `fetch`). No `npm install` — zero dependencies.

```bash
git clone <your-fork-url>
cd linkedin-job-scanner
node scan.mjs
```

## Make it yours — edit `config.json`

That one file is the whole product. Nothing else needs touching. **Out of the
box every filter is off** — set your `titles` and `locations`, run it, and you
get every fresh job. Turn on filters only if you want them.

| Key | What it does |
|-----|--------------|
| `titles` | Search terms — the roles you want. Works for **any** field: `"data scientist"`, `"product designer"`, `"registered nurse"`, `"accountant"`. |
| `locations` | Where to search. `"United States"` = nationwide; `"Remote"`; a city like `"Austin, Texas, United States"`; or a country like `"United Kingdom"`. |
| `freshnessHours` | Only jobs posted within this many hours (default 24). |
| `experienceLevels` | LinkedIn level codes: `1`=Internship `2`=Entry `3`=Associate `4`=Mid-Senior `5`=Director `6`=Executive. `[]` = all levels (default). |
| `includeAllExperience` | Also run a pass with no level filter (catches jobs LinkedIn left untagged). |
| `titleMustMatch` | Keep a job only if its title has one of these words. `[]` = keep every title (default). |
| `titleExclude` | Drop a job if its title has any of these words. |
| `blockedCompanies` | Company names to always skip. |
| `jdExcludePatterns` | Optional slower filter: reads each job's full description, drops it if a regex matches. `[]` = off (default). |
| `maxResultsPerQuery` | Cap per search (default 300). |

Change a value, save, run again. That's it.

### Recipes (copy into `config.json` if you want them)

- **Only entry-level / new-grad:** `"experienceLevels": ["1", "2"]`
- **No senior/lead roles:** `"titleExclude": ["senior", "sr", "staff", "principal", "lead", "manager", "director"]`
- **Broad search term, tight results** (e.g. searching `"engineer"` but you only want software): `"titleMustMatch": ["software", "backend", "frontend", "full stack"]`
- **Skip jobs demanding lots of experience:** `"jdExcludePatterns": ["\\b([5-9]|\\d{2,})\\+?\\s*years"]`
- **Skip a company:** `"blockedCompanies": ["Acme Corp", "Initech"]`

## Usage

```bash
node scan.mjs            # jobs from the last freshnessHours, save results
node scan.mjs --week     # last 7 days
node scan.mjs --dry-run  # search + filter, print, save nothing
```

Re-runs skip jobs already saved (remembered in `.seen.txt` — delete it to reset).

## Automate it

Run it on a schedule so you catch jobs early:

- **Mac/Linux** — `crontab -e`, then `0 */6 * * * cd /path/to/linkedin-job-scanner && node scan.mjs`
- **Windows** — Task Scheduler → new task → `node C:\path\to\scan.mjs`

## Notes & limits

- **Be gentle.** The scanner paces itself (~1s between requests) to avoid rate limits. Don't crank the pacing down — you'll get 429'd and lose results.
- The guest API returns roughly the last ~370 jobs per search; very broad searches
  hit that ceiling. Narrower titles/locations = better coverage. Run often.
- This reads *public* data only. Respect LinkedIn's terms and your local laws;
  use it for your own job hunt, not bulk harvesting.

## License

MIT — do whatever, no warranty.

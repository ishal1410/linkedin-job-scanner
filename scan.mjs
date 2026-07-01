#!/usr/bin/env node
/**
 * scan.mjs — account-free LinkedIn job scanner.
 *
 * Hits LinkedIn's PUBLIC guest job API (the same endpoint the logged-out
 * "see more jobs" button uses). No login, no li_at cookie, no account on the
 * line — LinkedIn bans automation of logged-IN sessions, this never logs in.
 *
 * Everything you'd want to change lives in config.json. This file you never edit.
 *
 * Usage:
 *   node scan.mjs             # past N hours (config.freshnessHours), write results
 *   node scan.mjs --week      # force past 7 days
 *   node scan.mjs --dry-run   # find + filter, write nothing
 *
 * Outputs (next to this script):
 *   results.csv     — open in Excel/Sheets
 *   results.jsonl   — one JSON job per line, for scripts
 *   .seen.txt       — dedup memory so re-runs don't repeat jobs (delete to reset)
 */
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fail loudly and helpfully instead of "fetch is not defined" three screens down.
if (typeof fetch !== 'function') {
  console.error(`This needs Node.js 18 or newer (you have ${process.version}). Get it: https://nodejs.org`);
  process.exit(1);
}

const DIR = dirname(fileURLToPath(import.meta.url));
let cfg;
try {
  cfg = JSON.parse(readFileSync(join(DIR, 'config.json'), 'utf8'));
} catch (e) {
  console.error(existsSync(join(DIR, 'config.json'))
    ? `config.json has a typo (not valid JSON): ${e.message}\nTip: check for a missing comma or quote.`
    : `config.json not found next to scan.mjs.`);
  process.exit(1);
}
if (!cfg.titles?.length || !cfg.locations?.length) {
  console.error('config.json needs at least one entry in "titles" and one in "locations".');
  process.exit(1);
}

const WEEK = process.argv.includes('--week');
const DRY  = process.argv.includes('--dry-run');
const FRESH_HOURS = WEEK ? 168 : (cfg.freshnessHours || 24);
const f_TPR = `r${FRESH_HOURS * 3600}`;
const PAGE = 10;                                    // guest API returns 10/page (fixed)
const PER_QUERY_MAX = cfg.maxResultsPerQuery || 300;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DISCOVER_MS = 900;   // pace between search pages — LinkedIn 429s if you go faster
const JD_MS = 350;         // pace between full-JD fetches

// One search pass per experience-filter. f_E=2,3 narrows to entry/associate; the
// no-f_E pass catches roles LinkedIn left experience-untagged (common at startups).
const PASSES = [];
if (cfg.experienceLevels && cfg.experienceLevels.length)
  PASSES.push({ q: `f_E=${cfg.experienceLevels.join(',')}`, tag: '' });
if (cfg.includeAllExperience || !PASSES.length)
  PASSES.push({ q: '', tag: ' [all-exp]' });

// Build case-insensitive matchers from the config word lists.
const wordRe = (words) => words && words.length
  ? new RegExp('\\b(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i')
  : null;
const MUST    = wordRe(cfg.titleMustMatch);
const EXCLUDE = wordRe(cfg.titleExclude);
const BLOCKED = wordRe(cfg.blockedCompanies);
const JD_EXCLUDE = (cfg.jdExcludePatterns || []).map(p => new RegExp(p, 'i'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
const csvCell = s => `"${String(s ?? '').replace(/"/g, '""')}"`;

// 12s per-request timeout — without it one dead connection hangs the whole scan.
async function fetchText(url) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ac.signal });
    if (r.status === 429) return { code: 429 };
    if (!r.ok) return { code: r.status };
    return { code: 200, body: await r.text() };
  } catch (e) { return { err: e.message }; }
  finally { clearTimeout(to); }
}

// Retry a 429 with exponential backoff + jitter instead of dropping the page.
async function fetchRetry(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetchText(url);
    if (r.code !== 429 || attempt >= 3) return r;
    await sleep(2000 * 2 ** attempt + Math.floor(Math.random() * 1000));
  }
}

function parseCards(html) {
  const out = [];
  for (const b of html.split(/<li>/i).slice(1)) {
    const url = (b.match(/href="(https:\/\/www\.linkedin\.com\/jobs\/view\/[^"?]+)/) || [])[1]; if (!url) continue;
    const id = (url.match(/-(\d+)$/) || [])[1]; if (!id) continue;
    out.push({
      id,
      title:   strip((b.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i) || [])[1]),
      company: strip((b.match(/hidden-nested-link[^>]*>([\s\S]*?)<\/a>/i) || [])[1]),
      loc:     strip((b.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i) || [])[1]),
      date:    (b.match(/datetime="([^"]+)"/) || [])[1] || '',
      url:     'https://www.linkedin.com/jobs/view/' + id,
    });
  }
  return out;
}

// ── dedup: remember job ids we've already emitted ──
const SEEN_FILE = join(DIR, '.seen.txt');
const seen = new Set(existsSync(SEEN_FILE) ? readFileSync(SEEN_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : []);

// ── 1+2: discover + cheap title filter ──
const cutoff = Date.now() - FRESH_HOURS * 3600 * 1000;
const candidates = [], byId = new Set();
let fetched = 0, throttles = 0;
console.log(`LinkedIn scan (account-free) — past ${FRESH_HOURS}h — ${cfg.titles.length} titles × ${cfg.locations.length} locations × ${PASSES.length} pass(es)\n`);
for (const title of cfg.titles) {
  process.stdout.write(`  · ${title} …`);
  const before = candidates.length;
  for (const location of cfg.locations) {
    for (const pass of PASSES) {
      for (let start = 0; start < PER_QUERY_MAX; start += PAGE) {
        const u = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&f_TPR=${f_TPR}${pass.q ? '&' + pass.q : ''}&start=${start}`;
        const r = await fetchRetry(u);
        if (r.code === 429) { throttles++; break; }
        if (r.code !== 200 || !r.body) break;
        fetched++;
        const cards = parseCards(r.body);
        if (!cards.length) break;                    // empty page = end of results
        for (const c of cards) {
          if (byId.has(c.id) || seen.has(c.id)) continue; byId.add(c.id);
          if (MUST && !MUST.test(c.title)) continue;
          if (EXCLUDE && EXCLUDE.test(c.title)) continue;
          if (BLOCKED && (BLOCKED.test(c.company) || BLOCKED.test(c.title))) continue;
          if (c.date && Date.parse(c.date) && Date.parse(c.date) < cutoff) continue;
          c.tag = pass.tag;
          candidates.push(c);
        }
        await sleep(DISCOVER_MS);
      }
    }
  }
  console.log(` +${candidates.length - before} new`);
}

// ── 3: optional JD gate (only if config has patterns) ──
let kept = candidates;
if (JD_EXCLUDE.length && candidates.length) {
  kept = [];
  let filtered = 0;
  console.log(`\nJD gate — reading full description for ${candidates.length} jobs…`);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (i > 0) await sleep(JD_MS);
    const r = await fetchRetry(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${c.id}`);
    if (r.code !== 200 || !r.body) { kept.push(c); continue; }   // unreadable → keep, don't silently drop
    const jd = strip((r.body.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '') || strip(r.body);
    if (jd && JD_EXCLUDE.some(re => re.test(jd))) { filtered++; console.log(`  - filtered: ${c.company} | ${c.title}`); continue; }
    kept.push(c);
  }
  console.log(`JD gate: ${filtered} filtered out`);
}

// ── 4: write ──
console.log(`\nPages fetched: ${fetched} | 429 throttles: ${throttles}`);
console.log(`${DRY ? 'Would write' : 'New jobs'}: ${kept.length}\n`);
for (const c of kept.slice(0, 60)) console.log(`  + ${c.company} | ${c.title} | ${c.loc}${c.tag || ''}`);

if (!DRY && kept.length) {
  const csvExists = existsSync(join(DIR, 'results.csv'));
  if (!csvExists) writeFileSync(join(DIR, 'results.csv'), 'date_found,company,title,location,url\n');
  const today = new Date().toISOString().slice(0, 10);
  for (const c of kept) {
    appendFileSync(join(DIR, 'results.csv'), [today, c.company, c.title, c.loc, c.url].map(csvCell).join(',') + '\n');
    appendFileSync(join(DIR, 'results.jsonl'), JSON.stringify({ ...c, foundDate: today }) + '\n');
    appendFileSync(SEEN_FILE, c.id + '\n');
  }
  console.log(`\n→ wrote ${kept.length} to results.csv / results.jsonl`);
} else if (!kept.length) {
  console.log('\n→ nothing new this pass');
}

// undici keep-alive holds the event loop open ~seconds after work is done; all
// writes above are synchronous, so exit now instead of lingering.
process.exit(0);

// Checks every replacement in catalog/models.json against the official pages, and
// with --write records the result in the catalog. `fix` only applies a replacement
// that passed both checks:
//  1. recommended: the deprecated ID and its replacement sit in the same row of the
//     official deprecation table (the entry's `source`);
//  2. exists: the replacement is a live, non-deprecated model on an official page
//     (or is itself in the catalog with a verified replacement, forming a chain).
// Usage: node scripts/verify-catalog.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';

const CATALOG = new URL('../catalog/models.json', import.meta.url);
const OPENAI_MODEL_PAGE = (id) => `https://developers.openai.com/api/docs/models/${id}`;
const GOOGLE_MODELS = 'https://ai.google.dev/gemini-api/docs/models';
const GOOGLE_EMBEDDINGS = 'https://ai.google.dev/gemini-api/docs/embeddings';

const decode = (s) =>
  s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/[‐-‑]/g, '-');
const textOf = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const split = (text) => text.split(/[\s,|()`"'<>;]+/).filter(Boolean);

const cache = new Map();
async function fetchPage(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { headers: { 'user-agent': 'modelrot-catalog-check' } })
      .then(async (res) => ({ status: res.status, html: res.ok ? await res.text() : '' })));
  }
  return cache.get(url);
}

/** Table rows of a page, each as a set of tokens (HTML tables and markdown tables). */
async function rowsOf(url) {
  const { html } = await fetchPage(url);
  const rows = [];
  for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => textOf(c[1]));
    // `first` is the row's own model, so a replacement named in another model's row doesn't count.
    rows.push(Object.assign(new Set(split(cells.join(' '))), { first: cells[0] ?? '' }));
  }
  for (const line of html.split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      rows.push(Object.assign(new Set(split(textOf(line))), { first: textOf(line.split('|')[1] ?? '') }));
    }
  }
  return rows;
}

/** Where the replacement is confirmed to exist, or null. */
async function existsAt(provider, platform, id) {
  if (platform === 'azure') {
    const url = 'https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule';
    return (await rowsOf(url)).some((r) => r.first === id && r.has('GA')) ? url : null;
  }
  if (provider === 'openai') {
    const url = OPENAI_MODEL_PAGE(id);
    const page = await fetchPage(url);
    if (page.status === 200) return /Deprecated/.test(page.html) ? null : url;
    // A dated snapshot has no page of its own: look for it on its base model's page.
    const base = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    if (base === id) return null;
    const basePage = await fetchPage(OPENAI_MODEL_PAGE(base));
    return basePage.status === 200 && basePage.html.includes(id) && !/Deprecated/.test(basePage.html) ? OPENAI_MODEL_PAGE(base) : null;
  }
  if (provider === 'anthropic') {
    const url = 'https://platform.claude.com/docs/en/about-claude/model-deprecations';
    return (await rowsOf(url)).some((r) => r.first === id && r.has('Active')) ? url : null;
  }
  if (provider === 'google') {
    for (const url of [GOOGLE_MODELS, GOOGLE_EMBEDDINGS]) {
      if (new Set(split(textOf((await fetchPage(url)).html))).has(id)) return url;
    }
    return null;
  }
  return null;
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const report = [];
for (const m of catalog.models) {
  delete m.replacementVerified;
  delete m.replacementSources;
  if (!m.replacement) continue;
  const recommended = (await rowsOf(m.source)).some((row) => row.has(m.id) && row.has(m.replacement));
  report.push({ m, recommended, existsUrl: await existsAt(m.provider, m.platform, m.replacement) });
}

// A replacement that is itself deprecated still counts when its own replacement is verified.
let changed = true;
const verified = new Set();
while (changed) {
  changed = false;
  for (const r of report) {
    const key = `${r.m.platform}:${r.m.id}`;
    if (verified.has(key) || !r.recommended) continue;
    const chained = verified.has(`${r.m.platform}:${r.m.replacement}`);
    if (r.existsUrl || chained) {
      verified.add(key);
      r.m.replacementVerified = true;
      r.m.replacementSources = r.existsUrl ? [r.m.source, r.existsUrl] : [r.m.source];
      changed = true;
    }
  }
}
for (const r of report) if (!r.m.replacementVerified) r.m.replacementVerified = false;

for (const r of report) {
  const why = r.m.replacementVerified ? '' : !r.recommended ? '  (not listed as the official replacement)' : '  (replacement not found as a live model)';
  console.log(`${r.m.replacementVerified ? 'OK  ' : 'FAIL'} ${r.m.platform.padEnd(7)} ${r.m.id.padEnd(42)} → ${r.m.replacement}${why}`);
}
const bad = report.filter((r) => !r.m.replacementVerified).length;
console.log(`\n${report.length - bad} replacements confirmed, ${bad} not confirmed (shown as "fix by hand").`);

if (process.argv.includes('--write')) {
  catalog.verified = new Date().toISOString().slice(0, 10);
  writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
  console.log('Wrote verification results to catalog/models.json');
}

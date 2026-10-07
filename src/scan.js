import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, extname, basename, sep } from 'node:path';
import { matchModelId, entriesFor, primaryEntry, resolveReplacement } from './catalog.js';

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.py']);
const CONFIG_EXTENSIONS = { '.json': 'json', '.toml': 'toml', '.yaml': 'yaml', '.yml': 'yaml' };
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.cache',
  '__pycache__', '.venv', 'venv', 'env', '.tox', '.mypy_cache', '.pytest_cache', 'site-packages',
]);
const IGNORED_FILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'composer.lock']);

/**
 * What kind of file this is, or null when it is not scanned.
 * "code" covers JS/TS/Python; config files are "json", "toml", "yaml" or "env".
 */
export function fileKind(path) {
  const name = basename(path);
  if (IGNORED_FILES.has(name)) return null;
  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) return 'env';
  const ext = extname(name);
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return CONFIG_EXTENSIONS[ext] ?? null;
}

/** Config files can hold secrets, so their lines are never printed. */
export const isConfigKind = (kind) => kind !== 'code';

// One string literal on a single line: "...", '...' or `...`, with escapes.
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;

// Short IDs like "o1" or "tts" are also common as plain identifiers ({ id: "o1" }),
// so they only count when the line mentions a model before the value.
const AMBIGUOUS_ID = /^(?:o\d(?:-[a-z]+)?|tts(?:-hd)?|whisper|codex-mini)$/;
const MODEL_CONTEXT = /model|engine|deployment|llm/i;

export function listSourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      if (dirent.isSymbolicLink()) continue;
      const full = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (!IGNORED_DIRS.has(dirent.name)) walk(full);
      } else if (fileKind(full)) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files.sort();
}

/** Reads an unquoted or quoted scalar value starting at `from`, without its trailing comment. */
function scalarValue(line, from) {
  let start = from;
  while (line[start] === ' ' || line[start] === '\t') start++;
  const quote = line[start];
  if (quote === '"' || quote === "'") {
    const end = line.indexOf(quote, start + 1);
    return end < 0 ? null : { text: line.slice(start + 1, end), offset: start + 1 };
  }
  const comment = line.slice(start).search(/\s#/);
  const text = (comment < 0 ? line.slice(start) : line.slice(start, start + comment)).trimEnd();
  return text ? { text, offset: start } : null;
}

const ENV_ASSIGNMENT = /^\s*(?:export\s+)?[A-Za-z_][\w.-]*\s*=/;
const YAML_PREFIX = /^\s*(?:-\s+)?(?:[^\s'"#\-][^#]*?:\s+|"[^"]*":\s+|'[^']*':\s+)?/;

/** The values worth checking in one line of a .env or YAML file. */
function configLineValue(line, kind) {
  if (/^\s*(#|$)/.test(line)) return null;
  if (kind === 'env') {
    const m = line.match(ENV_ASSIGNMENT);
    return m ? scalarValue(line, m[0].length) : null;
  }
  const prefix = line.match(YAML_PREFIX)[0];
  if (!prefix.trim()) return null; // a bare line is a continuation, not a value
  return scalarValue(line, prefix.length);
}

/** Every string that could be a model ID, with its absolute position in the text. */
function candidates(text, kind) {
  if (kind === 'env' || kind === 'yaml') {
    const out = [];
    let lineStart = 0;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '');
      const value = configLineValue(line, kind);
      if (value) out.push({ text: value.text, start: lineStart + value.offset });
      lineStart += raw.length + 1;
    }
    return out;
  }
  return [...text.matchAll(STRING_LITERAL)].map((m) => ({ text: m[2], start: m.index + 1 }));
}

/** Finds deprecated model IDs in the text of one file. */
export function scanText(text, catalog, { platform, kind = 'code' } = {}) {
  const findings = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);

  for (const candidate of candidates(text, kind)) {
    const match = matchModelId(candidate.text, catalog);
    if (!match) continue;
    const entries = entriesFor(match.id, catalog, platform);
    if (entries.length === 0) continue;
    // Names like "claude-haiku-4-5" retire on Azure but stay valid on the provider's
    // own API, so Azure-only entries need an explicit --platform azure.
    if (!platform && entries.every((e) => e.platform === 'azure')) continue;
    const start = candidate.start + match.offset;
    let line = lineStarts.length - 1;
    while (lineStarts[line] > start) line--;
    if (match.offset === 0 && AMBIGUOUS_ID.test(match.id) && !MODEL_CONTEXT.test(text.slice(lineStarts[line], candidate.start))) {
      continue;
    }
    const primary = primaryEntry(entries);
    findings.push({
      id: match.id,
      start,
      end: start + match.id.length,
      line: line + 1,
      column: start - lineStarts[line] + 1,
      entry: primary,
      others: entries.filter((e) => e !== primary),
      replacement: resolveReplacement(primary, catalog),
    });
  }
  return findings;
}

export function scanDirectory(root, catalog, options = {}) {
  const files = listSourceFiles(root);
  const results = [];
  for (const file of files) {
    const kind = fileKind(file);
    const findings = scanText(readFileSync(file, 'utf8'), catalog, { ...options, kind });
    if (findings.length) results.push({ file: relative(root, file).split(sep).join('/'), path: file, kind, findings });
  }
  return { root, fileCount: files.length, results };
}

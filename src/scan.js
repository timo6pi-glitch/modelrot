import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { matchModelId, entriesFor, primaryEntry, resolveReplacement } from './catalog.js';

export const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.py']);
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.cache',
  '__pycache__', '.venv', 'venv', 'env', '.tox', '.mypy_cache', '.pytest_cache', 'site-packages',
]);

// One string literal on a single line: "...", '...' or `...`, with escapes.
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;

// Short IDs like "o1" or "tts" are also common as plain identifiers ({ id: "o1" }),
// so they only count when the line mentions a model before the string.
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
      } else if (EXTENSIONS.has(extname(dirent.name))) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files.sort();
}

/** Finds deprecated model IDs in the source text of one file. */
export function scanText(text, catalog, { platform } = {}) {
  const findings = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);

  for (const m of text.matchAll(STRING_LITERAL)) {
    const match = matchModelId(m[2], catalog);
    if (!match) continue;
    const entries = entriesFor(match.id, catalog, platform);
    if (entries.length === 0) continue;
    const start = m.index + 1 + match.offset;
    let line = lineStarts.length - 1;
    while (lineStarts[line] > start) line--;
    if (match.offset === 0 && AMBIGUOUS_ID.test(match.id) && !MODEL_CONTEXT.test(text.slice(lineStarts[line], m.index))) {
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
    const findings = scanText(readFileSync(file, 'utf8'), catalog, options);
    if (findings.length) results.push({ file: relative(root, file).split(sep).join('/'), path: file, findings });
  }
  return { root, fileCount: files.length, results };
}

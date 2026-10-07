import { readFileSync, writeFileSync } from 'node:fs';
import { isConfigKind } from './scan.js';

/** Returns the new text with every fixable finding replaced, plus what changed. */
export function applyFixes(text, findings) {
  const fixable = findings.filter((f) => f.replacement);
  let output = text;
  for (const f of [...fixable].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, f.start) + f.replacement + output.slice(f.end);
  }
  return { output, fixed: fixable, skipped: findings.filter((f) => !f.replacement) };
}

/** Line-by-line preview: the old line and the new line for each changed line. */
export function previewChanges(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const changes = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) changes.push({ line: i + 1, before: a[i].replace(/\r$/, ''), after: b[i].replace(/\r$/, '') });
  }
  return changes;
}

export function fixScanResult(scan, { dryRun = false } = {}) {
  const files = [];
  for (const result of scan.results) {
    const before = readFileSync(result.path, 'utf8');
    const { output, fixed, skipped } = applyFixes(before, result.findings);
    if (fixed.length && !dryRun) writeFileSync(result.path, output);
    // Config files can hold secrets: only ever show the model IDs, never the line.
    const changes = isConfigKind(result.kind)
      ? fixed.map((f) => ({ line: f.line, model: f.id, replacement: f.replacement }))
      : previewChanges(before, output);
    files.push({ ...result, fixed, skipped, changes });
  }
  return files;
}

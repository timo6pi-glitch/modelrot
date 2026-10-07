#!/usr/bin/env node
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCatalog, platformLabel, PLATFORMS } from './catalog.js';
import { scanDirectory } from './scan.js';
import { fixScanResult } from './fix.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `modelrot ${pkg.version}
Find AI model IDs in your code that are deprecated or about to be shut down, and fix them.
Scans JS/TS/Python code and .env, YAML, JSON and TOML config files.
Lines from config files are never printed, only the model IDs, so secrets stay private.

Usage
  npx modelrot scan [dir]              List deprecated models used in dir (default: .)
  npx modelrot fix [dir] --dry-run     Show the replacements without changing files
  npx modelrot fix [dir]               Replace deprecated model IDs in place
  npx modelrot list                    Print the whole catalog

Options
  --platform <api|bedrock|azure>   Only use shutdown dates for one platform
  --json                           Machine-readable output
  --no-color                       Disable colors
  -h, --help                       Show this help
  -v, --version                    Show the version

scan exits with code 1 when it finds something, so it can fail a CI job.
`;

function parseArgs(argv) {
  const args = { command: null, dir: '.', dryRun: false, json: false, color: true, platform: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--json') args.json = true;
    else if (a === '--no-color') args.color = false;
    else if (a === '--platform') args.platform = argv[++i];
    else if (a.startsWith('--platform=')) args.platform = a.slice('--platform='.length);
    else if (a === '-h' || a === '--help') args.command = 'help';
    else if (a === '-v' || a === '--version') args.command = 'version';
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else if (!args.command) args.command = a;
    else args.dir = a;
  }
  if (args.platform && !PLATFORMS.includes(args.platform)) {
    throw new Error(`--platform must be one of: ${PLATFORMS.join(', ')}`);
  }
  return args;
}

function makeColors(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  return { red: wrap(31), yellow: wrap(33), green: wrap(32), cyan: wrap(36), dim: wrap(2), bold: wrap(1) };
}

export function today() {
  return process.env.MODELROT_TODAY ?? new Date().toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function describeDate(shutdown, now, c) {
  const days = daysBetween(now, shutdown);
  if (days < 0) return c.red(`shut down on ${shutdown}`);
  if (days === 0) return c.red(`shuts down today (${shutdown})`);
  const text = `shuts down ${shutdown} (in ${days} day${days === 1 ? '' : 's'})`;
  return days <= 90 ? c.yellow(text) : text;
}

function printScan(scan, c, now) {
  const total = scan.results.reduce((n, r) => n + r.findings.length, 0);
  if (total === 0) {
    console.log(c.green(`✔ No deprecated AI models found in ${scan.fileCount} files.`));
    return;
  }
  for (const result of scan.results) {
    console.log(c.bold(result.file));
    for (const f of result.findings) {
      const arrow = f.replacement ? `→ ${c.green(f.replacement)}` : c.dim('→ no drop-in replacement');
      console.log(`  ${c.dim(`${f.line}:${f.column}`.padEnd(8))}${c.cyan(f.id)}  ${platformLabel(f.entry)}  ${describeDate(f.entry.shutdown, now, c)}  ${arrow}`);
      if (f.entry.replacementNote) console.log(`  ${' '.repeat(8)}${c.dim(f.entry.replacementNote)}`);
      for (const o of f.others) console.log(`  ${' '.repeat(8)}${c.dim(`also on ${platformLabel(o)}: ${o.shutdown}`)}`);
      console.log(`  ${' '.repeat(8)}${c.dim(f.entry.source)}`);
    }
    console.log('');
  }
  const all = scan.results.flatMap((r) => r.findings);
  const dead = all.filter((f) => f.entry.shutdown < now).length;
  console.log(
    `${c.bold(`Found ${total} deprecated model reference${total === 1 ? '' : 's'}`)} in ${scan.results.length} of ${scan.fileCount} files` +
      (dead ? ` (${c.red(`${dead} already shut down`)})` : '') + '.',
  );
  if (all.some((f) => f.replacement)) console.log(`Preview the fixes with ${c.cyan('npx modelrot fix --dry-run')}`);
}

function printFix(files, dryRun, c) {
  let fixed = 0;
  for (const file of files) {
    if (!file.changes.length && !file.skipped.length) continue;
    console.log(c.bold(file.file));
    for (const ch of file.changes) {
      if (ch.model) {
        console.log(`  ~ ${String(ch.line).padStart(4)} | ${c.red(ch.model)} → ${c.green(ch.replacement)}`);
        continue;
      }
      console.log(c.red(`  - ${String(ch.line).padStart(4)} | ${ch.before.trim()}`));
      console.log(c.green(`  + ${String(ch.line).padStart(4)} | ${ch.after.trim()}`));
    }
    for (const s of file.skipped) {
      console.log(c.yellow(`  ! ${String(s.line).padStart(4)} | ${s.id}: no drop-in replacement, fix by hand. ${s.entry.replacementNote ?? ''}`));
    }
    fixed += file.fixed.length;
    console.log('');
  }
  if (fixed === 0) console.log('Nothing to fix automatically.');
  else if (dryRun) console.log(`${c.bold(`${fixed} replacement${fixed === 1 ? '' : 's'}`)} would be made. Run without ${c.cyan('--dry-run')} to apply them.`);
  else console.log(c.green(`✔ Made ${fixed} replacement${fixed === 1 ? '' : 's'}. Review the diff and run your tests before you ship.`));
}

function printList(catalog, c, now, platform) {
  for (const e of catalog.models) {
    if (platform && e.platform !== platform) continue;
    console.log(`${c.cyan(e.id.padEnd(44))} ${platformLabel(e).padEnd(22)} ${describeDate(e.shutdown, now, c)}  → ${e.replacement ?? '—'}`);
  }
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  const c = makeColors(args.color && !args.json && process.stdout.isTTY && !process.env.NO_COLOR);
  const now = today();
  const catalog = loadCatalog();

  if (!args.command || args.command === 'help') {
    console.log(HELP);
    return 0;
  }
  if (args.command === 'version') {
    console.log(pkg.version);
    return 0;
  }
  if (args.command === 'list') {
    if (args.json) console.log(JSON.stringify(catalog.models, null, 2));
    else printList(catalog, c, now, args.platform);
    return 0;
  }
  if (args.command !== 'scan' && args.command !== 'fix') {
    console.error(`Unknown command: ${args.command}\n\n${HELP}`);
    return 2;
  }

  const root = resolve(args.dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`Not a directory: ${args.dir}`);
    return 2;
  }
  const scan = scanDirectory(root, catalog, { platform: args.platform });

  if (args.command === 'scan') {
    if (args.json) {
      const findings = scan.results.flatMap((r) =>
        r.findings.map((f) => ({
          file: r.file, line: f.line, column: f.column, model: f.id,
          provider: f.entry.provider, platform: f.entry.platform, shutdown: f.entry.shutdown,
          replacement: f.replacement, note: f.entry.replacementNote ?? null, source: f.entry.source,
        })),
      );
      console.log(JSON.stringify({ filesScanned: scan.fileCount, findings }, null, 2));
    } else {
      printScan(scan, c, now);
    }
    return scan.results.length ? 1 : 0;
  }

  const files = fixScanResult(scan, { dryRun: args.dryRun });
  if (args.json) {
    console.log(JSON.stringify(files.map((f) => ({ file: f.file, changes: f.changes, skipped: f.skipped.map((s) => ({ line: s.line, model: s.id })) })), null, 2));
  } else {
    printFix(files, args.dryRun, c);
  }
  return 0;
}

process.exitCode = main();

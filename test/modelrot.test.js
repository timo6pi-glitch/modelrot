import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCatalog, matchModelId, resolveReplacement } from '../src/catalog.js';
import { scanText, scanDirectory, fileKind } from '../src/scan.js';
import { applyFixes } from '../src/fix.js';

const catalog = loadCatalog();
const FIXTURE = fileURLToPath(new URL('./fixtures/sample-project', import.meta.url));
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args, '--no-color'], {
    encoding: 'utf8',
    env: { ...process.env, MODELROT_TODAY: '2026-10-07' },
  });
}

function copyFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'modelrot-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

// ---------- catalog ----------

test('every catalog entry has the required fields and an official source', () => {
  const sources = new Set(Object.values(catalog.sources));
  for (const e of catalog.models) {
    assert.match(e.shutdown, /^\d{4}-\d{2}-\d{2}$/, e.id);
    assert.ok(['openai', 'anthropic', 'google'].includes(e.provider), e.id);
    assert.ok(['api', 'bedrock', 'azure'].includes(e.platform), e.id);
    assert.ok(sources.has(e.source), `${e.id} has an unknown source`);
    assert.ok(e.replacement || e.replacementNote, `${e.id} needs a replacement or a note`);
  }
});

test('no model is listed twice on the same platform', () => {
  const seen = new Set();
  for (const e of catalog.models) {
    const key = `${e.platform}:${e.id}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

test('key dates match the official announcements', () => {
  const date = (id, platform = 'api') => catalog.byId.get(id).find((e) => e.platform === platform).shutdown;
  assert.equal(date('gpt-4'), '2026-10-23');
  assert.equal(date('gpt-4-turbo'), '2026-10-23');
  assert.equal(date('gpt-3.5-turbo'), '2026-10-23');
  assert.equal(date('o1'), '2026-10-23');
  assert.equal(date('o3-mini'), '2026-10-23');
  assert.equal(date('o4-mini'), '2026-10-23');
  assert.equal(date('gpt-5-2025-08-07'), '2026-12-11');
  assert.equal(date('o3-2025-04-16'), '2026-12-11');
  assert.equal(date('claude-sonnet-4-5-20250929'), '2026-11-30');
  assert.equal(date('o3-mini', 'azure'), '2026-11-19');
  assert.equal(date('anthropic.claude-sonnet-4-20250514-v1:0', 'bedrock'), '2026-10-14');
});

test('replacement chains always end on a model that is not itself replaced', () => {
  for (const e of catalog.models) {
    const r = resolveReplacement(e, catalog);
    if (!r) continue;
    const next = (catalog.byId.get(r) ?? []).find((x) => x.platform === e.platform);
    assert.ok(!next?.replacement, `${e.id} resolves to ${r}, which is itself deprecated`);
  }
  const lite = catalog.byId.get('gemini-2.0-flash-lite')[0];
  assert.equal(resolveReplacement(lite, catalog), 'gemini-3.5-flash-lite');
});

// ---------- matching ----------

test('matches exact IDs only, never a longer model name', () => {
  assert.equal(matchModelId('gpt-4', catalog)?.id, 'gpt-4');
  assert.equal(matchModelId('gpt-4o', catalog), null);
  assert.equal(matchModelId('gpt-4.1', catalog), null);
  assert.equal(matchModelId('gpt-4o-mini', catalog), null);
  assert.equal(matchModelId('use gpt-4 here', catalog), null);
});

test('understands routing prefixes and Bedrock region prefixes', () => {
  assert.deepEqual(matchModelId('openai/gpt-4', catalog), { id: 'gpt-4', offset: 7 });
  assert.deepEqual(matchModelId('models/gemini-2.0-flash', catalog), { id: 'gemini-2.0-flash', offset: 7 });
  assert.deepEqual(matchModelId('us.anthropic.claude-sonnet-4-20250514-v1:0', catalog), {
    id: 'anthropic.claude-sonnet-4-20250514-v1:0',
    offset: 3,
  });
  assert.equal(matchModelId('us.gpt-4', catalog), null);
});

test('scanText reports line and column of the model ID', () => {
  const findings = scanText('const a = 1;\nconst m = "gpt-4-turbo";\n', catalog);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].column, 12);
  assert.equal(findings[0].replacement, 'gpt-5.6-sol');
});

test('scanText ignores comments and words outside string literals', () => {
  assert.equal(scanText('// we used gpt-4 before\n# gpt-4\nconst x = gpt4;', catalog).length, 0);
});

test('short IDs like "o1" only count when the line is about a model', () => {
  assert.equal(scanText('return { id: "o1", productId: "p1" };', catalog).length, 0);
  assert.equal(scanText('const voices = ["tts", "whisper"];', catalog).length, 0);
  assert.equal(scanText('client.create({ model: "o1" })', catalog).length, 1);
  assert.equal(scanText('MODEL_NAME = "o3-mini"', catalog).length, 1);
  assert.equal(scanText('const route = "openai/o1";', catalog).length, 1, 'a provider prefix is enough');
  assert.equal(scanText('const m = "gpt-4-turbo";', catalog).length, 1, 'long IDs need no context');
});

test('--platform filters which shutdown dates are used', () => {
  const [onAzure] = scanText("model = 'o3-mini'", catalog, { platform: 'azure' });
  assert.equal(onAzure.entry.shutdown, '2026-11-19');
  assert.equal(scanText("model = 'gpt-4'", catalog, { platform: 'azure' }).length, 0);
  // Retires on Azure only: valid on the Anthropic API, so silent unless asked.
  assert.equal(scanText("model = 'claude-haiku-4-5'", catalog).length, 0);
  assert.equal(scanText("model = 'claude-haiku-4-5'", catalog, { platform: 'azure' }).length, 1);
});

// ---------- directory scan ----------

test('scanDirectory finds every deprecated model in the sample project', () => {
  const scan = scanDirectory(FIXTURE, catalog);
  const found = scan.results.flatMap((r) => r.findings.map((f) => `${r.file}:${f.line}:${f.id}`));
  assert.deepEqual(found, [
    'scripts/summarize.py:8:gpt-4',
    'scripts/summarize.py:14:claude-3-haiku-20240307',
    'scripts/summarize.py:17:sora-2',
    'src/agent.ts:5:claude-sonnet-4-5-20250929',
    'src/agent.ts:8:anthropic.claude-sonnet-4-20250514-v1:0',
    'src/agent.ts:10:gpt-3.5-turbo',
    'src/agent.ts:10:gemini-2.0-flash-lite',
    'src/chat.js:7:gpt-4-turbo',
    'src/chat.js:14:o3-mini',
    'src/chat.js:14:o4-mini',
  ]);
  assert.equal(scan.fileCount, 3, 'node_modules and non-code files are skipped');
});

// ---------- fix ----------

test('applyFixes replaces IDs and keeps prefixes and quotes', () => {
  const text = `a = "openai/gpt-3.5-turbo"\nb = 'us.anthropic.claude-sonnet-4-20250514-v1:0'\nmodel = \`o1\``;
  const { output, fixed, skipped } = applyFixes(text, scanText(text, catalog));
  assert.equal(output, `a = "openai/gpt-5.6-terra"\nb = 'us.anthropic.claude-sonnet-4-20250514-v1:0'\nmodel = \`gpt-5.6-sol\``);
  assert.equal(fixed.length, 2);
  assert.equal(skipped.length, 1, 'Bedrock entry has no drop-in replacement');
});

test('CLI scan prints findings and exits with code 1', () => {
  const r = runCli(['scan', FIXTURE]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /gpt-4-turbo\s+OpenAI API\s+shuts down 2026-10-23 \(in 16 days\)\s+→ gpt-5\.6-sol/);
  assert.match(r.stdout, /Found 10 deprecated model references in 3 of 3 files \(3 already shut down\)/);
});

test('CLI scan exits with code 0 on a clean project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'modelrot-clean-'));
  try {
    const r = runCli(['scan', dir]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No deprecated AI models found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI scan --json is valid JSON with dates and sources', () => {
  const r = runCli(['scan', FIXTURE, '--json']);
  const data = JSON.parse(r.stdout);
  assert.equal(data.findings.length, 10);
  const turbo = data.findings.find((f) => f.model === 'gpt-4-turbo');
  assert.equal(turbo.shutdown, '2026-10-23');
  assert.equal(turbo.source, 'https://developers.openai.com/api/docs/deprecations');
});

test('CLI fix --dry-run shows changes but does not touch files', () => {
  const dir = copyFixture();
  try {
    const before = readFileSync(join(dir, 'src/chat.js'), 'utf8');
    const r = runCli(['fix', dir, '--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /-\s+7 \| model: "gpt-4-turbo",/);
    assert.match(r.stdout, /\+\s+7 \| model: "gpt-5\.6-sol",/);
    assert.match(r.stdout, /8 replacements would be made/);
    assert.equal(readFileSync(join(dir, 'src/chat.js'), 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI fix rewrites files, then a new scan only shows manual items', () => {
  const dir = copyFixture();
  try {
    const r = runCli(['fix', dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Made 8 replacements/);
    const py = readFileSync(join(dir, 'scripts/summarize.py'), 'utf8');
    assert.match(py, /model="gpt-5\.6-sol",/);
    assert.match(py, /LEGACY = 'claude-haiku-4-5-20251001'/);
    assert.match(readFileSync(join(dir, 'src/agent.ts'), 'utf8'), /'models\/gemini-3\.5-flash-lite'/);
    const again = JSON.parse(runCli(['scan', dir, '--json']).stdout);
    assert.deepEqual(again.findings.map((f) => f.model).sort(), ['anthropic.claude-sonnet-4-20250514-v1:0', 'sora-2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI rejects unknown options and platforms', () => {
  assert.equal(runCli(['scan', '--nope']).status, 2);
  assert.equal(runCli(['scan', '--platform', 'gcp']).status, 2);
});

// ---------- config files (.env, YAML, JSON, TOML) ----------

const CONFIG_FIXTURE = fileURLToPath(new URL('./fixtures/config-project', import.meta.url));

function copyConfigFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'modelrot-config-'));
  cpSync(CONFIG_FIXTURE, dir, { recursive: true });
  return dir;
}

test('fileKind recognises config files and skips lockfiles', () => {
  assert.equal(fileKind('.env'), 'env');
  assert.equal(fileKind('app/.env.example'), 'env');
  assert.equal(fileKind('.env.production.local'), 'env');
  assert.equal(fileKind('config.yml'), 'yaml');
  assert.equal(fileKind('config.yaml'), 'yaml');
  assert.equal(fileKind('settings.json'), 'json');
  assert.equal(fileKind('pyproject.toml'), 'toml');
  assert.equal(fileKind('package-lock.json'), null);
  assert.equal(fileKind('pnpm-lock.yaml'), null);
  assert.equal(fileKind('README.md'), null);
});

test('.env: reads KEY=value, quoted values and export, ignores comments', () => {
  const env = 'OPENAI_MODEL=gpt-4\nB_MODEL="gpt-4-turbo"\nexport C_MODEL=\'o3-mini\' # note\n# D_MODEL=gpt-4\nTEXT=use gpt-4 here\n';
  assert.deepEqual(scanText(env, catalog, { kind: 'env' }).map((f) => `${f.line}:${f.id}`), ['1:gpt-4', '2:gpt-4-turbo', '3:o3-mini']);
});

test('.env: short IDs need a model-like key', () => {
  assert.equal(scanText('SESSION_ID=o1\n', catalog, { kind: 'env' }).length, 0);
  assert.equal(scanText('LLM=o1\n', catalog, { kind: 'env' }).length, 1);
});

test('YAML: reads key values and list items, ignores prose and comments', () => {
  const yaml = 'model: gpt-4\nmodels:\n  - "o1-pro"\n  - claude-2.1\ndescription: we left gpt-4\n# model: gpt-4\nmodel_b: gpt-4-turbo # old\n';
  assert.deepEqual(scanText(yaml, catalog, { kind: 'yaml' }).map((f) => `${f.line}:${f.id}`), ['1:gpt-4', '4:claude-2.1', '7:gpt-4-turbo']);
});

test('scanDirectory finds models in every config format', () => {
  const scan = scanDirectory(CONFIG_FIXTURE, catalog);
  const found = scan.results.flatMap((r) => r.findings.map((f) => `${r.file}:${f.line}:${f.id}`));
  assert.deepEqual(found, [
    '.env:4:gpt-4-turbo',
    '.env:5:o1',
    '.env.example:2:claude-sonnet-4-5-20250929',
    'deploy/app.yaml:3:gpt-3.5-turbo',
    'deploy/app.yaml:6:claude-3-haiku-20240307',
    'pyproject.toml:2:claude-3-5-sonnet-latest',
    'settings.json:2:gemini-2.0-flash',
  ]);
  assert.equal(scan.fileCount, 5, 'package-lock.json is skipped');
});

test('security: no command ever prints a secret from a config file', () => {
  const runs = [
    runCli(['scan', CONFIG_FIXTURE]),
    runCli(['scan', CONFIG_FIXTURE, '--json']),
    runCli(['fix', CONFIG_FIXTURE, '--dry-run']),
    runCli(['fix', CONFIG_FIXTURE, '--dry-run', '--json']),
  ];
  for (const r of runs) {
    assert.ok(r.stdout.length > 0);
    assert.doesNotMatch(r.stdout + r.stderr, /FAKE-SECRET|DATABASE_PASSWORD|API_KEY|api_key|token/);
  }
  assert.match(runs[2].stdout, /~\s+4 \| gpt-4-turbo → gpt-5\.6-sol/);
});

test('security: fix in a real run prints only model IDs and keeps secrets intact', () => {
  const dir = copyConfigFixture();
  try {
    const before = readFileSync(join(dir, '.env'), 'utf8');
    const r = runCli(['fix', dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /FAKE-SECRET/);
    assert.match(r.stdout, /Made 7 replacements/);
    const after = readFileSync(join(dir, '.env'), 'utf8');
    assert.equal(after, before.replace('=gpt-4-turbo', '=gpt-5.6-sol').replace("'o1'", "'gpt-5.6-sol'"));
    assert.match(readFileSync(join(dir, 'deploy/app.yaml'), 'utf8'), /model: gpt-5\.6-terra {2}# FAKE-SECRET-DO-NOT-PRINT-5555/);
    assert.match(readFileSync(join(dir, 'pyproject.toml'), 'utf8'), /model = "anthropic\/claude-sonnet-4-6"/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).model, 'gemini-3.6-flash');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

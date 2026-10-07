// Source of truth for catalog/models.json.
// Every date below was checked by hand against the official page in SOURCES.
// Run `npm run build:catalog` after editing, then `npm test`.
import { writeFileSync } from 'node:fs';

const SOURCES = {
  openai: 'https://developers.openai.com/api/docs/deprecations',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/model-deprecations',
  google: 'https://ai.google.dev/gemini-api/docs/deprecations',
  bedrock: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html',
  azure: 'https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule',
};

const models = [];
function add(provider, platform, shutdown, ids, replacement, extra = {}) {
  const source = platform === 'api' ? SOURCES[provider] : SOURCES[platform];
  for (const id of ids) models.push({ id, provider, platform, shutdown, replacement, ...extra, source });
}

// ---------- OpenAI API ----------
const O = (...a) => add('openai', 'api', ...a);
const PRO = { replacementNote: 'Set reasoning.mode to "pro" on the replacement.' };
const IMG = { alternatives: ['gpt-image-2.5-flare'] };
// Announced 2026-04-22, shutdown 2026-10-23
O('2026-10-23', ['gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'gpt-3.5-turbo-completions'], 'gpt-5.6-terra');
O('2026-10-23', ['gpt-4', 'gpt-4-0613', 'gpt-4-0613-completions', 'gpt-4-completions', 'gpt-4-1106-preview'], 'gpt-5.6-sol');
O('2026-10-23', ['gpt-4-turbo', 'gpt-4-turbo-2024-04-09', 'gpt-4-turbo-completions', 'gpt-4o-2024-05-13'], 'gpt-5.6-sol');
O('2026-10-23', ['gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14'], 'gpt-5.6-luna');
O('2026-10-23', ['gpt-image-1'], 'gpt-image-2.5-sunburst', IMG);
O('2026-10-23', ['o1', 'o1-2024-12-17', 'o3-mini', 'o3-mini-2025-01-31'], 'gpt-5.6-sol');
O('2026-10-23', ['o1-pro', 'o1-pro-2025-03-19'], 'gpt-5.6-sol', PRO);
O('2026-10-23', ['o4-mini', 'o4-mini-2025-04-16'], 'gpt-5.6-terra');
// Announced 2026-06-02, shutdown 2026-12-01
O('2026-12-01', ['gpt-image-1-mini', 'gpt-image-1.5', 'chatgpt-image-latest'], 'gpt-image-2.5-sunburst', IMG);
// Announced 2026-06-11, shutdown 2026-12-11 (the page lists dated snapshots only, not the aliases)
O('2026-12-11', ['gpt-5-2025-08-07', 'o3-2025-04-16'], 'gpt-5.6-sol');
O('2026-12-11', ['gpt-5-mini-2025-08-07'], 'gpt-5.6-terra');
O('2026-12-11', ['gpt-5-nano-2025-08-07'], 'gpt-5.6-luna');
O('2026-12-11', ['gpt-5-pro-2025-10-06', 'o3-pro-2025-06-10'], 'gpt-5.6-sol', PRO);
// Announced 2026-10-01, shutdown 2027-01-06
O('2027-01-06', ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts-2025-03-20', 'gpt-4o-mini-tts-2025-12-15'], 'gpt-realtime-2.1-mini');
// Announced 2026-07-20, shutdown 2027-01-20
O('2027-01-20', ['gpt-realtime'], 'gpt-realtime-2.1');
O('2027-01-20', ['gpt-realtime-mini'], 'gpt-realtime-2.1-mini');
O('2027-01-20', ['gpt-audio', 'gpt-audio-mini'], 'gpt-audio-1.5');
O('2027-01-20', ['gpt-4o-mini-transcribe-2025-03-20'], 'gpt-4o-mini-transcribe-2025-12-15');
// Announced 2026-08-26, shutdown 2027-02-26
O('2027-02-26', ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe-diarize'], 'gpt-transcribe', { alternatives: ['gpt-live-transcribe'] });
// Announced 2026-10-01, shutdown 2027-04-01
O('2027-04-01', ['gpt-5.1', 'gpt-5.3-codex'], 'gpt-6-sol');
O('2027-04-01', ['gpt-5.4-nano'], 'gpt-6-luna');
// Already shut down
O('2026-10-01', ['gpt-5.4-cyber'], null, { replacementNote: 'Use the most capable cyber model available to your organization.' });
O('2026-09-28', ['gpt-3.5-turbo-instruct', 'babbage-002', 'davinci-002', 'gpt-3.5-turbo-1106'], 'gpt-5.6-terra');
O('2026-09-24', ['sora-2', 'sora-2-pro', 'sora-2-2025-10-06', 'sora-2-2025-12-08', 'sora-2-pro-2025-10-06'], null, { replacementNote: 'The Videos API was shut down with no replacement.' });
O('2026-08-10', ['gpt-5.2-chat-latest', 'gpt-5.3-chat-latest'], 'gpt-5.6-sol');
O('2026-07-23', ['gpt-5-chat-latest', 'gpt-5-codex', 'gpt-5.1-chat-latest', 'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.2-codex'], 'gpt-5.6-sol');
O('2026-07-23', ['o3-deep-research', 'o3-deep-research-2025-06-26', 'o4-mini-deep-research', 'o4-mini-deep-research-2025-06-26'], 'gpt-5.6-sol');
O('2026-07-23', ['gpt-5.1-codex-mini', 'computer-use-preview', 'computer-use-preview-2025-03-11', 'gpt-4o-search-preview-2025-03-11', 'gpt-4o-mini-search-preview-2025-03-11'], 'gpt-5.6-terra');
O('2026-05-12', ['dall-e-2', 'dall-e-3'], 'gpt-image-2');
O('2026-05-07', ['gpt-4o-realtime-preview', 'gpt-4o-realtime-preview-2025-06-03', 'gpt-4o-realtime-preview-2024-12-17'], 'gpt-realtime-1.5');
O('2026-05-07', ['gpt-4o-mini-realtime-preview'], 'gpt-realtime-mini');
O('2026-05-07', ['gpt-4o-audio-preview'], 'gpt-audio-1.5');
O('2026-05-07', ['gpt-4o-mini-audio-preview'], 'gpt-audio-mini');
O('2026-03-26', ['gpt-4-0314', 'gpt-4-0125-preview', 'gpt-4-turbo-preview'], 'gpt-4.1', { alternatives: ['gpt-5'] });
O('2026-02-17', ['chatgpt-4o-latest'], 'gpt-5.1-chat-latest');
O('2025-10-27', ['o1-mini'], 'o4-mini');
O('2025-07-28', ['o1-preview'], 'o3');
O('2025-07-14', ['gpt-4.5-preview'], 'gpt-4.1');

// ---------- Anthropic API ----------
const A = (...a) => add('anthropic', 'api', ...a);
A('2026-11-30', ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-5'], 'claude-sonnet-5-5');
A('2026-08-05', ['claude-opus-4-1-20250805', 'claude-opus-4-1'], 'claude-opus-4-8');
A('2026-06-15', ['claude-opus-4-20250514', 'claude-opus-4-0'], 'claude-opus-4-8');
A('2026-06-15', ['claude-sonnet-4-20250514', 'claude-sonnet-4-0'], 'claude-sonnet-4-6');
A('2026-04-20', ['claude-3-haiku-20240307'], 'claude-haiku-4-5-20251001');
A('2026-02-19', ['claude-3-5-haiku-20241022', 'claude-3-5-haiku-latest'], 'claude-haiku-4-5-20251001');
A('2026-02-19', ['claude-3-7-sonnet-20250219', 'claude-3-7-sonnet-latest'], 'claude-sonnet-4-6');
A('2026-01-05', ['claude-3-opus-20240229', 'claude-3-opus-latest'], 'claude-opus-4-8');
A('2025-10-28', ['claude-3-5-sonnet-20240620', 'claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-latest'], 'claude-sonnet-4-6');
A('2025-07-21', ['claude-3-sonnet-20240229'], 'claude-sonnet-4-6');
A('2025-07-21', ['claude-2.0', 'claude-2.1'], 'claude-opus-4-8');
A('2024-11-06', ['claude-instant-1.2'], 'claude-haiku-4-5-20251001');

// ---------- Google Gemini API ----------
const G = (...a) => add('google', 'api', ...a);
G('2026-10-22', ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview', 'gemini-omni-flash-preview'], 'gemini-omni-1.1-flash');
G('2026-11-17', ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'], 'gemini-3.8-flash-tts', { alternatives: ['gemini-3.8-flash-lite-tts'] });
G('2026-11-17', ['gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-preview-12-2025'], 'gemini-3.8-live');
G('2027-03-15', ['gemini-2.5-flash-image'], 'gemini-3.1-flash-lite-image');
G('2027-05-07', ['gemini-3.1-flash-lite'], 'gemini-3.5-flash-lite');
G('2026-08-31', ['gemini-robotics-er-1.6-preview'], 'gemini-robotics-er-2-preview');
G('2026-08-17', ['imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001', 'imagen-4.0-fast-generate-001'], 'gemini-nano-banana-2.1');
G('2026-08-10', ['embedding-2-preview'], 'gemini-embedding-2');
G('2026-07-28', ['gemini-2.5-computer-use-preview-10-2025'], 'gemini-3.8-flash');
G('2026-06-30', ['veo-3.0-generate-001', 'veo-2.0-generate-001'], 'veo-3.1-generate-preview');
G('2026-06-30', ['veo-3.0-fast-generate-001'], 'veo-3.1-fast-generate-preview');
G('2026-06-01', ['gemini-2.0-flash', 'gemini-2.0-flash-001'], 'gemini-3.6-flash');
G('2026-06-01', ['gemini-2.0-flash-lite', 'gemini-2.0-flash-lite-001'], 'gemini-3.1-flash-lite');

// ---------- AWS Bedrock (its dates differ from the providers' own) ----------
const BR = { replacementNote: 'Pick an Active Claude model ID from the Amazon Bedrock model cards.' };
add('anthropic', 'bedrock', '2026-10-14', ['anthropic.claude-sonnet-4-20250514-v1:0'], null, BR);
add('anthropic', 'bedrock', '2027-01-08', ['anthropic.claude-opus-4-1-20250805-v1:0'], null, BR);
add('anthropic', 'bedrock', '2026-09-10', ['anthropic.claude-3-haiku-20240307-v1:0'], null, BR);

// ---------- Azure (Microsoft Foundry) ----------
// Only models where every listed version retires, so the name alone is enough.
const AZ = { replacementNote: 'Azure lists no replacement yet: check the retirement schedule.' };
const Z = (provider, date, ids, repl) => add(provider, 'azure', date, ids, repl, repl ? {} : AZ);
Z('openai', '2026-10-14', ['gpt-4.1-nano'], null);
Z('openai', '2026-10-15', ['gpt-4o-transcribe'], null);
Z('openai', '2026-10-23', ['gpt-image-1'], null);
Z('openai', '2026-11-15', ['codex-mini'], null);
Z('openai', '2026-11-19', ['o1', 'o1-pro', 'o3', 'o3-deep-research', 'o3-pro'], 'gpt-5.6-sol');
Z('openai', '2026-11-19', ['o3-mini', 'o4-mini'], 'gpt-5.6-terra');
Z('openai', '2026-12-15', ['tts', 'tts-hd', 'whisper'], null);
Z('openai', '2026-12-16', ['gpt-image-1.5'], null);
Z('anthropic', '2026-11-15', ['claude-haiku-4-5'], null);
Z('anthropic', '2026-11-24', ['claude-opus-4-5'], null);
Z('anthropic', '2026-11-30', ['claude-sonnet-4-5'], 'claude-sonnet-5-5');

const catalog = {
  updated: '2026-10-07',
  sources: SOURCES,
  models: models.sort((a, b) => a.shutdown.localeCompare(b.shutdown) || a.id.localeCompare(b.id)),
};
writeFileSync(new URL('../catalog/models.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Wrote ${models.length} entries to catalog/models.json`);

import { readFileSync } from 'node:fs';

export const PLATFORMS = ['api', 'bedrock', 'azure'];
export const PLATFORM_LABELS = { api: 'API', bedrock: 'AWS Bedrock', azure: 'Azure' };
export const PROVIDER_LABELS = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' };

const BEDROCK_REGION_PREFIX = /^(?:us|eu|apac|jp|au|ca|us-gov|global)\./;

export function loadCatalog(path = new URL('../catalog/models.json', import.meta.url)) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const byId = new Map();
  for (const entry of data.models) {
    if (!byId.has(entry.id)) byId.set(entry.id, []);
    byId.get(entry.id).push(entry);
  }
  return { ...data, byId };
}

export function platformLabel(entry) {
  const provider = PROVIDER_LABELS[entry.provider] ?? entry.provider;
  return entry.platform === 'api' ? `${provider} API` : `${PLATFORM_LABELS[entry.platform]} (${provider})`;
}

/**
 * Looks for a deprecated model ID inside the text of one string literal.
 * Accepts routing prefixes like "openai/gpt-4" or "models/gemini-2.0-flash"
 * and Bedrock cross-region prefixes like "us.anthropic.claude-...".
 * Returns { id, offset } where offset is the position of the ID in the text.
 */
export function matchModelId(text, catalog) {
  const slash = text.lastIndexOf('/');
  let offset = slash + 1;
  let candidate = text.slice(offset);
  if (catalog.byId.has(candidate)) return { id: candidate, offset };
  const region = candidate.match(BEDROCK_REGION_PREFIX);
  if (region) {
    candidate = candidate.slice(region[0].length);
    offset += region[0].length;
    if (catalog.byId.get(candidate)?.some((e) => e.platform === 'bedrock')) return { id: candidate, offset };
  }
  return null;
}

export function entriesFor(id, catalog, platform) {
  const entries = catalog.byId.get(id) ?? [];
  return platform ? entries.filter((e) => e.platform === platform) : entries;
}

/** The entry to show first: the provider's own API, otherwise the earliest shutdown. */
export function primaryEntry(entries) {
  return entries.find((e) => e.platform === 'api') ?? [...entries].sort((a, b) => a.shutdown.localeCompare(b.shutdown))[0];
}

/**
 * Follows the replacement chain on the same platform, so a replacement that is
 * itself deprecated (e.g. gemini-2.0-flash-lite -> gemini-3.1-flash-lite) is skipped.
 */
export function resolveReplacement(entry, catalog) {
  let current = entry;
  const seen = new Set([entry.id]);
  while (current.replacement) {
    const next = (catalog.byId.get(current.replacement) ?? []).find((e) => e.platform === entry.platform);
    if (!next || !next.replacement || seen.has(next.id)) return current.replacement;
    seen.add(next.id);
    current = next;
  }
  return null;
}

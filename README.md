# modelrot

**Find the AI models in your code that are about to stop working, and swap them for their official replacements.**

OpenAI shuts down `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`, `o1`, `o3-mini` and `o4-mini` on **October 23, 2026**. Claude Sonnet 4.5 follows on **November 30, 2026**, and dated GPT-5 and o3 snapshots on **December 11, 2026**. Once a model is shut down, every call to it fails. modelrot finds those model IDs in your JavaScript, TypeScript and Python code and tells you what to use instead.

```bash
npx modelrot scan
```

No install, no config, no API key. Nothing leaves your machine.

## Example

```text
$ npx modelrot scan

scripts/summarize.py
  8:16    gpt-4  OpenAI API  shuts down 2026-10-23 (in 16 days)  → gpt-5.6-sol
          shutdown date: https://developers.openai.com/api/docs/deprecations
          replacement:   https://developers.openai.com/api/docs/deprecations
          replacement:   https://developers.openai.com/api/docs/models/gpt-5.6-sol

src/agent.ts
  5:31    claude-sonnet-4-5-20250929  Anthropic API  shuts down 2026-11-30 (in 54 days)  → claude-sonnet-5-5
          shutdown date: https://platform.claude.com/docs/en/about-claude/model-deprecations
          replacement:   https://platform.claude.com/docs/en/about-claude/model-deprecations
  8:34    anthropic.claude-sonnet-4-20250514-v1:0  AWS Bedrock (Anthropic)  shuts down 2026-10-14 (in 7 days)  → fix by hand
          Pick an Active Claude model ID from the Amazon Bedrock model cards.
          shutdown date: https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html

config/app.yaml
  3:10    claude-3-5-sonnet-latest  Anthropic API  shut down on 2025-10-28  → fix by hand
          The suggested replacement could not be confirmed on the official pages. Check https://platform.claude.com/docs/en/about-claude/model-deprecations
          shutdown date: https://platform.claude.com/docs/en/about-claude/model-deprecations

Found 4 deprecated model references in 3 of 12 files (1 already shut down).
Preview the fixes with npx modelrot fix --dry-run
```

## Fix it

Preview the changes first. `--dry-run` changes nothing on disk:

```bash
npx modelrot fix --dry-run
```

```text
src/chat.js
  -    7 | model: "gpt-4-turbo",
  +    7 | model: "gpt-5.6-sol",
```

Then apply them:

```bash
npx modelrot fix
```

**Your secrets stay private.** Config files often hold API keys and passwords, so for `.env`, YAML, JSON and TOML files modelrot never prints the line. It only shows the model IDs, as in `~ 4 | gpt-4-turbo → gpt-5.6-sol`. This applies to `scan`, `fix`, `--dry-run` and `--json`.

modelrot only changes the model ID inside the string, so `"openai/gpt-4"` becomes `"openai/gpt-5.6-sol"` and the quotes and prefix stay as they are. **modelrot only applies a replacement that is confirmed on the official pages** (see [How replacements are verified](#how-replacements-are-verified)). Everything else is shown as **fix by hand**, with the reason, and is never changed automatically. A newer model can behave differently, so **review the diff and run your tests before you ship**.

## Commands

| Command | What it does |
| --- | --- |
| `npx modelrot scan [dir]` | Lists deprecated models with file, line, shutdown date, replacement and official source. Exits with code `1` when it finds any, so it can fail a CI job. |
| `npx modelrot fix [dir] --dry-run` | Shows every replacement without writing anything. |
| `npx modelrot fix [dir]` | Replaces deprecated model IDs in place. |
| `npx modelrot list` | Prints the whole catalog. |

| Option | |
| --- | --- |
| `--platform api\|bedrock\|azure` | Only use dates for one platform. Azure and Bedrock retire models on their own schedules. |
| `--json` | Machine-readable output. |
| `--no-color` | Plain output. Also respects `NO_COLOR`. |

### Use it in CI

```yaml
# .github/workflows/modelrot.yml
name: modelrot
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx modelrot scan
```

## What it detects

- **Code:** `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.py`.
- **Config:** `.env`, `.env.*` (`.env.example`, `.env.local`…), `.yaml`, `.yml`, `.json`, `.toml`. Lockfiles, `node_modules`, virtualenvs and build folders are skipped.
- **Exact model IDs only.** In code and JSON/TOML, modelrot reads string literals. In `.env` and YAML, it reads whole values (`OPENAI_MODEL=gpt-4`, `model: gpt-4`, `- gpt-4`). `"gpt-4"` matches, while `"gpt-4o"`, `"gpt-4.1"`, a `gpt-4` in a sentence and a `gpt-4` in a comment do not.
- **Short IDs** such as `o1`, `o3-mini` or `tts` count only when the line mentions a model (`model`, `engine`, `deployment` or `llm`), so `{ id: "o1" }` and `SESSION_ID=o1` are ignored.
- **Prefixes:** router prefixes like `openai/gpt-4` or `models/gemini-2.0-flash`, and Bedrock cross-region prefixes like `us.anthropic.claude-...`.
- **Replacement chains:** if the official replacement is itself deprecated, modelrot follows the chain to a model that is not.

## The catalog

[`catalog/models.json`](catalog/models.json) is a public, machine-readable list of deprecated models with:

- `id`: the exact model ID
- `provider`: `openai`, `anthropic` or `google`
- `platform`: `api` for the provider's own API, `bedrock` for AWS Bedrock, or `azure` for Azure / Microsoft Foundry
- `shutdown`: the date calls start failing (`YYYY-MM-DD`)
- `replacement`: the officially recommended replacement, plus `alternatives` and a `replacementNote` when needed
- `replacementVerified`: `true` only when the replacement passed both checks below
- `replacementSources`: the official pages that confirm the replacement
- `source`: the official page the date comes from

### How replacements are verified

[`scripts/verify-catalog.mjs`](scripts/verify-catalog.mjs) downloads the official pages and checks every replacement twice:

1. **Recommended:** the deprecated model and its replacement appear in the same row of the provider's official deprecation table.
2. **Exists:** the replacement is a live model that is not itself deprecated. For OpenAI, it has its own page under `developers.openai.com/api/docs/models/` without a deprecation notice. For Anthropic, it is marked *Active* in the official status table. For Google, it is listed on the models or embeddings page. For Azure, it has its own *GA* row in the retirement schedule.

If the replacement is itself deprecated, it still counts when its own replacement is verified, and modelrot follows the chain. All other replacements show as **fix by hand**. That includes undocumented aliases such as `claude-3-5-sonnet-latest`, and cases where the official page names several options, such as "gpt-5 or gpt-4.1".

| Provider / platform | Official source |
| --- | --- |
| OpenAI API | [developers.openai.com/api/docs/deprecations](https://developers.openai.com/api/docs/deprecations) |
| Anthropic API | [platform.claude.com/docs/en/about-claude/model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| Google Gemini API | [ai.google.dev/gemini-api/docs/deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| AWS Bedrock | [Bedrock model lifecycle](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html) |
| Azure / Microsoft Foundry | [Model retirement schedule](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule) |

Last checked: **2026-10-07**. Providers change these pages. If a date is wrong or missing, please [open an issue](https://github.com/timo6pi-glitch/modelrot/issues) with a link to the official page.

### Known limits

- OpenAI lists the dated GPT-5 and o3 snapshots (`gpt-5-2025-08-07`, `o3-2025-04-16`…) for December 11, 2026, but not the `gpt-5` and `o3` aliases, so modelrot does not flag the aliases.
- On Azure, your code usually holds a *deployment name* you chose yourself, not the model name, so modelrot cannot see it. Check your deployments in the Azure portal. Names that retire only on Azure, such as `claude-haiku-4-5`, stay valid on the provider's own API, so they are reported only with `--platform azure`.
- Model IDs built at runtime, such as `` `gpt-${version}` ``, or read from environment variables are not detected.

## Contributing

```bash
git clone https://github.com/timo6pi-glitch/modelrot.git
cd modelrot
npm test
```

The catalog is generated from [`scripts/build-catalog.mjs`](scripts/build-catalog.mjs). Edit that file, run `npm run build:catalog` (it rebuilds the catalog and re-checks every replacement against the official pages), and commit both files. `npm run verify:catalog` re-checks without writing anything. modelrot has zero dependencies and needs Node.js 18 or newer.

## License

[MIT](LICENSE)

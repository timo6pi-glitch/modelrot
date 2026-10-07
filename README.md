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
          https://developers.openai.com/api/docs/deprecations
  14:11   claude-3-haiku-20240307  Anthropic API  shut down on 2026-04-20  → claude-haiku-4-5-20251001
          https://platform.claude.com/docs/en/about-claude/model-deprecations

src/agent.ts
  5:31    claude-sonnet-4-5-20250929  Anthropic API  shuts down 2026-11-30 (in 54 days)  → claude-sonnet-5-5
          https://platform.claude.com/docs/en/about-claude/model-deprecations
  8:34    anthropic.claude-sonnet-4-20250514-v1:0  AWS Bedrock (Anthropic)  shuts down 2026-10-14 (in 7 days)  → no drop-in replacement
          Pick an Active Claude model ID from the Amazon Bedrock model cards.

src/chat.js
  7:11    gpt-4-turbo  OpenAI API  shuts down 2026-10-23 (in 16 days)  → gpt-5.6-sol
  14:36   o3-mini  OpenAI API  shuts down 2026-10-23 (in 16 days)  → gpt-5.6-sol
          also on Azure (OpenAI): 2026-11-19

Found 6 deprecated model references in 3 of 3 files (1 already shut down).
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

modelrot only changes the model ID inside the string, so `"openai/gpt-4"` becomes `"openai/gpt-5.6-sol"` and the quotes and prefix stay as they are. Models with no drop-in replacement are listed for you to fix by hand. A newer model can behave differently, so **review the diff and run your tests before you ship**.

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
- `source`: the official page the date comes from

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

The catalog is generated from [`scripts/build-catalog.mjs`](scripts/build-catalog.mjs). Edit that file, run `npm run build:catalog`, and commit both files. modelrot has zero dependencies and needs Node.js 18 or newer.

## License

[MIT](LICENSE)

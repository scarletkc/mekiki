# The model list

The models on the site are not picked by hand. `pnpm sync` builds the list from the
sources every day and writes it to `data/models.json`. Hand-written corrections go in
`data/model-overrides.yaml`.

## Who gets listed

A model is listed when all three hold:

1. Artificial Analysis has an Intelligence Index for it.
2. It is on at least one Arena board (text, WebDev or Agent).
3. models.dev has an official price for it: a price from the provider that makes the
   model, not from a reseller or a host of open weights.

One row per model. Where a source lists a model once per reasoning level, the highest
level is used. A model is `legacy` (collapsed on the home page) when the list has a
newer version of it: same vendor, same name once the version number is taken out,
higher version, as with Claude Opus 5 next to Claude Opus 5.5.

## How names are matched

Every source spells a model differently ("GPT-6.1 Sol (Max)", `gpt-6-1-sol`,
`gpt-6.1-sol`). Discovery matches them by an exact normalised key: it drops anything in
parentheses (reasoning level, build date, harness), dated build suffixes, and everything
that is not a letter or a digit. Nothing is matched by similarity. Artificial Analysis is
matched on its slug.

Where a board lists a model only in a special setup, such as "(xHigh, Codex Harness)",
that board is left empty for the model, and the sync reports it.

## Reading the sync report

`pnpm sync` prints what changed in the list, and the daily workflow writes the same to its
job summary:

```text
Model list: updated (31 models).
  Added:
    moonshotai/kimi-k3.1-pro (Moonshot AI, released 2026-10-23, 3 Arena boards, LiveBench)
  Left out:
    gpt-oss-120b: no official price (maker openai; on models.dev at cerebras, …)
    gpt-5-6-sol: on AA (gpt-5-6-sol) without an Intelligence Index
    qwen3-8-max: not on AA's list under this name (close: qwen3-8-27b)
  Left to a human (only special setups listed):
    arena_webdev: GPT-5.6 Sol (xHigh, Codex Harness)
```

- **No official price**: the maker sells no API for it, or its provider ID on models.dev
  differs from the maker's name. For the second, add an alias.
- **On AA without an Intelligence Index**: Artificial Analysis lists the model but has
  not scored it on the current index. Nothing to fix.
- **Not on AA's list under this name**: on an Arena board with an official price, but
  the AA list has no slug with that name. If one of the close slugs is the same model,
  add the model by hand under `models` with its mappings.

Without `AA_API_KEY`, or when any source fails, the previous list is kept. So is it when
discovery finds fewer than half as many models as last time.

## Corrections

Edit `data/model-overrides.yaml`; never `data/models.json`, which the next sync rewrites.

```yaml
exclude:
  - openai/gpt-5.6-luna          # never list this model

aliases:
  Moonshot: moonshotai           # maker name -> models.dev provider ID

vendors:
  xAI: SpaceXSI                  # vendor name as generated -> the name shown

models:
  moonshotai/kimi-k3:
    status: legacy               # wins over the version rule
  openai/gpt-6.1-terra:
    sources:
      arena_text: null           # not on that board, whatever discovery finds
      livebench: gpt-6.1-terra   # map a board by hand
  deepseek/deepseek-v4-pro:
    price: { input: 0.66, output: 1.98 }   # USD per 1M tokens; cache_read is optional
  acme/new-model:                # not discovered: add it by hand
    name: New Model
    vendor: Acme
    sources:
      aa: new-model
      arena_text: "New Model (High)"
```

- A correction for a model that is not listed waits until discovery finds it, unless it
  has a name and a vendor, which add the model by hand. The sync lists corrections that
  are waiting.
- A model's ID is its models.dev ID, `<provider>/<model>`, kept as models.dev writes it.
- `vendors` renames a vendor on every model it makes, including models discovered later,
  so the version rule still compares them with each other. It changes only the name
  shown, never the IDs. A model's own `vendor` correction wins.
- A price override replaces the models.dev input and output prices. Without
  `cache_read`, the models.dev cache price is kept.
- OpenRouter usage is matched by ID, not by discovery: vendor names (`x-ai`, `z-ai`,
  `mistralai`), dots against dashes and a trailing build date are normalised, then the
  match must be exact. When OpenRouter has several builds of a model, nothing is matched
  and the sync lists them; pin one with `sources.openrouter: <permaslug>`, or turn
  matching off with `sources.openrouter: null`.
- An invalid overrides file fails `pnpm test`, `pnpm build` and `pnpm sync` with the field
  that is wrong.

After editing, run `pnpm sync` (or wait for the daily workflow) and `pnpm report` to see
the effect.

## Good to know

- **Intelligence needs no upkeep.** Every score is normalised to the current leader on
  each sync, so nothing needs revisiting when a new model takes the lead.
- **A model missing from a leaderboard is rated on the rest**, and the model page says
  how many it is on.
- **The list moves everyone's value a little.** Value measures token use against the
  median of the listed models, so a model joining or
  leaving the list nudges the others.

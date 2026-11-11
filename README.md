<div align="center">

<img src="docs/assets/logo.svg" alt="mekiki logo" width="96" />

# mekiki

**AI models rated on intelligence, cost and value from public leaderboards and official prices, with a free JSON API.**

[Website](https://mekiki.fog.moe) | [Method](https://mekiki.fog.moe/method) | [API](https://mekiki.fog.moe/api)

[![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![API](https://img.shields.io/badge/API-JSON%20%2B%20CORS-2EA44F)](https://mekiki.fog.moe/api)
[![Data](https://img.shields.io/badge/data-refreshed%20daily-C2452B)](docs/SPEC.md#4-data)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

mekiki rates a short list of AI models on how smart they are, what they cost, and how much
intelligence you get for the money. The numbers come from public leaderboards and
official prices, and refresh every day.

- **No hand-entered scores.** Intelligence combines four public leaderboards: the
  Artificial Analysis Intelligence Index, Arena's text and WebDev boards, and LiveBench.
  Every weight and threshold is published on the Method page.
- **Value counts the tokens a model burns.** Two models with the same price per token can
  cost very different amounts to use. Value is priced on what it actually cost to run each
  model through the same benchmark, not on the price list alone.
- **Measured against today's leader.** Scores are normalised to the current best model,
  so an old flagship slides down when a new one arrives.
- **Curated.** The models worth comparing, not every model ever released.
- **Open data.** Every rating is in a free JSON API that any site can call.

## Features

- **Model table**: sort by any column, filter by vendor, tier or open weights, and search
  by name. The URL keeps the view, so you can share it.
- **Model pages**: how the intelligence score is built, leaderboard by leaderboard; price,
  context window, release date and modalities; links to the source data.
- **Compare**: up to four models side by side, with the best figure in each row in bold.
- **Share**: a link that opens in the reader's own language, with a preview image for
  every model.
- **Method page**: every formula, weight and threshold, generated from the same config the
  scores are computed with.
- **JSON API**: the full dataset, a model list, one file per model, and the history.
- **Daily updates**: prices and leaderboard scores are fetched again every day.
- **Changelog and RSS**: what changed in the ratings, day by day, with a feed per
  language. Each model page charts its intelligence and value over time.
- **Languages**: English, Simplified Chinese and Traditional Chinese, in dark or light,
  on a desktop or a phone.

## How the ratings work

**Intelligence** is one score blended from four leaderboards, and each one counts once.
A leaderboard the Artificial Analysis Intelligence Index already contains, such as
Terminal-Bench, is not used. The index and Arena's text and WebDev boards count the same;
LiveBench counts only for the categories the index does not test, which carry 61% of
LiveBench's own weights. Each leaderboard is normalised so its current leader scores 100,
and a model is rated on the leaderboards it is on. A model on none of them is shown as not
rated, never as 0.

**Cost** is a blended price per million tokens that mixes the official cache-read, input
and output prices in the proportions of typical agent and chat use, where most input is
served from the prompt cache. Its tier, from Low to Very high, follows the price itself.

**Value** weighs intelligence against what the model costs to run. Artificial Analysis
publishes what it paid to run its whole benchmark on each model, so a model that thinks
for longer pays for it here even when its price per token is low. Value is a geometric
mean: smart but very expensive and cheap but dim both score low.

The [Method page](https://mekiki.fog.moe/method) has the formulas and the current
weights and thresholds.

## Use the API

Everything on the site is also JSON. `/api.json` holds every rating, `/api/models.json`
lists the models, `/api/models/<provider>/<model>.json` returns one model, and
`/api/history.json` has the ratings as recorded each day. Any site can call it from the
browser.

```bash
curl -s https://mekiki.fog.moe/api.json | jq '.models[] | {name, intelligence: .intelligence.score, value: .value.tier}'
```

Missing values are `null`, and fields are only ever added: a breaking change bumps
`version`. The [API page](https://mekiki.fog.moe/api) documents every field with a live
example.

## Missing a model?

[Open an issue](https://github.com/scarletkc/mekiki/issues) with its
[models.dev](https://models.dev) ID. Or add it yourself: a model is a single Markdown
file, and [adding a model](docs/adding-models.md) walks through it.

## Documentation

- [Method](https://mekiki.fog.moe/method): formulas, current weights and thresholds, and when each source last changed
- [API reference](https://mekiki.fog.moe/api): every field, with a live example
- [Adding a model](docs/adding-models.md): the model file, mapping it to each leaderboard, and price overrides
- [Development guide](docs/development.md): running locally, commands, tuning the ratings, and adding a language
- [Deployment](docs/deployment.md): the daily workflow and one-time setup
- [Design](docs/SPEC.md): rules, data model, rating algorithm, and the API contract

## Data sources

| Source | Used for |
| --- | --- |
| [Artificial Analysis](https://artificialanalysis.ai/) | Intelligence Index, and what it cost to run the index on each model |
| [Arena](https://arena.ai/leaderboard) | Text and WebDev leaderboard ratings, from the [`lmarena-ai/leaderboard-dataset`](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) dataset (CC BY 4.0) |
| [LiveBench](https://livebench.ai/) | Score across the categories the AA index does not test |
| [models.dev](https://models.dev) | Prices, context window, release date, open weights and modalities |

Thanks to all of them. Every page credits them; if you republish the data, credit them
too.

## License

Code is licensed under [MIT](LICENSE). Leaderboard and price data belong to their
sources.

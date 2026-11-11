<div align="center">

<img src="docs/assets/logo.svg" alt="mekiki logo" width="96" />

# mekiki

**AI models rated on intelligence, cost and value from public leaderboards and official prices, with a free JSON API.**

[Website](https://mekiki.fog.moe) | [Method](https://mekiki.fog.moe/method) | [API](https://mekiki.fog.moe/api)

[![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![API](https://img.shields.io/badge/API-JSON%20%2B%20CORS-2EA44F)](https://mekiki.fog.moe/api)
[![Data](https://img.shields.io/badge/data-refreshed%20daily-C2452B)](#data-sources)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

mekiki rates current AI models on how smart they are, what they cost, and how much
intelligence you get for the money. The numbers come from public leaderboards and
official prices, and refresh every day.

- **No hand-entered scores.** Intelligence combines five public leaderboards: the
  Artificial Analysis Intelligence Index, Arena's text, WebDev and Agent boards, and
  LiveBench.
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
  by name. The URL keeps the view, so you can share it. An optional column shows each
  model's usage rank on OpenRouter over the last 7 days, for reference only.
- **Charts**: the same models as a quadrant of intelligence against price, as ranked bars,
  or as a trend over the recorded history. Every chart carries the site's address and
  exports as a PNG.
- **Model pages**: how the intelligence score is built, leaderboard by leaderboard; price,
  context window, release date and modalities; usage on OpenRouter; links to the source
  data; and a discussion thread. The thread is a GitHub Discussions thread in a
  third-party iframe from [giscus](https://giscus.app); posting needs a GitHub account.
- **Compare**: up to four models side by side, with the best figure in each row in bold.
- **Share**: a link that opens in the reader's own language, with a preview image for
  every model.
- **Method page**: every formula, weight and threshold, generated from the same config the
  scores are computed with.
- **JSON API**: the full dataset, a model list, one file per model, and the history.
- **Readable by AI agents**: [`/llms.txt`](https://mekiki.fog.moe/llms.txt) indexes the
  site, and every page but Compare has a Markdown version, such as
  [`/en/method.md`](https://mekiki.fog.moe/en/method.md).
- **Daily updates**: prices and leaderboard scores are fetched again every day.
- **Changelog and RSS**: what changed in the ratings, day by day, with a feed per
  language. Each model page charts its intelligence and value over time.
- **Languages**: English, Simplified Chinese and Traditional Chinese, in dark or light,
  on a desktop or a phone.

## How the ratings work

**Intelligence** is one score blended from five leaderboards, and each one counts once.
A leaderboard the Artificial Analysis Intelligence Index already contains, such as
Terminal-Bench, is not used. The index and Arena's text, WebDev and Agent boards count the
same;
LiveBench counts only for the categories the index does not test, which carry 61% of
LiveBench's own weights. Each leaderboard is normalised so its current leader scores 100,
and a model is rated on the leaderboards it is on. A model on none of them is shown as not
rated, never as 0.

**Cost** is a blended price per million tokens that mixes the official cache-read, input
and output prices in the proportions of typical agent and chat use, where most input is
served from the prompt cache. Its tier, from Very low to Very high, follows the price itself.

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

## Feedback

A rating looks wrong, the method seems unreasonable, a model is missing, or something is
broken? [Open an issue](https://github.com/scarletkc/mekiki/issues/new/choose) and pick
the form that fits; the feedback link on the site leads there too. For a missing model,
give its [models.dev](https://models.dev) ID: the list is built from the sources every day
([the model list](docs/model-list.md) explains who gets in), and a model left out can be
added by hand in `data/model-overrides.yaml`.

mekiki does not accept pull requests from outside contributors.
[Contributing](CONTRIBUTING.md) explains how to become one.

## Documentation

- [Method](https://mekiki.fog.moe/method): formulas, current weights and thresholds, and when each source last changed
- [API reference](https://mekiki.fog.moe/api): every field, with a live example
- [The model list](docs/model-list.md): who gets listed, how names are matched, and corrections
- [Development guide](docs/development.md): running locally, commands, tuning the ratings, and adding a language
- [Deployment](docs/deployment.md): the daily workflow and one-time setup

## Data sources

| Source | Used for |
| --- | --- |
| [Artificial Analysis](https://artificialanalysis.ai/) | Intelligence Index, and what it cost to run the index on each model |
| [Arena](https://arena.ai/leaderboard) | Text and WebDev ratings and Agent Arena scores, from the [`lmarena-ai/leaderboard-dataset`](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) dataset (CC BY 4.0) |
| [LiveBench](https://livebench.ai/) | Score across the categories the AA index does not test |
| [models.dev](https://models.dev) | Prices, context window, release date, open weights and modalities |
| [OpenRouter](https://openrouter.ai/rankings) | Usage rank over the last 7 days, shown in an optional column and on model pages and never part of a rating, from its rankings dataset (CC BY 4.0) |

Thanks to all of them. Every page credits them; if you republish the data, credit them
too.

## License

Code is licensed under [MIT](LICENSE). Leaderboard and price data belong to their
sources.

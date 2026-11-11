# Development

Running mekiki locally, the project commands, and the changes that come up most: tuning
the rating and adding a language. To add a model, see [adding a model](adding-models.md).
The rules these guides rely on are in the [design](SPEC.md).

## Run it locally

Requirements: Node.js 22.23.4 or newer and pnpm 12.

```bash
pnpm install
```

```bash
pnpm dev
```

The dev server runs at <http://localhost:4321>. The site builds from the committed
snapshots in `data/snapshots/`, so it works offline and needs no API key.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server. |
| `pnpm build` | Build the site into `dist/`. Reads local files only; never goes online. |
| `pnpm preview` | Serve the built site. |
| `pnpm test` | Run the unit tests. |
| `pnpm check` | Type-check the project (`astro check`). |
| `pnpm lint` | Lint and check formatting with [Biome](https://biomejs.dev), as CI does. |
| `pnpm format` | Format with Biome. Markdown files are left alone. |
| `pnpm smoke` | Browser smoke test of the built site (Playwright). Run `pnpm build` first. |
| `pnpm sync` | Fetch the data sources and update `data/snapshots/`. |
| `pnpm report` | Print every model's scores and the tier distribution. |
| `pnpm history` | Record today's ratings in `data/history.jsonl` from the files as they are. Never goes online. |

`pnpm smoke` needs a Chromium build once:

```bash
pnpm exec playwright install --only-shell chromium
```

## Sync data locally

`pnpm sync` fetches models.dev, Arena and LiveBench without a key. To include Artificial Analysis,
copy `.env.example` to `.env` and set `AA_API_KEY`; without it that source is skipped.
The key is read only by `pnpm sync` and must never be committed.

`pnpm sync --only=arena` syncs one source, and `pnpm sync --dry-run` fetches and reports
without writing. What happens when a source fails is in
[design §4.4](SPEC.md#44-sync).

`pnpm sync` also records today's ratings in `data/history.jsonl`, the file the changelog,
the RSS feeds and the trend charts are built from ([design §4.5](SPEC.md#45-history)).
The daily workflow commits it. A local run writes it too; commit that only if you mean
to, or discard it with `git checkout data/history.jsonl`.

## Change weights and thresholds

Every number of the rating lives in `scoringConfig` in
[`src/lib/scoring.config.ts`](../src/lib/scoring.config.ts): the leaderboard metrics with
their weight and zero point, the blended-price weights (cache read, input, output) and
the cost index bounds, how far value trusts the measured run cost (`runCostWeight`), the
value exponents and the tier thresholds. The formulas are in [design §5](SPEC.md#5-rating).

1. Edit `src/lib/scoring.config.ts`.
2. Run `pnpm report` to see the scores and how the models spread across the tiers.
3. Run `pnpm test`. The fixtures use their own reference config, so tuning the live
   numbers does not break them.

The Method page is generated from the same file and cannot drift from it.

The same file holds `changelogConfig.scoreDelta`: how far a score has to drift, without
changing tier, before the changelog lists it.

To add a leaderboard, add a metric to `scoring.config.ts`, make its source's adapter in
`scripts/sources/` write the metric to the snapshot, and give it a label in each
dictionary in `src/i18n/`.

## Add a language

1. Add the locale to `LOCALES` and `LOCALE_INFO` in `src/i18n/locales.ts`.
2. Add a dictionary next to `src/i18n/en.ts`. `pnpm check` fails until every string is
   there.
3. Register it in `src/i18n/index.ts`.

To change the default language, change `DEFAULT_LOCALE` in `src/i18n/locales.ts`. How
unprefixed URLs pick a language is in [design §7](SPEC.md#7-site).

## Project layout

```text
src/
  content/models/<provider>/<model>.md   one file per model
  lib/scoring.config.ts                  every weight and threshold
  lib/scoring.ts                         rating algorithm (pure functions)
  lib/dataset.ts                         merges models and snapshots for pages, API and report
  lib/api.ts                             JSON API shapes
  lib/logo.ts                            the mark; header, favicon and share images use it
  lib/og.tsx                             share images, rendered to PNG at build time
  lib/compare.ts                         compare page selection (?m=<id>,<id>)
  lib/history.ts, lib/changelog.ts       rating history and the changes derived from it
  lib/feed.ts                            RSS feeds
  i18n/                                  dictionaries and locale helpers
  views/                                 page bodies, shared by all languages
  pages/                                 routes, JSON endpoints, share images, sitemap.xml
  components/                            table and compare islands, share button, tier meter, shadcn/ui
data/snapshots/                          one JSON file per data source
data/history.jsonl                       the ratings, one line per recorded day
scripts/sync.ts, scripts/report.ts       pnpm sync, pnpm report
scripts/history.ts                       pnpm history
scripts/sources/                         one adapter per data source
tests/                                   unit tests
e2e/                                     browser smoke test
docs/                                    design and guides
```

# Development

Running mekiki locally, the project commands, and the changes that come up most: tuning
the rating and adding a language. For the models on the site, see [the model list](model-list.md).

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
| `pnpm lint` | Lint and check formatting with [Biome](https://biomejs.dev), then run `pnpm lint:comments`, as CI does. |
| `pnpm lint:comments` | Fail on any comment in the code. |
| `pnpm format` | Format with Biome. Markdown files are left alone. |
| `pnpm smoke` | Browser smoke test of the built site (Playwright). Run `pnpm build` first. |
| `pnpm sync` | Fetch the data sources, rebuild `data/models.json` and update `data/snapshots/`. |
| `pnpm report` | Print every model's scores and the tier distribution. |
| `pnpm history` | Record today's ratings in `data/history.jsonl` from the files as they are. Never goes online. |

Code carries no comments: `pnpm lint:comments` fails on any comment in `.ts`, `.tsx`, `.js`,
`.mjs`, `.cjs`, `.astro` and `.css` files, except tool directives (`@ts-check`, `@ts-nocheck`,
`@ts-expect-error`, `@ts-ignore`, `/// <reference>`, `biome-ignore` and JSX pragmas such as
`@jsxImportSource`).

`pnpm smoke` needs a Chromium build once:

```bash
pnpm exec playwright install --only-shell chromium
```

## Sync data locally

`pnpm sync` fetches models.dev, Arena and LiveBench without a key. To include Artificial Analysis,
copy `.env.example` to `.env` and set `AA_API_KEY`; without it that source is skipped.
The key is read only by `pnpm sync` and must never be committed.

`pnpm sync --only=arena` syncs one source, and `pnpm sync --dry-run` fetches and reports
without writing.

`pnpm sync` also records today's ratings in `data/history.jsonl`, the file the changelog,
the RSS feeds and the trend charts are built from.
Recording has been on since the site launched on 2026-11-11 (`changelogConfig.recordHistory`
in `src/lib/scoring.config.ts`; with it off, neither `pnpm sync` nor `pnpm history` writes
the file). The daily workflow commits it. A local run writes it too; commit
that only if you mean to, or discard it with `git checkout data/history.jsonl`.

## Change weights and thresholds

Every number of the rating lives in `scoringConfig` in
[`src/lib/scoring.config.ts`](../src/lib/scoring.config.ts): the leaderboard metrics with
their weight and zero point, the blended-price weights (cache read, input, output) and
the cost index bounds, how far value trusts the measured run cost (`runCostWeight`), the
value exponents and the tier thresholds. The formulas are on the [Method page](https://mekiki.fog.moe/method).

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
4. Check that [giscus](https://giscus.app) has the language under the same tag as
   `LOCALE_INFO`: the discussion on model pages is shown in it.

To change the default language, change `DEFAULT_LOCALE` in `src/i18n/locales.ts`.

## Project layout

```text
src/
  lib/model-list.ts                      reads the model list and applies the overrides
  lib/scoring.config.ts                  every weight and threshold
  lib/scoring.ts                         rating algorithm (pure functions)
  lib/dataset.ts                         merges models and snapshots for pages, API and report
  lib/api.ts                             JSON API shapes
  lib/logo.ts                            the mark; header, favicon and share images use it
  lib/og.tsx                             share images, rendered to PNG at build time
  lib/compare.ts                         compare page selection (?m=<id>,<id>)
  lib/history.ts, lib/changelog.ts       rating history and the changes derived from it
  lib/feed.ts                            RSS feeds
  lib/giscus.config.ts, lib/giscus.ts    discussion threads on model pages (giscus)
  i18n/                                  dictionaries and locale helpers
  views/                                 page bodies, shared by all languages
  pages/                                 routes, JSON endpoints, share images, sitemap.xml
  components/                            table and compare islands, share button, tier meter, giscus, shadcn/ui
data/models.json                         the model list, written by pnpm sync
data/model-overrides.yaml                hand-written corrections to the list
data/snapshots/                          one JSON file per data source
data/history.jsonl                       the ratings, one line per recorded day
scripts/sync.ts, scripts/report.ts       pnpm sync, pnpm report
scripts/history.ts                       pnpm history
scripts/check-comments.ts                pnpm lint:comments
scripts/sources/                         one adapter per data source
tests/                                   unit tests
e2e/                                     browser smoke test
docs/                                    guides
```

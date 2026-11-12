# Development

Running mekiki locally, the project commands, the conventions the code follows, and the
changes that come up most: tuning the rating and adding a language. For the models on the
site, see [the model list](model-list.md).

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

`pnpm smoke` needs a Chromium build once:

```bash
pnpm exec playwright install --only-shell chromium
```

## Conventions

- Intelligence scores come from leaderboards only. No score is entered or adjusted by hand.
- The build never goes online. `pnpm sync` writes external data to committed snapshots in
  `data/`, and the build reads local files only.
- Secrets stay out of the front end and the repository. The Artificial Analysis and
  OpenRouter keys live in the `AA_API_KEY` and `OPENROUTER_API_KEY` secrets (locally, in
  `.env`) and are read only by `pnpm sync`.
- OpenRouter usage is shown next to the ratings, never inside them. It is not a rating
  source: discovery, `matched` and `pnpm report` use `RATING_SOURCE_IDS`, which leaves it
  out.
- Every tunable number of the rating lives in `src/lib/scoring.config.ts`. The algorithm in
  `src/lib/scoring.ts` is pure functions with unit tests.
- Pages and the API read the same dataset, built by `src/lib/dataset.ts`.
- Look at a real response from a source before writing its adapter and Zod schema.
- Missing data is shown as missing ("Not rated", "No data", "No price"), never as a blank
  or a 0.
- Pages stay clean. Visible text has to help a reader use the page: figures, units, empty
  states, what is missing, source credits. How something is computed, usage hints and
  caveats belong on the Method page, said once there rather than repeated on every page.
  Where a section needs that explanation, link to its Method section (a small icon by the
  heading works) instead of adding a sentence.
- Secondary information must not cost the main table its layout. Use the lightest form
  that does the job; if an addition makes rows wrap or the table scroll at the page's full
  width, look for a lighter form, or put it behind a toggle.
- Check visual changes in the preview, at full width and on a phone, in English and in
  Chinese.
- In the JSON API, missing values are `null` and no field is omitted. Fields are only
  added; a breaking change bumps `API_VERSION` in `src/lib/api.ts`.
- API responses must carry `Access-Control-Allow-Origin: *`.
- Every page except Compare has a Markdown version for AI agents, at the page's address
  with `.md` in place of the trailing slash (`/en/method.md`, `/en/index.md`), and
  `/llms.txt` links them. What the Method, API and model pages work out lives in
  `src/lib/` (`method.ts`, `api.ts`, `model-detail.ts`), and the view and the Markdown
  renderer in `src/lib/markdown.ts` both read it. A new page gets a renderer, a `.md.ts`
  route and an entry in `markdownPath`.
- Code carries no comments. `pnpm lint:comments` fails on any comment in `.ts`, `.tsx`,
  `.js`, `.mjs`, `.cjs`, `.astro` and `.css` files, except tool directives (`@ts-check`,
  `@ts-nocheck`, `@ts-expect-error`, `@ts-ignore`, `/// <reference>`, `biome-ignore` and
  JSX pragmas such as `@jsxImportSource`).

## Sync data locally

`pnpm sync` fetches models.dev, Arena and LiveBench without a key. To include Artificial Analysis
and OpenRouter, copy `.env.example` to `.env` and set `AA_API_KEY` and `OPENROUTER_API_KEY`;
without a key that source is skipped. The keys are read only by `pnpm sync` and must never
be committed.

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

A zero point of type `board_share` is not a number in the config: `pnpm sync` measures it on
the full leaderboard and stores it in that source's snapshot as `floor`, so after changing
`above` run `pnpm sync --only=<source>` before `pnpm report`.

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
  lib/method.ts, lib/model-detail.ts     what the Method and model pages show
  lib/markdown.ts, lib/llms.ts           the Markdown version of the pages, and llms.txt
  lib/logo.ts                            the mark; header, favicon and share images use it
  lib/og.tsx                             share images, rendered to PNG at build time
  lib/compare.ts                         compare page selection (?m=<id>,<id>)
  lib/filters.ts                         home page filters and the counts around the list
  lib/history.ts, lib/changelog.ts       rating history and the changes derived from it
  lib/feed.ts                            RSS feeds
  lib/jsonld.ts                          structured data (JSON-LD) in the head of every indexed page
  lib/giscus.config.ts, lib/giscus.ts    discussion threads on model pages (giscus)
  i18n/                                  dictionaries and locale helpers
  views/                                 page bodies, shared by all languages
  pages/                                 routes, JSON endpoints, Markdown pages, llms.txt, share images, sitemap.xml
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

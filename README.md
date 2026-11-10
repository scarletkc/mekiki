# mekiki

Opinionated ratings of AI models, published as a static site and a public JSON API at
<https://mekiki.fog.moe>.

Each model gets three ratings:

- **Intelligence**: public leaderboard scores, fetched automatically. A hand-entered
  subjective score can be blended in, but is optional.
- **Cost**: derived from the official price, with an assumed share of cache hits.
- **Value**: derived from intelligence and cost.

mekiki (目利き) is Japanese for a discerning eye. Unlike [models.dev](https://models.dev),
which catalogues facts about every model, this is a short, curated list with an opinion
attached. The full design is in [docs/SPEC.md](docs/SPEC.md) (in Chinese).

The site is available in English (default), Simplified Chinese and Traditional Chinese.

## Run it locally

Requirements: Node.js 22.23.4 or newer and pnpm 12.

```bash
pnpm install
```

```bash
pnpm dev
```

The dev server runs at <http://localhost:4321>.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server. |
| `pnpm build` | Build the site into `dist/`. Reads local files only; never goes online. |
| `pnpm preview` | Serve the built site. |
| `pnpm test` | Run the unit tests. |
| `pnpm check` | Type-check the project (`astro check`). |
| `pnpm lint` | Lint with [Biome](https://biomejs.dev). |
| `pnpm format` | Format with Biome. Markdown files are left alone. |
| `pnpm smoke` | Browser smoke test of the built site (Playwright). Run `pnpm build` first. |
| `pnpm sync` | Fetch the data sources and update `data/snapshots/`. |
| `pnpm report` | Print every model's scores and the tier distribution. |

`pnpm smoke` needs a Chromium build once: `pnpm exec playwright install --only-shell chromium`.

## Add a model

Adding a model means adding one Markdown file. Nothing else needs to change.

1. Find the model on [models.dev](https://models.dev) and note its provider and model ID,
   for example `openai/gpt-6.1-sol`.
2. Create `src/content/models/<provider>/<model>.md`. The path is the model's ID and is
   used as-is, so keep dots and capital letters exactly as models.dev writes them.

   ```markdown
   ---
   name: GPT-6.1 Sol
   vendor: OpenAI
   status: active          # active | legacy (legacy models are collapsed on the home page)
   sources:
     modelsdev: openai/gpt-6.1-sol   # optional; defaults to the file's ID
     aa: gpt-6-1-sol                       # slug on Artificial Analysis
     arena_text: "GPT-6.1 Sol (Max)"       # exact name on the Arena text leaderboard
     arena_webdev: "GPT-6.1 Sol (Max)"     # exact name on the Arena WebDev leaderboard
   subjective:
     score:                # optional, 0-100; leave empty and the leaderboards decide alone
   ---
   ```

   The file is frontmatter only; anything below it is ignored.

3. Run `pnpm sync`. It fetches the model's price and scores, and lists every mapping that
   did not match together with the closest names in that source:

   ```text
   Unmatched in Arena (set the field in the model file):
     openai/gpt-6.1-terra: sources.arena_text is empty; candidates: "GPT-5.6 Terra (xHigh)", "GPT-6.1 Sol (Max)"
   ```

   Copy the right name into the file and run `pnpm sync` again. Until a model has been
   synced, the site shows "no data" for it. In production, the daily workflow (or a manual
   run of it) does the same.

Things to know:

- **Mappings are always explicit.** Names differ between leaderboards, and the same model
  is often listed once per reasoning level. Nothing is matched by guessing; choose the entry
  for the level you actually use. The two Arena boards list different levels, so each has
  its own field.
- **A model needs no subjective score.** Without one, intelligence is the leaderboard score
  alone. With one, the two are blended 60/40. Tools never write to `subjective`.
- A subjective score of 100 means "the best there is right now", the same yardstick as a
  leaderboard score normalised to the current leader.
- A model that is missing from a leaderboard is rated on the ones it is on; the weights are
  re-normalised. A model on none of them is shown as "not rated", never as 0.
- The site has no text reviews: no verdict, pros and cons, or long review.
- To override the models.dev price, add:

  ```yaml
  overrides:
    price: { input: 5, output: 25 }   # USD per 1M tokens; cache_read is optional
  ```

  Without `cache_read` the models.dev cache price is kept, and it counts toward the
  blended price.

- Invalid frontmatter fails `pnpm test` and `pnpm build` with the file name and the field.

## Change weights and thresholds

Every number of the rating algorithm lives in
[`src/lib/scoring.config.ts`](src/lib/scoring.config.ts): the benchmark/subjective split,
which leaderboard metrics are used with their weight and zero point, the blended-price
formula and the assumed cache hit rate, the value exponents and the tier thresholds.

1. Edit `src/lib/scoring.config.ts`.
2. Run `pnpm report` to see the scores and how the models spread across the tiers.
3. Run `pnpm test`. The tests pin the algorithm with a fixed reference config taken from
   the spec, so tuning the live weights does not break them.

To add a leaderboard, add a metric to that file, make its source's adapter in
`scripts/sources/` write it to the snapshot, and give it a name in `src/i18n/`.

The method page is generated from the same file and cannot drift from it. The algorithm
itself is in [`src/lib/scoring.ts`](src/lib/scoring.ts), as pure functions.

## Data sources

| Source | Used for | Access |
| --- | --- | --- |
| [models.dev](https://models.dev) | Price, context window, release date, open weights, modalities | `https://models.dev/api.json`, no key |
| [Artificial Analysis](https://artificialanalysis.ai/) | Intelligence Index, cost of running the index | Free API, key in `AA_API_KEY` |
| [Arena](https://arena.ai/leaderboard) | Text and WebDev leaderboard ratings | Hugging Face dataset `lmarena-ai/leaderboard-dataset` (CC BY 4.0), no key |

Intelligence is built from three metrics: the AA Intelligence Index (weight 0.5), the Arena
text rating (0.3) and the Arena WebDev rating (0.2), which stands in for coding ability.

`pnpm sync` runs one adapter per source (`scripts/sources/`). Each adapter fetches,
validates with Zod, keeps only the tracked models plus the best score on the full
leaderboard, and writes `data/snapshots/<source>.json`. Snapshots are committed; the build
reads them and nothing else.

- If a source is down, returns invalid data or returns far fewer models than last time, its
  old snapshot is kept and the reason is printed (and written to the GitHub Actions job
  summary). `pnpm sync` still exits 0, so a broken source never blocks a deploy.
- If a snapshot file is missing, the site still builds and shows "no data" for that source.
- A snapshot's `fetched_at` only changes when its data changes, so a quiet day produces no
  commit.
- To sync Artificial Analysis locally, copy `.env.example` to `.env` and set `AA_API_KEY`.
  Without a key that source is skipped. The key is only ever read by `pnpm sync`; it must
  never be committed or reach the front end.

Artificial Analysis also publishes a Coding Index, but its free API returns `null` for it on
every model, so it is not used; Arena's WebDev board covers coding instead.

Attribution is required by Artificial Analysis and by the Arena dataset's licence. The
footer of every page carries it; keep it there.

## JSON API

Static files, regenerated on every build:

| Path | Returns |
| --- | --- |
| `/api.json` | Metadata and the full rating of every model |
| `/api/models.json` | `id`, `name`, `vendor`, `status` of every model |
| `/api/models/<provider>/<model>.json` | One model |

Scores have one decimal place, missing values are `null`, and no field is ever omitted.
`tier` is a stable English key; `label` is the English label and `labels` holds
every language. Fields are only added; a breaking change bumps `version`. The page at
[`/api`](https://mekiki.fog.moe/api) documents the fields and shows a live example.

## Languages

UI strings live in `src/i18n/` as one dictionary per language. `en.ts` defines the shape
and the others are type-checked against it, so a missing string fails `pnpm check`.

- Every language has its own prefix: `/en/`, `/zh-cn/` and `/zh-tw/`.
- Unprefixed page URLs (`/`, `/method`, `/api`, `/m/<provider>/<model>`) redirect to the
  same page in the language the visitor last picked in the switcher. Without such a choice,
  they follow the browser's language: Chinese goes to `/zh-tw/` for Traditional script or
  Taiwan, Hong Kong and Macau and to `/zh-cn/` otherwise, and everything else goes to
  `/en/`. The query string and hash are kept. GitHub Pages cannot send HTTP redirects, so
  they redirect in the browser; without JavaScript they go to English. The API's `url`
  field uses the unprefixed form as a language-neutral link.
- The JSON API is not localised; it carries tier labels for every language instead.

To add a language, add it to `LOCALES` and `LOCALE_INFO` in `src/i18n/locales.ts`, then add
a dictionary and register it in `src/i18n/index.ts`. To change the default language, change
`DEFAULT_LOCALE` in the same file.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`, once a day, and on manual
dispatch. Daily and manual runs sync the snapshots first and commit any change; every run
then lints, type-checks, tests, builds and deploys to GitHub Pages. A separate `smoke` job
runs the browser smoke test against the built site. It is optional: it never blocks the
deploy, and a failure only marks that job red.

One-time setup, done by the repository owner:

1. Create an Artificial Analysis account, generate an API key and add it as the repository
   secret `AA_API_KEY`.
2. DNS: add a `CNAME` record for `mekiki.fog.moe` pointing to `scarletkc.github.io`. With
   Cloudflare, use DNS-only mode until GitHub has issued the certificate.
3. Repository Settings → Pages: set the source to GitHub Actions, enter the custom domain
   and enable Enforce HTTPS.
4. Once it is live, check that the API allows cross-origin requests:

   ```bash
   curl -I https://mekiki.fog.moe/api.json
   ```

   The response should include `Access-Control-Allow-Origin: *`.

The sync step pushes to `main` with the workflow's own token. If `main` is protected, allow
GitHub Actions to push to it, or the daily sync cannot save its snapshots.

## Project layout

```text
src/
  content/models/<provider>/<model>.md   one file per model
  lib/scoring.config.ts                  every weight and threshold
  lib/scoring.ts                         rating algorithm (pure functions)
  lib/dataset.ts                         merges models and snapshots for pages, API and report
  lib/api.ts                             JSON API shapes
  i18n/                                  dictionaries and locale helpers
  views/                                 page bodies, shared by all languages
  pages/                                 routes and JSON endpoints
  components/                            table island, tier meter, shadcn/ui components
data/snapshots/                          modelsdev.json, aa.json, arena.json
scripts/sync.ts, scripts/report.ts       pnpm sync, pnpm report
scripts/sources/                         one adapter per data source
tests/                                   unit tests
e2e/                                     browser smoke test
docs/SPEC.md                             requirements and design (Chinese)
```

## License

Code is [MIT](LICENSE). Leaderboard data belongs to its sources: Artificial Analysis, Arena
(CC BY 4.0) and models.dev.

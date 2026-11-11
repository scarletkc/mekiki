# mekiki design

The rules, data model, rating algorithm and API contract behind
<https://mekiki.fog.moe>. When the implementation changes one of them, change this
document in the same commit.

How-to guides live elsewhere: [development](development.md),
[adding a model](adding-models.md) and [deployment](deployment.md). The current
weights and thresholds are not repeated here: they live in `scoringConfig` in
[`src/lib/scoring.config.ts`](../src/lib/scoring.config.ts), and the site's Method page
is generated from that file.

## 1. Scope

mekiki is a static site and a public JSON API that rate a curated list of AI models.
The site, `package.json`, the README and the GitHub repository all describe it in one
sentence: "AI models rated on intelligence, cost and value from public leaderboards and official prices, with a free JSON API." The Chinese dictionaries carry a translation of it.
Each model gets three ratings:

- **Intelligence**: public leaderboard scores, normalised to the current leader and
  weighted.
- **Cost**: from the official price.
- **Value**: from intelligence and what the model costs to actually run, which counts
  how many tokens it burns and not only its price per token.

[models.dev](https://models.dev) catalogues facts about every model; mekiki keeps a short
list of the models worth comparing and rates them. mekiki (目利き) is Japanese for a
discerning eye. The site name is written `mekiki` only.

Non-goals:

- **No full model database.** The list is curated, a few dozen models at most.
- **No accounts, comments or votes**, and so no backend or database.
- **No evaluations of our own.** Every score comes from a public leaderboard.
- **No text reviews and no subjective score.** The site shows ratings and scores only:
  no verdicts, pros and cons, or hand-entered intelligence score (§9).

## 2. Rules

1. **Intelligence comes from leaderboards only.** No hand-entered score and no on-site
   voting (§9).
2. **The build never goes online.** `pnpm sync` writes external data to snapshot files
   that are committed; the build reads local files only. No data source can break the
   build.
3. **Secrets stay out of the front end and the repository.** The Artificial Analysis key
   lives in the GitHub Actions secret `AA_API_KEY` and is read only by `pnpm sync`.
4. **Every tunable number lives in one config file** (`src/lib/scoring.config.ts`), and
   the algorithm is pure functions with unit tests (`src/lib/scoring.ts`).
5. **Pages and the API read the same dataset.** `src/lib/dataset.ts` merges model files
   and snapshots once per build, so a model shows the same numbers everywhere.
6. **Look at a real response before writing an adapter.** Upstream field names drift;
   fetch once, then write the Zod schema.
7. **Missing data is shown as missing.** "Not rated", "no data" or "no price", never a
   blank or a 0.

## 3. Architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Astro, static output | Pages ship no JavaScript except the table and compare islands and the share button |
| UI | React, shadcn/ui, Tailwind CSS | shadcn/ui is React, so the islands are React |
| Table | TanStack Table | Sorting, filtering, search |
| Share images | satori and resvg | Rendered to PNG at build time, offline |
| Content | Astro content collections with Zod | One Markdown file per model |
| Language | TypeScript, strict | TypeScript 6: `@astrojs/check` does not support 7 yet |
| Tests | Vitest; Playwright for the smoke test | |
| Lint and format | Biome | Markdown is not formatted |
| Hosting | GitHub Actions and GitHub Pages | Custom domain `mekiki.fog.moe` |

Data flows one way:

```text
src/content/models/**.md ─┐
                          ├─> src/lib/dataset.ts ─> pages, JSON API, pnpm report
data/snapshots/*.json ────┘
      ▲
      └── pnpm sync (scripts/sources/, one adapter per source)
```

- After the snapshots, `pnpm sync` records the day's ratings in `data/history.jsonl`
  (§4.5), once recording is on. The changelog, the RSS feeds and the trend charts are
  built from that file.
- The model schema (`src/lib/model-schema.ts`) and snapshot schemas
  (`src/lib/snapshots.ts`) use Astro's own Zod (`astro/zod`), so the content collection
  and the Node scripts share one schema and one Zod version.
- Only one Latin font is bundled (Instrument Sans via `@fontsource-variable`); Chinese
  text uses system fonts. The build makes no remote requests.
- The share images use the static `@fontsource/instrument-sans` package at build time,
  because satori reads neither WOFF2 nor variable fonts.

## 4. Data

| Kind | Source | Location | Maintained by |
| --- | --- | --- | --- |
| Model list and mappings | Hand-written | `src/content/models/**.md` | The maintainer |
| External snapshots | `pnpm sync` | `data/snapshots/*.json` | The daily workflow |
| Rating history | `pnpm sync`, once a day | `data/history.jsonl` | The daily workflow |
| Rating parameters | Config | `src/lib/scoring.config.ts` | The maintainer |

### 4.1 Model files

The path is the ID: `src/content/models/<provider>/<model>.md` has the canonical ID
`<provider>/<model>`, following models.dev's naming. The file is frontmatter only; any
body is ignored.

```markdown
---
name: GPT-6.1 Sol            # display name
vendor: OpenAI
status: active               # active | legacy (legacy is collapsed on the home page)
sources:                     # the model's ID in each source; omit what doesn't exist
  modelsdev: openai/gpt-6.1-sol   # defaults to the canonical ID
  aa: gpt-6-1-sol                  # Artificial Analysis slug
  arena_text: "GPT-6.1 Sol (Max)"  # exact name on the Arena text board
  arena_webdev: "GPT-6.1 Sol (Max)" # exact name on the Arena WebDev board
  livebench: gpt-6.1-sol           # model ID on LiveBench
overrides:                   # optional
  price: { input: 5, output: 25 }  # USD per 1M tokens; cache_read optional
---
```

- **Mappings are always explicit.** A model's name differs between leaderboards, and
  nothing is matched by guessing. `pnpm sync` lists the mappings that did not match,
  with the closest names in that source; candidates are printed, never written.
- Artificial Analysis and Arena often list one model once per reasoning level. A mapping
  points at the level the maintainer actually uses. The two Arena boards list different
  levels, so each has its own field.
- A price override replaces the models.dev input and output prices. Without
  `cache_read`, the models.dev cache price is kept.
- Invalid frontmatter fails `pnpm test` and `pnpm build` with the file and the field.

### 4.2 Sources

| Source | Provides | Access | Terms |
| --- | --- | --- | --- |
| [models.dev](https://models.dev) | Price (input, output, cache read), context window, release date, open weights, modalities | `GET https://models.dev/api.json`, no key | MIT. Data is grouped by provider and prices follow the provider, so `sources.modelsdev` carries the provider prefix |
| [Artificial Analysis](https://artificialanalysis.ai/) | Intelligence Index; what it cost to run the index | Free API, key in the `x-api-key` header | Attribution required on every tier; the key never reaches the front end |
| [Arena](https://arena.ai/leaderboard) | Text and WebDev board ratings | Hugging Face dataset `lmarena-ai/leaderboard-dataset`, configs `text` and `webdev`, split `latest`, no key | CC BY 4.0, attributed per the licence |
| [LiveBench](https://livebench.ai/) | Score across the categories the AA Intelligence Index does not test | `data/<release>/table.csv` and `categories.json` on the site, no key | No licence stated for the scores (the code is Apache-2.0); attributed (§9) |

- Artificial Analysis is read from `GET /api/v2/language/models/free?page=N`, the only
  model list the free tier can reach (100 requests per 24 hours).
- **Coding ability comes from Arena WebDev and the AA Intelligence Index**, whose suite
  includes FrontierCode and Terminal-Bench. Artificial Analysis also publishes a Coding
  Index, but its free API returns `null` for it on every model.
- **Arena is read as Parquet.** The Datasets Server's `/filter` endpoint intermittently
  returns 500 or times out, and `/rows` needs more than 100 pages for the `latest`
  split. Each board's auto-converted Parquet file is one request (about 0.6 MB for
  text), parsed with `hyparquet`; only rows with `category = overall` are used.
- **LiveBench has no overall column.** The site computes one as the weighted mean of the
  categories a model has a score for, with the weights in `categories.json`. The adapter
  takes the same mean over only the categories the AA Intelligence Index does not already
  test (`livebenchCategories` in the config, §5.1), and stops when the site's categories
  or weights no longer match that list. Release IDs are only listed in the site's script,
  so a fetch reads the page, the script, then the two files of the newest release.
- Every page's footer attributes Artificial Analysis, Arena, LiveBench and models.dev.
  Keep it.

Each source has one adapter in `scripts/sources/` with the same contract
(`scripts/sources/types.ts`): fetch, validate with Zod, trim, return a snapshot. Adding a
leaderboard means one adapter and one metric in the config.

### 4.3 Snapshots

One file per source, for example `data/snapshots/aa.json`:

```json
{
  "source": "aa",
  "fetched_at": "2026-11-11T00:00:00Z",
  "total": 734,
  "frontier": { "aa_intelligence": 70 },
  "models": {
    "<the model's ID in this source>": { "aa_intelligence": 68, "index_cost_usd": 123.4 }
  }
}
```

- `models` keeps only the tracked models. `frontier` holds the best score of each metric
  across the source's whole leaderboard, not just the tracked models. Diffs stay small,
  and nobody else's full dataset is copied into the repository.
- `arena.json` holds both boards, keyed by model name; each entry has `arena_text` and
  `arena_webdev`, `null` when the model is not on that board.
- `livebench.json` is keyed by model ID.
- `edition` names the release of a leaderboard that has releases: LiveBench's release
  date.
- `total` is how many models the source listed, used to spot a broken sync.
- `fetched_at` changes only when `edition`, `frontier` or `models` change, so a quiet day produces
  no commit. A change in `total` alone doesn't count: models.dev gains models almost
  daily.

### 4.4 Sync

`pnpm sync` runs every adapter (`--only=<source>` for one, `--dry-run` to write
nothing).

- A source that fails, returns invalid data, returns fewer models than its adapter's
  `minTotal`, or fewer than half of last time keeps its old snapshot. The reason is
  printed and written to the GitHub Actions job summary.
- `pnpm sync` exits 0 even then, so a broken source never blocks a deploy.
- A missing snapshot file still builds; the site shows "no data" for that source.
- Without `AA_API_KEY`, Artificial Analysis is skipped.
- After the sources, today's ratings are recorded in the history (§4.5), once recording
  is on. A failure there doesn't fail the sync either.

### 4.5 History

`data/history.jsonl` keeps the ratings the site showed, one JSON line per UTC day, oldest
first. **Recording is off until the site is published** (`changelogConfig.recordHistory`
in the config): the scoring is still being tuned, and a changelog of that tuning would
mean nothing. The file is empty until then, so the changelog, the feeds and the trend
charts are empty too. Turn recording on at launch; the first recorded day is the
baseline (§7).



```json
{"date":"2026-11-10","models":{"<provider>/<model>":{"name":"...","status":"active","intelligence":{"score":93.2,"tier":"top"},"cost":{"tier":"high","blended":2.94,"input":4,"output":20,"cache_read":0.2},"value":{"score":59.6,"tier":"mid"}}}}
```

- It records what the site showed at the time, not a recomputation: every listed model's
  name, status, scores, tiers and prices, taken from the dataset (`src/lib/history.ts`).
  A change to the config or a model file shows up as changes in the next recording.
- `pnpm sync` records today after writing the snapshots; `pnpm history` records from the
  files as they are, without going online. A push to `main` does not sync, so it records
  nothing: a config change reaches the history with the next daily sync, up to a day
  later.
- Whether a day changed is decided by comparing it with the previous line, not by
  whether a snapshot changed: a config or model file change moves the scores while the
  snapshots stay the same.
- A day identical to the previous one is not written, so a missing day means "same as
  before" and a quiet day makes no commit. Re-running on the same day replaces that
  day's line, and removes it if it now matches the day before.
- Nothing is recorded when the file already has a later day (a clock went backwards) or
  has a broken line, so rewriting the file never drops lines silently.
- The build reads this file only. A missing file is an empty history; a broken line is
  skipped with a warning, and the build goes on.
- Tiers are stored as plain strings, so renaming a tier later does not invalidate older
  lines.
- The history starts on 2026-11-10. Earlier snapshots were not backfilled: they cover
  about ten hours of one day, during which the algorithm changed several times.

## 5. Rating

Parameter names below are fields of `scoringConfig`. §5.5 lists the reference values the
fixtures use.

### 5.1 Intelligence

Each leaderboard metric `s` is normalised to 0–100:

```text
n_s = clamp(100 × (x − floor_s) / (frontier_s − floor_s), 0, 100)
```

- `frontier_s` is the current leader's score on that metric.
- `floor_s` is a fixed raw score (`absolute`) only for the AA Intelligence Index, which
  starts at 0. The other metrics use `frontier_s − gap_s` (`below_frontier`), with a gap
  that leaves about 70% of the board above zero (measured on 2026-11-11). Elo ratings
  have no meaningful zero, and the WebDev board is spread wider than the text board, so
  it gets a wider gap. LiveBench's kept categories put most models between 60 and 87, so
  counting from 0 would hardly tell them apart; its gap is 17.

The score is the weighted mean of the metrics the model has:

```text
intelligence = Σ(w_s × n_s) / Σ(w_s)    over the metrics the model has
```

- **Each leaderboard counts once** (§9). One the AA Intelligence Index already contains,
  such as Terminal-Bench or FrontierCode, is not used. The AA Intelligence Index, Arena
  text and Arena WebDev weigh 1 each.
- **LiveBench counts only where it does not overlap with the index.** Its Coding (bug
  fixes in a real repository) and Long Agentic (long-running coding work) categories test
  the same kind of task as the index's FrontierCode and Terminal-Bench, so they are left
  out. The LiveBench score is the weighted mean of the other five (Reasoning, Data
  Analysis, Research, Browser, Design), and LiveBench weighs the share of its own
  category weights they carry: 5.5 of 9, about 0.61. With every metric present the shares
  are 27.7% for each of the other three and 16.9% for LiveBench.
- A missing metric is left out and the remaining weights are re-normalised.
- A model on none of the leaderboards is not rated (`null`) and sorts last.
- Every sync re-normalises to the current leader, so when a new model takes the lead,
  every other score drops without anyone editing a file.
- The algorithm iterates over the metrics the config lists and never names one.
  Adding or removing a leaderboard changes only `scoring.config.ts`, the adapter and the
  metric's label in `src/i18n/`.

### 5.2 Cost

Prices are the official models.dev prices of `sources.modelsdev`, or the override, in
USD per 1M tokens.

```text
cached     = min(cache_read, input)                           input when there is no cache_read
blended    = (wc × cached + wi × input + wo × output) / (wc + wi + wo)
                                                              wc, wi, wo = cost.cacheReadWeight,
                                                              cost.inputWeight, cost.outputWeight
cost_index = clamp(100 × log10(blended / p0) / log10(p1 / p0), 0, 100)
                                                              p0, p1 = cost.indexFloorPrice, cost.indexCeilPrice
```

- **Token mix.** The weights follow Artificial Analysis's default blend of 7 : 2 : 1
  (cache read : input : output, per its
  [methodology](https://artificialanalysis.ai/methodology), checked 2026-11-11). That
  counts about 78% of input tokens as cache hits and weighs input against output 9 : 1.
  Real use is mostly agents and long chats that resend their context: on OpenRouter,
  agent traffic ran close to 90% cached in September 2026, and output is about 12% of
  the tokens in human chats. The earlier 3 : 1 input-to-output blend without cache
  overstated input cost and the weight of output.
  - A model without `cache_read` pays the input price for the cached share too; no
    discount is guessed.
  - A `cache_read` above `input` counts as `input`. This happens when an override
    changes the input price but the cache price still comes from models.dev.
  - Cache-write surcharges are not counted.
- **The index bounds and cost tiers moved with the blend.** On a typical price list
  (output 5× input, cache reads 10% of input) the 7 : 2 : 1 blend is about 0.385× a
  3 : 1 input-to-output blend, so the earlier bounds and tiers were scaled by that factor
  and rounded. They mean what they meant before.
- Cost tiers are set by the absolute `blended` price (§5.4). `cost_index` is used only
  to compute value.
- A price of 0 has `cost_index` 0 and is shown as "free".
- No price: cost and value are `null`, shown as "no price".

### 5.3 Value

```text
token_use_i     = run_cost_i / blended_i        for every listed model with both
typical         = median(token_use)             over every listed model, legacy included
measured        = run_cost / typical            USD per 1M tokens
effective_price = blended^(1 − w) × measured^w  w = value.runCostWeight
                = blended                       when there is no run cost
value = intelligence^a × max(100 − cost_index(effective_price), m)^b
                                                a, b, m = value.intelligenceExponent,
                                                value.affordabilityExponent, value.minAffordability
```

- **Run cost over list price.** The same list price can cost several times more on a
  model that burns more tokens. Artificial Analysis publishes what it paid to run its
  whole Intelligence Index on each model (`run_cost`). Every model runs the same suite,
  so those costs compare directly.
- **Why divide by `typical`.** It puts run cost back on the per-token price scale: a
  model with typical token use lands on its own blended price, a frugal one below and a
  wasteful one above. Models with and without a run cost can then be compared.
- **Why the listed models.** A yardstick taken from the top 50 of the whole Artificial
  Analysis board came out too low, because that board lists many low-reasoning entries:
  9 of the first 10 listed models came out above their list price, at a median of about
  four times it, their cost indexes bunched together, and models without a run cost
  gained an unfair edge. The cost is
  that adding or removing a model shifts the others' value slightly. Changing a model's
  `status` does not.
- **Artificial Analysis bills two models at a higher price tier.** For its run cost it
  prices Gemini 4 Argon at $4 / $20 and DeepSeek V4 Pro at its peak $1.32 / $3.96,
  twice what models.dev lists ($2 / $10, and the off-peak $0.66 / $1.98). Both are
  official prices (checked against Artificial Analysis's model pages and both vendors'
  price pages on 2026-11-11). Those two run costs are therefore high and their value
  conservative, and they enter the typical-use median at the higher figure. With few
  listed models, the median is sensitive to outliers like these.
- Artificial Analysis also publishes `cost_per_task`, but it is not total cost ÷ task
  count (the ratio ranges from 631 to 1782 across the board), so it is not used.
- The cost tier still uses the blended price only.
- `cost_index(p)` is the §5.2 scale applied to `p`.

The geometric mean means neither side can be terrible: smart but very expensive and
cheap but dim both score low.

### 5.4 Tiers

| Rating | Tier keys, best first | Decided by |
| --- | --- | --- |
| Intelligence | `top`, `high`, `mid`, `low` | Score at or above `intelligence.tiers` |
| Cost | `low`, `mid`, `high`, `very_high` | Blended price below `cost.tiers` |
| Value | `top`, `high`, `mid`, `low` | Score at or above `value.tiers` |

- Tiers are decided on the score rounded to one decimal, so a model shown as 90.0 is
  always in the tier that starts at 90.
- The API uses the English keys and an English `label`; pages show the label in the
  current language.
- Thresholds are tuned against real data: `pnpm report` prints every model's scores and
  how they spread across the tiers.

### 5.5 Reference fixtures

`tests/scoring.test.ts` pins the algorithm with the table below, computed from the
formulas above, tolerance ±0.1. The data is fictional; the leaders are AA Intelligence
70, AA Coding 62 and Arena text 1500.

The fixtures fix the algorithm, not the live config, so they use their own reference
config (`specConfig` in the test file): two index-style metrics weighted 0.5 and 0.2, one
Elo-style metric weighted 0.3 with a gap of 300, a 7 : 2 : 1 cache-read : input :
output blend, a cost scale from $0.04 to $12, value exponents 0.6 and 0.4 with a minimum
affordability of 5, and tier thresholds of 90 / 75 / 55 (intelligence),
$0.4 / $2 / $6 (cost) and 70 / 60 / 50 (value). Tuning `scoring.config.ts` does not
break them.

F has no cache price, so its cached share is billed at the input price, which pins that
fallback.

| Case | AA intelligence / coding / Arena | Price in / out / cache | Intelligence | Blended | Cost index | Value |
| --- | --- | --- | --- | --- | --- | --- |
| A flagship | 68 / 60 / 1490 | 5 / 25 / 0.5 | 96.9 top | 3.85 high | 80.1 | 51.5 mid |
| B balanced | 60 / 52 / 1450 | 1.25 / 10 / 0.125 | 84.6 high | 1.3375 mid | 61.5 | 61.7 high |
| C cheap and good | 50 / 40 / 1400 | 0.3 / 2.5 / 0.03 | 68.6 mid | 0.331 low | 37.0 | 66.3 high |
| D very cheap | 30 / 22 / 1300 | 0.05 / 0.2 / 0.005 | 38.5 low | 0.0335 low | 0 | 56.4 mid |
| E on no leaderboard | none | 3 / 15 / 0.3 | null | 2.31 high | 71.1 | null |
| F no coding score, no cache price | 56 / none / 1430 | 2 / 8 / none | 78.8 high | 2.60 high | 73.2 | 51.2 mid |

## 6. JSON API

Static files generated at build time (Astro static endpoints):

| Path | Returns |
| --- | --- |
| `/api.json` | Metadata and the full rating of every model |
| `/api/models.json` | `id`, `name`, `vendor`, `status` of every model |
| `/api/models/<provider>/<model>.json` | One model |
| `/api/history.json` | Every recorded day (§4.5) |

`/api.json`, abridged to one model and one metric:

```json
{
  "version": 1,
  "generated_at": "2026-11-11T00:00:00Z",
  "sources": {
    "aa": { "name": "Artificial Analysis", "url": "https://artificialanalysis.ai/", "fetched_at": "..." }
  },
  "models": [
    {
      "id": "<provider>/<model>",
      "name": "...",
      "vendor": "...",
      "status": "active",
      "intelligence": {
        "score": 95.1, "tier": "top", "label": "Top",
        "labels": { "en": "Top", "zh-CN": "最高", "zh-TW": "最高" },
        "breakdown": {
          "aa_intelligence": { "raw": 59.1, "normalized": 91.5, "weight": 0.2769 }
        }
      },
      "cost": {
        "tier": "high", "label": "High", "labels": { "...": "..." },
        "index": 75.3, "blended": 2.94, "input": 4, "output": 20, "cache_read": 0.2
      },
      "value": {
        "score": 60.3, "tier": "high", "label": "High", "labels": { "...": "..." },
        "cost_basis": "run_cost", "run_cost": 8909.67, "effective_price": 2.113009, "cost_index": 69.6
      },
      "url": "https://mekiki.fog.moe/m/<provider>/<model>"
    }
  ]
}
```

- Scores have one decimal place. Missing values are `null`; no field is ever omitted.
- `breakdown` lists every configured metric. `weight` is the metric's share of the score
  for a model that is on every leaderboard; the shares add up to 1.
- `label` is English and `labels` holds the label in every UI language, keyed by BCP 47
  tag. The API itself is not localised.
- `cost.index` is the cost index of the blended price. `value.effective_price` is the
  price value is computed from, `value.cost_index` its index, and `value.cost_basis`
  says whether it comes from a measured run cost (`run_cost`) or the price list
  (`list_price`).
- `url` is the unprefixed, language-neutral link (§7).
- `/api/history.json` is `{ version, generated_at, entries }`, where `entries` are the
  lines of `data/history.jsonl` as they are, oldest first.
- **Fields are only added.** A breaking change bumps `version` (`API_VERSION` in
  `src/lib/api.ts`).
- Responses must carry `Access-Control-Allow-Origin: *` so browsers can call the API
  from any site. If the host does not send it, add the header at the domain or move the
  API to a Worker. [Deployment](deployment.md) has the check.

## 7. Site

| Route | Content |
| --- | --- |
| `/<locale>/` | The model table |
| `/<locale>/m/<provider>/<model>` | One model |
| `/<locale>/compare` | Up to four models side by side |
| `/<locale>/changelog` | Rating changes, grouped by day |
| `/<locale>/feed.xml` | The changelog as RSS; `/feed.xml` is the default language's |
| `/<locale>/method` | Rating method, data sources and attribution, when each source last changed |
| `/<locale>/api` | API fields and a live example |

### Languages

- English (default), Simplified Chinese and Traditional Chinese (Taiwan usage). Each has
  a prefix: `/en/`, `/zh-cn/`, `/zh-tw/`. Locales are defined in `src/i18n/locales.ts`;
  Astro's own i18n routing is not used.
- UI strings live in `src/i18n/`, one dictionary per language. `en.ts` defines the shape
  and the others are type-checked against it, so a missing string fails `pnpm check`.
- Unprefixed URLs (`/`, `/changelog`, `/compare`, `/method`, `/api`,
  `/m/<provider>/<model>`) only redirect to the same page in one language, keeping the
  query string and hash. The target is, in order:
  the language last picked in the switcher (`localStorage` key `locale`), the first
  browser language that matches, then English. Chinese goes to `/zh-tw/` for
  Traditional script or Taiwan, Hong Kong and Macau, and to `/zh-cn/` otherwise. GitHub
  Pages cannot send HTTP redirects, so the redirect runs in the browser
  (`src/layouts/Redirect.astro`); without JavaScript a meta refresh goes to English.
- Every page carries `hreflang` links, and switching language keeps the table's
  filters and sort.
- There is one `404` page, a GitHub Pages limit, with the message in every language.
- No copy names the maintainer. Where a sentence needs a subject, it is "mekiki".

### Home table

Columns: model, vendor, intelligence, cost, value, input and output price. Each rating
column shows a tier badge and the score.

- Sort by any column; the default is intelligence, descending.
- Filter by vendor, by each rating's tier and by open weights; search by name.
- Sorting and filters live in the URL so a view can be shared. The parameters are the
  same in every language: `q`, `vendor`, `int`, `cost`, `val`, `open`, `sort`, `dir`,
  `legacy`.
- Legacy models are collapsed by default.
- Each row has a checkbox. Ticking up to four models shows a bar with a Compare button.

### Model page

The three ratings; how the intelligence score is built (raw score, leader, normalised
score and weight per leaderboard); the history of intelligence and value with the
model's changes; price, context window, release date, open weights and modalities; how
value was priced; links to the source data and the model's JSON. The
header has a Compare button, which opens the compare page with this model, and a Share
button.

The history charts are step charts (a score holds until the next recorded change) drawn
as inline SVG at build time, with no script. The vertical axis zooms to the data and the
tier boundaries inside it are drawn as hairlines. The last point is the score the page
shows, so the chart always agrees with the number above it. A model with fewer than two
days of data gets a note saying when its history starts instead of a chart. A
collapsible table under the charts lists the same numbers.

### Compare page

The selected models side by side, one column each. Rows are the three ratings, the raw
score on each leaderboard, the prices and the facts; the best figure in each row is in
bold. The selection lives in `?m=<id>,<id>` (known IDs only, at most four), so the page
can be shared. Without `m`, it shows the three most intelligent current models.

### Sharing

- The Share button shares the unprefixed URL (`/m/<provider>/<model>`, `/compare?m=…`),
  so whoever opens it lands in their own language. Touch devices get the system share
  sheet; elsewhere the link is copied.
- Every model has a 1200 × 630 share image at `/og/<provider>/<model>.png`; every other
  page uses `/og.png`. The images are in English for every language.
- The redirect pages carry the same share tags as the real pages, because link
  previews do not run scripts.
- `/sitemap.xml` lists every locale-prefixed page with its `hreflang` alternates, and
  `robots.txt` points to it. Redirect pages and the 404 are left out.

### Changelog and feeds

The changelog (`src/lib/changelog.ts`) compares each recorded day with the one before
and lists only the changes that matter:

- a tier change, with the scores (or blended price) before and after;
- a price change, with the cost tier when it changed with it; a cost tier that changed
  without a price change (the thresholds or the blend weights changed) is a tier change;
- a new leader in intelligence or value;
- a model added, removed, moved to legacy or back;
- a score that moved without changing tier, once it has drifted at least
  `changelogConfig.scoreDelta` points from the last score listed for it, so slow drift
  adds up instead of being lost.

The first recorded day is the baseline and lists nothing. Models that were removed are
not linked, since their page is gone.

Each language has an RSS 2.0 feed with one item per day, for the last 50 days. Every
date in it (`pubDate`, `guid`, `lastBuildDate`) comes from the history, never from the
build, so a rebuild does not look like news. Pages advertise their language's feed in
`<head>`.

### Everywhere

- A dense data table in the spirit of models.dev. No marketing hero or giant gradient
  headline.
- Dark and light, following the system by default, with a manual switch.
- Usable at 380 px wide: the table scrolls sideways with the first column pinned.
- The footer carries the source attribution (Artificial Analysis, Arena, LiveBench,
  models.dev),
  the last sync time and a link to the repository.
- The mark is a vermilion seal with an eye on it, whose square pupil is cut out so the
  seal shows through. It is defined once in `src/lib/logo.ts`; the header, the favicon,
  the touch icon and the share images draw it from there.

## 8. Sync and deployment

One workflow, `.github/workflows/deploy.yml`, runs on every push to `main`, once a day,
and on manual dispatch:

1. Check out and install.
2. Daily and manual runs only: `pnpm sync` with `AA_API_KEY`, then commit and push any
   change to the snapshots or the history.
3. `biome ci`, `pnpm check`, `pnpm test`.
4. `pnpm build`, upload, deploy to GitHub Pages.
5. A separate `smoke` job runs `pnpm smoke` on the same build artifact. It is optional:
   it runs beside the deploy, never blocks it, and a failure only marks that job red.

**Sync and deploy must share a run.** A commit pushed with the default `GITHUB_TOKEN`
does not trigger other workflows, so a separate sync workflow would leave fresh data
undeployed. For the same reason the workflow spells out install, test, build and upload
as steps instead of using `withastro/action`: sync and tests have to run before the build
in the same job. The workflow needs `contents: write`, `pages: write` and
`id-token: write`.

The custom domain is set by `public/CNAME` (`mekiki.fog.moe`) and `site` in
`astro.config.mjs`, with no `base`. One-time setup is in [deployment](deployment.md).

## 9. Decisions

**No text reviews.** Short verdicts, pros and cons, best-for lists, long reviews and
review dates were removed. Model files have no such fields, pages don't show them, and
the API has no `verdict`, `best_for` or `reviewed_at`.

**No subjective score.** Intelligence used to blend a hand-entered score with the
leaderboards. It was removed because:

- one person's judgement made up 40% of the intelligence score;
- leaderboard scores drop automatically when a new leader arrives, but a hand-entered
  score stays on the old scale, so old flagships drifted upwards unless every model was
  re-scored at every generation;
- the alternatives fell short: normalising hand scores to the highest one still needs
  fine-grained numbers, coarse tiers can't follow new generations, and on-site voting
  draws few votes, is easy to game and goes stale too. Arena's text and WebDev boards
  are large-scale votes already and make up half the intelligence weight.

A `subjective` block left in a model file is ignored. The API dropped
`intelligence.basis`, `intelligence.subjective` and `intelligence.benchmark` (which had
become identical to `score`). Like the text-review fields before them, they were removed
without bumping `version`.

**Each leaderboard counts once.** Intelligence started with three leaderboards weighted
0.5, 0.3 and 0.2. LiveBench and Terminal-Bench were then added, grouped by subject
(general ability, human preference, coding). On 2026-11-11 the groups were replaced by
de-duplication, because the AA Intelligence Index is itself a blend of test suites and
some leaderboards were counted twice. The rule: a leaderboard the index already contains
is dropped (Terminal-Bench is 10% of index v5.0.1, FrontierCode 15%), and one that
overlaps with it in part counts only for the part that does not (LiveBench, §5.1). The
rest count the same. Intelligence stays one blended score; showing tests and human votes
as separate sub-scores was rejected.

**LiveBench states no licence for its scores.** Its code is Apache-2.0, but the site does
not say how the scores may be reused (checked 2026-11-11). They are republished with
attribution. Check its terms again before the site goes public. Other leaderboards were
looked at and left out: CursorBench, because Cursor's terms of service forbid scraping
the site; DeepSWE, which listed 3 of the 10 tracked models and was last generated on
2026-09-22; FrontierCode, which is part of the AA Intelligence Index and whose site terms
forbid republishing for commercial purposes; and Agents' Last Exam, which is not part of
the index but whose v1.1 board (2026-11-05) listed 3 of the 10 tracked models.

**Share images in English only.** Model names are Latin script, and a CJK font would
add megabytes to every build for a few short labels.

**A hand-written sitemap.** `@astrojs/sitemap` writes `sitemap-index.xml` and would list
the redirect pages, which are not indexed.


**The history keeps what the site showed.** Recomputing old days with today's algorithm
would keep the trend lines smooth across config changes, but the changelog and the feeds
would rewrite themselves after every tuning, and a feed item that changes after it was
read is worse than a visible step. Recording the shown ratings also needs no copy of old
snapshots.

**The changelog leaves out small moves.** Leaderboards shift scores by a tenth of a point
almost every day; listing each move would bury tier and price changes. Scores are still
listed once they drift far enough (§7).

Not built yet: more UI languages.

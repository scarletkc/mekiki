/**
 * Merges the model files with the source snapshots into the one dataset
 * that pages, the JSON API and `pnpm report` all read, so every consumer
 * shows the same numbers (docs/SPEC.md §10).
 *
 * Pure: takes its inputs as arguments and must not import `astro:*`.
 */
import type { ModelEntry } from './model-schema';
import { METRIC_KEYS, scoringConfig, type MetricKey, type ScoringConfig } from './scoring.config';
import { rateModel, type Price, type Rating } from './scoring';
import { SOURCE_IDS, SOURCE_INFO, type Snapshots, type SourceId } from './snapshots';

export const SITE_URL = 'https://mekiki.fog.moe';

export interface SourceStatus {
  name: string;
  url: string;
  license: string | null;
  /** Null when the snapshot file is missing or invalid. */
  fetched_at: string | null;
}

export interface ModelRecord {
  /** Canonical ID, `<provider>/<model>`. */
  id: string;
  name: string;
  vendor: string;
  status: 'active' | 'legacy';
  rating: Rating;
  /** Where the price comes from; null when there is no price. */
  price_source: 'override' | 'modelsdev' | null;
  verdict: string | null;
  pros: string[];
  cons: string[];
  best_for: string[];
  reviewed_at: string | null;
  /** True when the review is older than `staleAfterDays`. */
  stale: boolean;
  has_review: boolean;
  facts: {
    /** Context window in tokens. */
    context: number | null;
    release_date: string | null;
    open_weights: boolean | null;
    modalities: { input: string[]; output: string[] } | null;
    /** USD spent running the full AA Intelligence Index (reference only). */
    index_cost_usd: number | null;
  };
  /** The model's ID in each source, as mapped in its frontmatter. */
  source_ids: { modelsdev: string; aa: string | null; arena_text: string | null };
  /** Whether that ID was found in the source's snapshot. */
  matched: Record<SourceId, boolean>;
  /** Pages on the source sites that show the raw numbers. */
  links: Record<SourceId, string | null>;
  /** Canonical page URL (default locale). */
  url: string;
}

export interface Dataset {
  generated_at: string;
  sources: Record<SourceId, SourceStatus>;
  /** Best raw score of each benchmark metric, null when unknown. */
  frontier: Record<MetricKey, number | null>;
  models: ModelRecord[];
}

export interface BuildOptions {
  now?: Date;
  config?: ScoringConfig;
}

function daysBetween(fromIsoDate: string, to: Date): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  if (Number.isNaN(from)) return 0;
  return (to.getTime() - from) / 86_400_000;
}

function metricValue(snapshots: Snapshots, entry: ModelEntry, key: MetricKey): number | null {
  const { aa, arena_text } = entry.data.sources;
  if (key === 'arena_text') {
    return arena_text ? (snapshots.arena?.models[arena_text]?.arena_text ?? null) : null;
  }
  return aa ? (snapshots.aa?.models[aa]?.[key] ?? null) : null;
}

export function frontierOf(
  snapshots: Snapshots,
  config: ScoringConfig = scoringConfig,
): Record<MetricKey, number | null> {
  const frontier = {} as Record<MetricKey, number | null>;
  for (const key of METRIC_KEYS) {
    const snapshot = snapshots[config.intelligence.metrics[key].source];
    frontier[key] = snapshot?.frontier[key] ?? null;
  }
  return frontier;
}

/** Sort for display: best intelligence first, unrated models last, then by name. */
export function compareByIntelligence(a: ModelRecord, b: ModelRecord): number {
  const left = a.rating.intelligence.score;
  const right = b.rating.intelligence.score;
  if (left !== right) {
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left;
  }
  return a.name.localeCompare(b.name, 'en');
}

export function buildDataset(
  entries: ModelEntry[],
  snapshots: Snapshots,
  options: BuildOptions = {},
): Dataset {
  const now = options.now ?? new Date();
  const config = options.config ?? scoringConfig;
  const frontier = frontierOf(snapshots, config);

  const models = entries.map((entry): ModelRecord => {
    const { data } = entry;
    const modelsdevId = data.sources.modelsdev ?? entry.id;
    const aaId = data.sources.aa ?? null;
    const arenaId = data.sources.arena_text ?? null;

    const facts = snapshots.modelsdev?.models[modelsdevId] ?? null;
    const aa = aaId ? (snapshots.aa?.models[aaId] ?? null) : null;
    const arena = arenaId ? (snapshots.arena?.models[arenaId] ?? null) : null;

    let price: Price | null = null;
    let priceSource: ModelRecord['price_source'] = null;
    if (data.overrides.price) {
      price = {
        input: data.overrides.price.input,
        output: data.overrides.price.output,
        cache_read: data.overrides.price.cache_read ?? facts?.cache_read ?? null,
      };
      priceSource = 'override';
    } else if (facts && facts.input !== null && facts.output !== null) {
      price = { input: facts.input, output: facts.output, cache_read: facts.cache_read };
      priceSource = 'modelsdev';
    }

    const metrics = {} as Record<MetricKey, number | null>;
    for (const key of METRIC_KEYS) metrics[key] = metricValue(snapshots, entry, key);

    const rating = rateModel(
      { metrics, frontier, subjective: data.subjective.score ?? null, price },
      config,
    );

    const reviewedAt = data.reviewed_at ?? null;

    return {
      id: entry.id,
      name: data.name,
      vendor: data.vendor,
      status: data.status,
      rating,
      price_source: priceSource,
      verdict: data.subjective.verdict ?? null,
      pros: data.subjective.pros,
      cons: data.subjective.cons,
      best_for: data.subjective.best_for,
      reviewed_at: reviewedAt,
      stale: reviewedAt !== null && daysBetween(reviewedAt, now) > config.staleAfterDays,
      has_review: entry.hasReview,
      facts: {
        context: facts?.context ?? null,
        release_date: facts?.release_date ?? null,
        open_weights: facts?.open_weights ?? null,
        modalities: facts?.modalities ?? null,
        index_cost_usd: aa?.index_cost_usd ?? null,
      },
      source_ids: { modelsdev: modelsdevId, aa: aaId, arena_text: arenaId },
      matched: { modelsdev: facts !== null, aa: aa !== null, arena: arena !== null },
      links: {
        modelsdev: SOURCE_INFO.modelsdev.url,
        aa: aaId ? `https://artificialanalysis.ai/models/${encodeURIComponent(aaId)}` : null,
        arena: arenaId ? SOURCE_INFO.arena.url : null,
      },
      url: `${SITE_URL}/m/${entry.id}`,
    };
  });

  models.sort(compareByIntelligence);

  const sources = {} as Record<SourceId, SourceStatus>;
  for (const id of SOURCE_IDS) {
    sources[id] = { ...SOURCE_INFO[id], fetched_at: snapshots[id]?.fetched_at ?? null };
  }

  return { generated_at: now.toISOString(), sources, frontier, models };
}

/** Latest `fetched_at` across all sources, or null when nothing was ever synced. */
export function latestSync(dataset: Dataset): string | null {
  const times = SOURCE_IDS.map((id) => dataset.sources[id].fetched_at).filter(
    (value): value is string => value !== null,
  );
  return times.length > 0 ? times.sort().at(-1)! : null;
}

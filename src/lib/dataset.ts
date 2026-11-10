/**
 * Merges the model files with the source snapshots into the one dataset
 * that pages, the JSON API and `pnpm report` all read, so every consumer
 * shows the same numbers (docs/SPEC.md §10).
 *
 * Pure: takes its inputs as arguments and must not import `astro:*`.
 */
import type { ModelEntry } from './model-schema';
import {
  METRIC_KEYS,
  scoringConfig,
  type MappingField,
  type MetricKey,
  type ScoringConfig,
} from './scoring.config';
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
  source_ids: { modelsdev: string } & Record<MappingField, string | null>;
  /** Whether the model was found in each source's snapshot. */
  matched: Record<SourceId, boolean>;
  /** Language-neutral page URL; it redirects to the default locale. */
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

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** A metric's raw score for one model: snapshot → mapped ID → metric. */
function metricValue(
  snapshots: Snapshots,
  entry: ModelEntry,
  key: string,
  config: ScoringConfig,
): number | null {
  const metric = config.intelligence.metrics[key];
  if (!metric) return null;
  const id = entry.data.sources[metric.mapping];
  if (!id) return null;
  const model = snapshots[metric.source]?.models[id] as Record<string, unknown> | undefined;
  return asNumber(model?.[key]);
}

export function frontierOf(
  snapshots: Snapshots,
  config: ScoringConfig = scoringConfig,
): Record<string, number | null> {
  const frontier: Record<string, number | null> = {};
  for (const [key, metric] of Object.entries(config.intelligence.metrics)) {
    frontier[key] = asNumber(snapshots[metric.source]?.frontier[key]);
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
    const { sources } = data;
    const modelsdevId = sources.modelsdev ?? entry.id;

    const facts = snapshots.modelsdev?.models[modelsdevId] ?? null;
    const aa = sources.aa ? (snapshots.aa?.models[sources.aa] ?? null) : null;
    const arena = [sources.arena_text, sources.arena_webdev].some(
      (id) => id !== undefined && snapshots.arena?.models[id] !== undefined,
    );

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

    const metrics: Record<string, number | null> = {};
    for (const key of Object.keys(config.intelligence.metrics)) {
      metrics[key] = metricValue(snapshots, entry, key, config);
    }

    const rating = rateModel({ metrics, frontier, price }, config);

    return {
      id: entry.id,
      name: data.name,
      vendor: data.vendor,
      status: data.status,
      rating,
      price_source: priceSource,
      facts: {
        context: facts?.context ?? null,
        release_date: facts?.release_date ?? null,
        open_weights: facts?.open_weights ?? null,
        modalities: facts?.modalities ?? null,
        index_cost_usd: aa?.index_cost_usd ?? null,
      },
      source_ids: {
        modelsdev: modelsdevId,
        aa: sources.aa ?? null,
        arena_text: sources.arena_text ?? null,
        arena_webdev: sources.arena_webdev ?? null,
      },
      matched: { modelsdev: facts !== null, aa: aa !== null, arena },
      url: `${SITE_URL}/m/${entry.id}`,
    };
  });

  models.sort(compareByIntelligence);

  const sources = {} as Record<SourceId, SourceStatus>;
  for (const id of SOURCE_IDS) {
    sources[id] = { ...SOURCE_INFO[id], fetched_at: snapshots[id]?.fetched_at ?? null };
  }

  const liveFrontier = {} as Record<MetricKey, number | null>;
  for (const key of METRIC_KEYS) liveFrontier[key] = frontier[key] ?? null;

  return { generated_at: now.toISOString(), sources, frontier: liveFrontier, models };
}

/** Latest `fetched_at` across all sources, or null when nothing was ever synced. */
export function latestSync(dataset: Dataset): string | null {
  const times = SOURCE_IDS.map((id) => dataset.sources[id].fetched_at).filter(
    (value): value is string => value !== null,
  );
  return times.length > 0 ? times.sort().at(-1)! : null;
}

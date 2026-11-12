import type { ModelEntry } from './model-schema';
import {
  METRIC_KEYS,
  scoringConfig,
  type MappingField,
  type MetricKey,
  type ScoringConfig,
} from './scoring.config';
import { listPrice, rateModel, type Price, type Rating } from './scoring';
import {
  SOURCE_IDS,
  SOURCE_INFO,
  type RatingSourceId,
  type Snapshots,
  type SourceId,
} from './snapshots';

export const SITE_URL = 'https://mekiki.fog.moe';
export const REPO_URL = 'https://github.com/scarletkc/mekiki';

export interface SourceStatus {
  name: string;
  url: string;
  license: string | null;
  fetched_at: string | null;
  edition: string | null;
  as_of: string | null;
}

export interface OpenrouterUsage {
  permaslug: string;
  tokens: number;
  days: number;
  rank: number | null;
}

export interface ModelRecord {
  id: string;
  name: string;
  vendor: string;
  status: 'active' | 'legacy';
  rating: Rating;
  price_source: 'override' | 'modelsdev' | null;
  facts: {
    context: number | null;
    release_date: string | null;
    open_weights: boolean | null;
    modalities: { input: string[]; output: string[] } | null;
    index_cost_usd: number | null;
  };
  source_ids: { modelsdev: string } & Record<MappingField, string | null>;
  matched: Record<RatingSourceId, boolean>;
  openrouter: OpenrouterUsage | null;
  url: string;
}

export interface Dataset {
  generated_at: string;
  sources: Record<SourceId, SourceStatus>;
  frontier: Record<MetricKey, number | null>;
  floor: Record<MetricKey, number | null>;
  run_cost: {
    typical_token_use: number | null;
    models: number;
  };
  models: ModelRecord[];
}

export interface BuildOptions {
  now?: Date;
  config?: ScoringConfig;
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function found(
  snapshot: { models: Record<string, unknown> } | null,
  ...ids: (string | undefined)[]
): boolean {
  return ids.some((id) => id !== undefined && snapshot?.models[id] !== undefined);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

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

export function floorOf(
  snapshots: Snapshots,
  config: ScoringConfig = scoringConfig,
): Record<string, number | null> {
  const floor: Record<string, number | null> = {};
  for (const [key, metric] of Object.entries(config.intelligence.metrics)) {
    floor[key] = asNumber(snapshots[metric.source]?.floor?.[key]);
  }
  return floor;
}

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
  const floor = floorOf(snapshots, config);

  const prepared = entries.map((entry) => {
    const { data } = entry;
    const { sources } = data;
    const modelsdevId = sources.modelsdev ?? entry.id;

    const facts = snapshots.modelsdev?.models[modelsdevId] ?? null;
    const aa = sources.aa ? (snapshots.aa?.models[sources.aa] ?? null) : null;

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

    return {
      entry,
      modelsdevId,
      facts,
      aa,
      price,
      priceSource,
      runCost: asNumber(aa?.index_cost_usd),
    };
  });

  const tokenUses = prepared.flatMap(({ runCost, price }) => {
    const blended = listPrice(price, config);
    return runCost !== null && runCost > 0 && blended !== null && blended > 0
      ? [runCost / blended]
      : [];
  });
  const typicalTokenUse = median(tokenUses);

  const models = prepared.map((item): ModelRecord => {
    const { entry, modelsdevId, facts, aa, price, priceSource, runCost } = item;
    const { data } = entry;
    const { sources } = data;

    const metrics: Record<string, number | null> = {};
    for (const key of Object.keys(config.intelligence.metrics)) {
      metrics[key] = metricValue(snapshots, entry, key, config);
    }

    const measuredPrice =
      runCost !== null && typicalTokenUse !== null && runCost > 0 && typicalTokenUse > 0
        ? runCost / typicalTokenUse
        : null;

    const rating = rateModel({ metrics, frontier, floor, price, measuredPrice }, config);

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
        index_cost_usd: runCost,
      },
      source_ids: {
        modelsdev: modelsdevId,
        aa: sources.aa ?? null,
        arena_text: sources.arena_text ?? null,
        arena_webdev: sources.arena_webdev ?? null,
        arena_agent: sources.arena_agent ?? null,
        livebench: sources.livebench ?? null,
      },
      matched: {
        modelsdev: facts !== null,
        aa: aa !== null,
        arena: found(
          snapshots.arena,
          sources.arena_text,
          sources.arena_webdev,
          sources.arena_agent,
        ),
        livebench: found(snapshots.livebench, sources.livebench),
      },
      openrouter: snapshots.openrouter?.models[entry.id] ?? null,
      url: `${SITE_URL}/m/${entry.id}`,
    };
  });

  models.sort(compareByIntelligence);

  const sources = {} as Record<SourceId, SourceStatus>;
  for (const id of SOURCE_IDS) {
    sources[id] = {
      ...SOURCE_INFO[id],
      fetched_at: snapshots[id]?.fetched_at ?? null,
      edition: snapshots[id]?.edition ?? null,
      as_of: snapshots[id]?.as_of ?? null,
    };
  }

  const liveFrontier = {} as Record<MetricKey, number | null>;
  const liveFloor = {} as Record<MetricKey, number | null>;
  for (const key of METRIC_KEYS) {
    liveFrontier[key] = frontier[key] ?? null;
    liveFloor[key] = floor[key] ?? null;
  }

  return {
    generated_at: now.toISOString(),
    sources,
    frontier: liveFrontier,
    floor: liveFloor,
    run_cost: { typical_token_use: typicalTokenUse, models: tokenUses.length },
    models,
  };
}

export function latestSync(dataset: Dataset): string | null {
  const times = SOURCE_IDS.map((id) => dataset.sources[id].fetched_at).filter(
    (value): value is string => value !== null,
  );
  return times.length > 0 ? times.sort().at(-1)! : null;
}

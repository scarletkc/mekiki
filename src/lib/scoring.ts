/**
 * Rating algorithm (docs/SPEC.md §5). Pure functions only: no I/O, no
 * dates, no Astro imports, so the same code runs in the site build, in
 * `pnpm report` and in unit tests.
 *
 * Functions return unrounded numbers; rounding to one decimal happens once,
 * in `rateModel`, and tiers are derived from the rounded score so the tier
 * always agrees with the number shown next to it.
 */
import {
  scoringConfig,
  type CostTier,
  type FloorRule,
  type IntelligenceTier,
  type ScoringConfig,
  type ValueTier,
} from './scoring.config';

export interface Price {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens, when known. */
  cache_read?: number | null;
}

export interface RatingInput {
  /** Raw benchmark scores of this model, keyed by metric. Missing or null = no score. */
  metrics: Record<string, number | null | undefined>;
  /** Current best raw score of each metric across the whole leaderboard. */
  frontier: Record<string, number | null | undefined>;
  /** Official price, or null when unknown. */
  price: Price | null;
  /**
   * What the model was measured to cost on real work, as USD per 1M
   * tokens. Null or absent when it was never measured.
   */
  measuredPrice?: number | null;
}

/** What the cost side of value rests on. */
export type ValueCostBasis = 'run_cost' | 'list_price';

export interface MetricBreakdown {
  raw: number | null;
  normalized: number | null;
  /** Share of the benchmark score when every metric has a score; the shares add up to 1. */
  weight: number;
  frontier: number | null;
}

export interface Rating {
  intelligence: {
    /** Weighted mean of the normalised leaderboard metrics; null when the model is on none. */
    score: number | null;
    tier: IntelligenceTier | null;
    /** One entry per metric in the config, whether or not the model has a score. */
    breakdown: Record<string, MetricBreakdown>;
  };
  cost: {
    tier: CostTier | null;
    index: number | null;
    blended: number | null;
    input: number | null;
    output: number | null;
    cache_read: number | null;
    /** True when the model is priced at exactly 0. */
    free: boolean;
  };
  value: {
    score: number | null;
    tier: ValueTier | null;
    /** `run_cost` when a measured price was used, else `list_price`. Null without a price. */
    cost_basis: ValueCostBasis | null;
    /** The price value is computed from, USD per 1M tokens. */
    effective_price: number | null;
    /** Cost index of the effective price. */
    cost_index: number | null;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to one decimal place (the precision used on the site and in the API). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Normalise a raw benchmark score to 0–100, where 100 is the current
 * frontier. Returns null when the scale is degenerate (frontier ≤ floor).
 */
export function normalizeMetric(raw: number, frontier: number, floor: FloorRule): number | null {
  const floorValue = floor.type === 'absolute' ? floor.value : frontier - floor.gap;
  const span = frontier - floorValue;
  if (!(span > 0)) return null;
  return clamp((100 * (raw - floorValue)) / span, 0, 100);
}

/**
 * Weighted mean of the normalised metrics a model has. Metrics without a
 * raw score or without a frontier are left out and the remaining weights
 * are re-normalised.
 */
export function computeBenchmark(
  metrics: RatingInput['metrics'],
  frontier: RatingInput['frontier'],
  config: ScoringConfig = scoringConfig,
): { score: number | null; breakdown: Record<string, MetricBreakdown> } {
  const breakdown: Record<string, MetricBreakdown> = {};
  const entries = Object.entries(config.intelligence.metrics);
  let configured = 0;
  for (const [, { weight }] of entries) configured += Math.max(weight, 0);

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, { weight, floor }] of entries) {
    const raw = metrics[key];
    const top = frontier[key];
    let normalized: number | null = null;
    if (isNumber(raw) && isNumber(top)) {
      normalized = normalizeMetric(raw, top, floor);
    }
    if (normalized !== null && weight > 0) {
      weighted += weight * normalized;
      totalWeight += weight;
    }
    // Reported as a share of the score, so the weights add up to 1.
    const share = configured > 0 ? Math.max(weight, 0) / configured : 0;
    breakdown[key] = {
      raw: isNumber(raw) ? raw : null,
      normalized,
      weight: Math.round(share * 1e4) / 1e4,
      frontier: isNumber(top) ? top : null,
    };
  }

  return { score: totalWeight > 0 ? weighted / totalWeight : null, breakdown };
}

/**
 * Price of a cached input token. Without a known cache-read price the input
 * price applies, and a cache price above the input price is capped at it
 * (an overridden input price can end up below the cache price from models.dev).
 */
export function cacheReadPrice(input: number, cacheRead: number | null | undefined): number {
  return isNumber(cacheRead) ? Math.min(cacheRead, input) : input;
}

/** Share of input tokens the blend counts as cache hits, as a whole percentage. */
export function cacheHitPercent(cost: ScoringConfig['cost'] = scoringConfig.cost): number {
  const inputTokens = cost.cacheReadWeight + cost.inputWeight;
  return inputTokens > 0 ? Math.round((100 * cost.cacheReadWeight) / inputTokens) : 0;
}

/**
 * Blended price in USD per 1M tokens: cache reads, input and output mixed by
 * the configured weights. Cache-write surcharges are not counted.
 */
export function blendedPrice(price: Price, config: ScoringConfig = scoringConfig): number {
  const { cacheReadWeight, inputWeight, outputWeight } = config.cost;
  const cached = cacheReadPrice(price.input, price.cache_read);
  return (
    (cacheReadWeight * cached + inputWeight * price.input + outputWeight * price.output) /
    (cacheReadWeight + inputWeight + outputWeight)
  );
}

/**
 * The price value is computed from. A low price per token means little if
 * the model burns many tokens, so a measured price takes the place of the
 * blended list price when there is one. `runCostWeight` blends the two
 * geometrically; without a measured price the blended price stands.
 */
export function effectivePrice(
  blended: number,
  measured: number | null | undefined,
  config: ScoringConfig = scoringConfig,
): { price: number; basis: ValueCostBasis } {
  const weight = clamp(config.value.runCostWeight, 0, 1);
  if (!isNumber(measured) || !(measured > 0) || weight === 0) {
    return { price: blended, basis: 'list_price' };
  }
  if (weight === 1) return { price: measured, basis: 'run_cost' };
  return { price: blended ** (1 - weight) * measured ** weight, basis: 'run_cost' };
}

/** Blended list price of a model (cache reads, input and output). Null without a usable price. */
export function listPrice(
  price: Price | null | undefined,
  config: ScoringConfig = scoringConfig,
): number | null {
  if (!price || !isNumber(price.input) || !isNumber(price.output)) return null;
  return blendedPrice(price, config);
}

/** Log-scaled cost index, 0 (cheapest) to 100 (most expensive). */
export function costIndex(blended: number, config: ScoringConfig = scoringConfig): number {
  const { indexFloorPrice, indexCeilPrice } = config.cost;
  if (blended <= indexFloorPrice) return 0;
  return clamp(
    (100 * Math.log10(blended / indexFloorPrice)) / Math.log10(indexCeilPrice / indexFloorPrice),
    0,
    100,
  );
}

/** Geometric blend of intelligence and affordability. */
export function computeValue(
  intelligence: number,
  index: number,
  config: ScoringConfig = scoringConfig,
): number {
  const { intelligenceExponent, affordabilityExponent, minAffordability } = config.value;
  const affordability = Math.max(100 - index, minAffordability);
  return Math.max(intelligence, 0) ** intelligenceExponent * affordability ** affordabilityExponent;
}

export function intelligenceTier(
  score: number,
  config: ScoringConfig = scoringConfig,
): IntelligenceTier {
  const { top, high, mid, low } = config.intelligence.tiers;
  if (score >= top) return 'top';
  if (score >= high) return 'high';
  if (score >= mid) return 'mid';
  if (score >= low) return 'low';
  return 'very_low';
}

/** Cost tier from the blended price (absolute thresholds, not the index). */
export function costTier(blended: number, config: ScoringConfig = scoringConfig): CostTier {
  const { very_low, low, mid, high } = config.cost.tiers;
  if (blended < very_low) return 'very_low';
  if (blended < low) return 'low';
  if (blended < mid) return 'mid';
  if (blended < high) return 'high';
  return 'very_high';
}

export function valueTier(score: number, config: ScoringConfig = scoringConfig): ValueTier {
  const { top, high, mid, low } = config.value.tiers;
  if (score >= top) return 'top';
  if (score >= high) return 'high';
  if (score >= mid) return 'mid';
  if (score >= low) return 'low';
  return 'very_low';
}

/**
 * Full rating of one model. Scores are rounded to one decimal; missing
 * values are null (never 0), so callers can tell "unrated" from "rated 0".
 */
export function rateModel(input: RatingInput, config: ScoringConfig = scoringConfig): Rating {
  const benchmark = computeBenchmark(input.metrics, input.frontier, config);

  const price =
    input.price && isNumber(input.price.input) && isNumber(input.price.output) ? input.price : null;
  const blended = listPrice(price, config);
  const index = blended !== null ? costIndex(blended, config) : null;

  // Value looks at what the model costs to use, not only at its price list.
  const effective = blended !== null ? effectivePrice(blended, input.measuredPrice, config) : null;
  const valueIndex = effective !== null ? costIndex(effective.price, config) : null;
  const value =
    benchmark.score !== null && valueIndex !== null
      ? computeValue(benchmark.score, valueIndex, config)
      : null;

  const breakdown: Record<string, MetricBreakdown> = {};
  for (const [key, item] of Object.entries(benchmark.breakdown)) {
    breakdown[key] = {
      ...item,
      normalized: item.normalized === null ? null : round1(item.normalized),
    };
  }

  const intelligenceScore = benchmark.score === null ? null : round1(benchmark.score);
  const valueScore = value === null ? null : round1(value);

  return {
    intelligence: {
      score: intelligenceScore,
      tier: intelligenceScore === null ? null : intelligenceTier(intelligenceScore, config),
      breakdown,
    },
    cost: {
      tier: blended === null ? null : costTier(blended, config),
      index: index === null ? null : round1(index),
      blended,
      input: price ? price.input : null,
      output: price ? price.output : null,
      cache_read: price && isNumber(price.cache_read) ? price.cache_read : null,
      free: price !== null && price.input === 0 && price.output === 0,
    },
    value: {
      score: valueScore,
      tier: valueScore === null ? null : valueTier(valueScore, config),
      cost_basis: effective?.basis ?? null,
      effective_price: effective?.price ?? null,
      cost_index: valueIndex === null ? null : round1(valueIndex),
    },
  };
}

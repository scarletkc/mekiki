/**
 * Rating algorithm (docs/SPEC.md §6). Pure functions only: no I/O, no
 * dates, no Astro imports, so the same code runs in the site build, in
 * `pnpm report` and in unit tests.
 *
 * Functions return unrounded numbers; rounding to one decimal happens once,
 * in `rateModel`, and tiers are derived from the rounded score so the tier
 * always agrees with the number shown next to it.
 */
import {
  METRIC_KEYS,
  scoringConfig,
  type CostTier,
  type FloorRule,
  type IntelligenceTier,
  type MetricKey,
  type ScoringConfig,
  type ValueTier,
} from './scoring.config';

export type Basis = 'both' | 'benchmark_only' | 'subjective_only' | 'none';

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
  metrics: Partial<Record<MetricKey, number | null>>;
  /** Current best raw score of each metric across the whole leaderboard. */
  frontier: Partial<Record<MetricKey, number | null>>;
  /** Subjective score, 0–100, or null when not reviewed. */
  subjective: number | null;
  /** Official price, or null when unknown. */
  price: Price | null;
}

export interface MetricBreakdown {
  raw: number | null;
  normalized: number | null;
  /** Configured weight inside the benchmark score. */
  weight: number;
  frontier: number | null;
}

export interface Rating {
  intelligence: {
    score: number | null;
    tier: IntelligenceTier | null;
    basis: Basis;
    benchmark: number | null;
    subjective: number | null;
    breakdown: Record<MetricKey, MetricBreakdown>;
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
): { score: number | null; breakdown: Record<MetricKey, MetricBreakdown> } {
  const breakdown = {} as Record<MetricKey, MetricBreakdown>;
  let weighted = 0;
  let totalWeight = 0;

  for (const key of METRIC_KEYS) {
    const { weight, floor } = config.intelligence.metrics[key];
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
    breakdown[key] = {
      raw: isNumber(raw) ? raw : null,
      normalized,
      weight,
      frontier: isNumber(top) ? top : null,
    };
  }

  return { score: totalWeight > 0 ? weighted / totalWeight : null, breakdown };
}

/** Combine the benchmark score with the subjective score. */
export function computeIntelligence(
  benchmark: number | null,
  subjective: number | null,
  config: ScoringConfig = scoringConfig,
): { score: number | null; basis: Basis } {
  const { benchmarkWeight, subjectiveWeight } = config.intelligence;
  if (benchmark !== null && subjective !== null) {
    const total = benchmarkWeight + subjectiveWeight;
    return {
      score: (benchmarkWeight * benchmark + subjectiveWeight * subjective) / total,
      basis: 'both',
    };
  }
  if (benchmark !== null) return { score: benchmark, basis: 'benchmark_only' };
  if (subjective !== null) return { score: subjective, basis: 'subjective_only' };
  return { score: null, basis: 'none' };
}

/** Blended price in USD per 1M tokens, weighting input over output. */
export function blendedPrice(
  input: number,
  output: number,
  config: ScoringConfig = scoringConfig,
): number {
  const { inputWeight, outputWeight } = config.cost;
  return (inputWeight * input + outputWeight * output) / (inputWeight + outputWeight);
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
  return (
    Math.pow(Math.max(intelligence, 0), intelligenceExponent) *
    Math.pow(affordability, affordabilityExponent)
  );
}

export function intelligenceTier(
  score: number,
  config: ScoringConfig = scoringConfig,
): IntelligenceTier {
  const { top, high, mid } = config.intelligence.tiers;
  if (score >= top) return 'top';
  if (score >= high) return 'high';
  if (score >= mid) return 'mid';
  return 'low';
}

/** Cost tier from the blended price (absolute thresholds, not the index). */
export function costTier(blended: number, config: ScoringConfig = scoringConfig): CostTier {
  const { low, mid, high } = config.cost.tiers;
  if (blended < low) return 'low';
  if (blended < mid) return 'mid';
  if (blended < high) return 'high';
  return 'very_high';
}

export function valueTier(score: number, config: ScoringConfig = scoringConfig): ValueTier {
  const { top, high, mid } = config.value.tiers;
  if (score >= top) return 'top';
  if (score >= high) return 'high';
  if (score >= mid) return 'mid';
  return 'low';
}

/**
 * Full rating of one model. Scores are rounded to one decimal; missing
 * values are null (never 0), so callers can tell "unrated" from "rated 0".
 */
export function rateModel(input: RatingInput, config: ScoringConfig = scoringConfig): Rating {
  const subjective = isNumber(input.subjective) ? clamp(input.subjective, 0, 100) : null;
  const benchmark = computeBenchmark(input.metrics, input.frontier, config);
  const intelligence = computeIntelligence(benchmark.score, subjective, config);

  const price =
    input.price && isNumber(input.price.input) && isNumber(input.price.output)
      ? input.price
      : null;
  const blended = price ? blendedPrice(price.input, price.output, config) : null;
  const index = blended !== null ? costIndex(blended, config) : null;

  const value =
    intelligence.score !== null && index !== null
      ? computeValue(intelligence.score, index, config)
      : null;

  const breakdown = {} as Record<MetricKey, MetricBreakdown>;
  for (const key of METRIC_KEYS) {
    const item = benchmark.breakdown[key];
    breakdown[key] = {
      ...item,
      normalized: item.normalized === null ? null : round1(item.normalized),
    };
  }

  const intelligenceScore = intelligence.score === null ? null : round1(intelligence.score);
  const valueScore = value === null ? null : round1(value);

  return {
    intelligence: {
      score: intelligenceScore,
      tier: intelligenceScore === null ? null : intelligenceTier(intelligenceScore, config),
      basis: intelligence.basis,
      benchmark: benchmark.score === null ? null : round1(benchmark.score),
      subjective,
      breakdown,
    },
    cost: {
      tier: blended === null ? null : costTier(blended, config),
      index: index === null ? null : round1(index),
      blended,
      input: price ? price.input : null,
      output: price ? price.output : null,
      cache_read: price && isNumber(price.cache_read) ? price.cache_read : null,
      free: blended === 0,
    },
    value: {
      score: valueScore,
      tier: valueScore === null ? null : valueTier(valueScore, config),
    },
  };
}

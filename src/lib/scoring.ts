import {
  scoringConfig,
  type CostTier,
  type FloorRule,
  type IntelligenceTier,
  type ScoringConfig,
  type ValueTier,
} from './scoring.config';

export interface Price {
  input: number;
  output: number;
  cache_read?: number | null;
}

export interface RatingInput {
  metrics: Record<string, number | null | undefined>;
  frontier: Record<string, number | null | undefined>;
  price: Price | null;
  measuredPrice?: number | null;
}

export type ValueCostBasis = 'run_cost' | 'list_price';

export interface MetricBreakdown {
  raw: number | null;
  normalized: number | null;
  weight: number;
  frontier: number | null;
}

export interface Rating {
  intelligence: {
    score: number | null;
    tier: IntelligenceTier | null;
    breakdown: Record<string, MetricBreakdown>;
  };
  cost: {
    tier: CostTier | null;
    index: number | null;
    blended: number | null;
    input: number | null;
    output: number | null;
    cache_read: number | null;
    free: boolean;
  };
  value: {
    score: number | null;
    tier: ValueTier | null;
    cost_basis: ValueCostBasis | null;
    effective_price: number | null;
    cost_index: number | null;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeMetric(raw: number, frontier: number, floor: FloorRule): number | null {
  const floorValue = floor.type === 'absolute' ? floor.value : frontier - floor.gap;
  const span = frontier - floorValue;
  if (!(span > 0)) return null;
  return clamp((100 * (raw - floorValue)) / span, 0, 100);
}

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

export function cacheReadPrice(input: number, cacheRead: number | null | undefined): number {
  return isNumber(cacheRead) ? Math.min(cacheRead, input) : input;
}

export function cacheHitPercent(cost: ScoringConfig['cost'] = scoringConfig.cost): number {
  const inputTokens = cost.cacheReadWeight + cost.inputWeight;
  return inputTokens > 0 ? Math.round((100 * cost.cacheReadWeight) / inputTokens) : 0;
}

export function blendedPrice(price: Price, config: ScoringConfig = scoringConfig): number {
  const { cacheReadWeight, inputWeight, outputWeight } = config.cost;
  const cached = cacheReadPrice(price.input, price.cache_read);
  return (
    (cacheReadWeight * cached + inputWeight * price.input + outputWeight * price.output) /
    (cacheReadWeight + inputWeight + outputWeight)
  );
}

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

export function listPrice(
  price: Price | null | undefined,
  config: ScoringConfig = scoringConfig,
): number | null {
  if (!price || !isNumber(price.input) || !isNumber(price.output)) return null;
  return blendedPrice(price, config);
}

export function costIndex(blended: number, config: ScoringConfig = scoringConfig): number {
  const { indexFloorPrice, indexCeilPrice } = config.cost;
  if (blended <= indexFloorPrice) return 0;
  return clamp(
    (100 * Math.log10(blended / indexFloorPrice)) / Math.log10(indexCeilPrice / indexFloorPrice),
    0,
    100,
  );
}

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

export function rateModel(input: RatingInput, config: ScoringConfig = scoringConfig): Rating {
  const benchmark = computeBenchmark(input.metrics, input.frontier, config);

  const price =
    input.price && isNumber(input.price.input) && isNumber(input.price.output) ? input.price : null;
  const blended = listPrice(price, config);
  const index = blended !== null ? costIndex(blended, config) : null;

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

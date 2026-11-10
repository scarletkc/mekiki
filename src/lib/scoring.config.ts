/**
 * Every tunable number of the rating algorithm lives here: weights,
 * normalisation parameters and tier thresholds. See docs/SPEC.md §6.
 *
 * After changing anything, run `pnpm test` and `pnpm report`.
 */

/** Benchmark metrics that feed the intelligence score. */
export const METRIC_KEYS = ['aa_intelligence', 'aa_coding', 'arena_text'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Snapshot file (data/snapshots/<source>.json) a metric is read from. */
export type BenchmarkSource = 'aa' | 'arena';

/**
 * How the 0 point of a metric is chosen when normalising to 0–100.
 * - `absolute`: a fixed raw score (index-style metrics start at 0).
 * - `below_frontier`: frontier minus a fixed gap (Elo-style metrics have no
 *   meaningful zero, so only the top of the scale is used).
 */
export type FloorRule =
  | { type: 'absolute'; value: number }
  | { type: 'below_frontier'; gap: number };

export interface MetricConfig {
  source: BenchmarkSource;
  /** Relative weight inside the benchmark score. Re-normalised over the metrics a model actually has. */
  weight: number;
  floor: FloorRule;
}

export const INTELLIGENCE_TIERS = ['top', 'high', 'mid', 'low'] as const;
export const COST_TIERS = ['low', 'mid', 'high', 'very_high'] as const;
export const VALUE_TIERS = ['top', 'high', 'mid', 'low'] as const;
export type IntelligenceTier = (typeof INTELLIGENCE_TIERS)[number];
export type CostTier = (typeof COST_TIERS)[number];
export type ValueTier = (typeof VALUE_TIERS)[number];

export interface ScoringConfig {
  intelligence: {
    /** Share of the benchmark score when a subjective score also exists. */
    benchmarkWeight: number;
    /** Share of the subjective score when a benchmark score also exists. */
    subjectiveWeight: number;
    metrics: Record<MetricKey, MetricConfig>;
    /** Minimum (rounded) score for each tier, checked top-down; anything lower is `low`. */
    tiers: { top: number; high: number; mid: number };
  };
  cost: {
    /** blended = (inputWeight × input + outputWeight × output) / (inputWeight + outputWeight) */
    inputWeight: number;
    outputWeight: number;
    /** Blended price (USD per 1M tokens) that maps to cost index 0. */
    indexFloorPrice: number;
    /** Blended price (USD per 1M tokens) that maps to cost index 100. */
    indexCeilPrice: number;
    /** Upper bound (exclusive) of blended price for each tier; anything higher is `very_high`. */
    tiers: { low: number; mid: number; high: number };
  };
  value: {
    /** value = intelligence^a × max(100 − cost index, minAffordability)^b */
    intelligenceExponent: number;
    affordabilityExponent: number;
    minAffordability: number;
    /** Minimum (rounded) score for each tier; anything lower is `low`. */
    tiers: { top: number; high: number; mid: number };
  };
  /** A review older than this many days is flagged as stale on the site. */
  staleAfterDays: number;
}

export const scoringConfig: ScoringConfig = {
  intelligence: {
    benchmarkWeight: 0.6,
    subjectiveWeight: 0.4,
    metrics: {
      aa_intelligence: { source: 'aa', weight: 0.5, floor: { type: 'absolute', value: 0 } },
      aa_coding: { source: 'aa', weight: 0.2, floor: { type: 'absolute', value: 0 } },
      arena_text: { source: 'arena', weight: 0.3, floor: { type: 'below_frontier', gap: 300 } },
    },
    tiers: { top: 90, high: 75, mid: 55 },
  },
  cost: {
    inputWeight: 3,
    outputWeight: 1,
    indexFloorPrice: 0.1,
    indexCeilPrice: 30,
    tiers: { low: 1, mid: 5, high: 15 },
  },
  value: {
    intelligenceExponent: 0.6,
    affordabilityExponent: 0.4,
    minAffordability: 5,
    tiers: { top: 70, high: 60, mid: 50 },
  },
  staleAfterDays: 90,
};

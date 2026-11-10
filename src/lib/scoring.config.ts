/**
 * Every tunable number of the rating algorithm lives here: weights,
 * normalisation parameters and tier thresholds. See docs/SPEC.md §6.
 *
 * After changing anything, run `pnpm test` and `pnpm report`.
 */

/** Snapshot file (data/snapshots/<source>.json) a metric is read from. */
export type BenchmarkSource = 'aa' | 'arena';

/** The field under `sources` in a model file that names the model for a metric. */
export type MappingField = 'aa' | 'arena_text' | 'arena_webdev';

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
  mapping: MappingField;
  /** Relative weight inside the benchmark score. Re-normalised over the metrics a model actually has. */
  weight: number;
  floor: FloorRule;
  /** Public page of the leaderboard, linked from the model page. */
  url?: string;
}

export const INTELLIGENCE_TIERS = ['top', 'high', 'mid', 'low'] as const;
export const COST_TIERS = ['low', 'mid', 'high', 'very_high'] as const;
export const VALUE_TIERS = ['top', 'high', 'mid', 'low'] as const;
export type IntelligenceTier = (typeof INTELLIGENCE_TIERS)[number];
export type CostTier = (typeof COST_TIERS)[number];
export type ValueTier = (typeof VALUE_TIERS)[number];

export interface ScoringConfig {
  intelligence: {
    /** Benchmark metrics that feed the intelligence score, keyed by metric. */
    metrics: Record<string, MetricConfig>;
    /** Minimum (rounded) score for each tier, checked top-down; anything lower is `low`. */
    tiers: { top: number; high: number; mid: number };
  };
  cost: {
    /**
     * Share of input tokens assumed to be served from the prompt cache (0–1):
     * effective input = cacheHitRate × cache_read + (1 − cacheHitRate) × input.
     * A model without a cache-read price pays the full input price.
     */
    cacheHitRate: number;
    /** blended = (inputWeight × effective input + outputWeight × output) / (inputWeight + outputWeight) */
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
    /**
     * How much token efficiency counts. A model's token use is the cost of
     * its AA Intelligence Index run divided by its blended list price, and
     * value is computed from
     *   blended price × (token use ÷ typical token use)^tokenUseExponent
     * instead of the blended price. 0 ignores token use, 1 counts it in full.
     * A model without a run cost is rated on its blended price alone.
     */
    tokenUseExponent: number;
    /**
     * "Typical" is the median token use of this many models at the top of
     * the AA Intelligence Index. `pnpm sync` computes it, so sync again
     * after changing this.
     */
    tokenUseReferenceSize: number;
    /** Minimum (rounded) score for each tier; anything lower is `low`. */
    tiers: { top: number; high: number; mid: number };
  };
}

/**
 * The leaderboard metrics in use. To add one: add it here, make its source's
 * adapter write it to the snapshot (scripts/sources/), and add its label to
 * the dictionaries in src/i18n/.
 *
 * Coding ability is measured by Arena's WebDev board. Artificial Analysis
 * also has a Coding Index, but its free API does not return it.
 */
const metrics = {
  aa_intelligence: {
    source: 'aa',
    mapping: 'aa',
    weight: 0.5,
    floor: { type: 'absolute', value: 0 },
  },
  arena_text: {
    source: 'arena',
    mapping: 'arena_text',
    weight: 0.3,
    floor: { type: 'below_frontier', gap: 300 },
    url: 'https://arena.ai/leaderboard/text',
  },
  // WebDev ratings are spread wider than text ratings. With a gap of 450
  // about 70% of that board sits above the zero point, the same share that
  // a gap of 300 leaves on the text board (measured on 2026-11-11).
  arena_webdev: {
    source: 'arena',
    mapping: 'arena_webdev',
    weight: 0.2,
    floor: { type: 'below_frontier', gap: 450 },
    url: 'https://arena.ai/leaderboard/webdev',
  },
} satisfies Record<string, MetricConfig>;

export type MetricKey = keyof typeof metrics;
export const METRIC_KEYS = Object.keys(metrics) as MetricKey[];

export const scoringConfig: ScoringConfig = {
  intelligence: {
    metrics,
    tiers: { top: 90, high: 75, mid: 55 },
  },
  cost: {
    // Agents and chats that resend a long context hit the cache far more
    // often than one-off calls do; half is a middle ground between the two.
    cacheHitRate: 0.5,
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
    tokenUseExponent: 1,
    tokenUseReferenceSize: 50,
    tiers: { top: 70, high: 60, mid: 50 },
  },
};

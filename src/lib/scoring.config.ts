/**
 * Every tunable number of the rating algorithm lives here: weights,
 * normalisation parameters and tier thresholds. See docs/SPEC.md §5.
 *
 * After changing anything, run `pnpm test` and `pnpm report`.
 */

/** Snapshot file (data/snapshots/<source>.json) a metric is read from. */
export type BenchmarkSource = 'aa' | 'arena' | 'terminal_bench' | 'livebench';

/** The field under `sources` in a model file that names the model for a metric. */
export type MappingField = 'aa' | 'arena_text' | 'arena_webdev' | 'terminal_bench' | 'livebench';

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
  /**
   * Relative weight inside its group, re-normalised over the metrics of the
   * group a model actually has. For a metric without a group it is the
   * weight inside the benchmark score.
   */
  weight: number;
  /**
   * What the metric measures. Metrics of one group are averaged first and
   * the groups are averaged after, so a subject with many leaderboards
   * does not outweigh one with few. A metric without a group counts as a
   * group of its own.
   */
  group?: string;
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
    /** Relative weight of each metric group inside the benchmark score. */
    groups?: Record<string, { weight: number }>;
    /** Benchmark metrics that feed the intelligence score, keyed by metric. */
    metrics: Record<string, MetricConfig>;
    /** Minimum (rounded) score for each tier, checked top-down; anything lower is `low`. */
    tiers: { top: number; high: number; mid: number };
  };
  cost: {
    /**
     * Token mix of the blended price, as relative weights:
     *   blended = (cacheReadWeight × cache_read + inputWeight × input + outputWeight × output)
     *             ÷ (cacheReadWeight + inputWeight + outputWeight)
     * A model without a cache-read price pays the input price for cached
     * tokens too. Cache-write surcharges are not counted.
     */
    cacheReadWeight: number;
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
     * How far value trusts what a model cost to run over its price list.
     * Artificial Analysis publishes the cost of running its Intelligence
     * Index on each model. Divided by typical token use (the median, over
     * the models listed on the site, of run cost ÷ blended price) it becomes
     * a price per 1M tokens, the measured price. Value is computed from
     *   blended^(1 − runCostWeight) × measured^runCostWeight
     * so 1 uses the measured price alone and 0 ignores it. A model without
     * a run cost is rated on its blended price.
     */
    runCostWeight: number;
    /** Minimum (rounded) score for each tier; anything lower is `low`. */
    tiers: { top: number; high: number; mid: number };
  };
}

/**
 * What the leaderboards measure. The groups count the same, and so do the
 * metrics inside a group: general ability (broad test suites), preference
 * (which answer people pick in blind votes) and coding.
 */
const groups = {
  general: { weight: 1 },
  preference: { weight: 1 },
  coding: { weight: 1 },
} satisfies Record<string, { weight: number }>;

export type MetricGroup = keyof typeof groups;
export const METRIC_GROUPS = Object.keys(groups) as MetricGroup[];

/**
 * The leaderboard metrics in use. To add one: add it here, make its source's
 * adapter write it to the snapshot (scripts/sources/), and add its label to
 * the dictionaries in src/i18n/.
 *
 * Coding ability is measured by Arena's WebDev board and Terminal-Bench.
 * Artificial Analysis also has a Coding Index, but its free API does not
 * return it.
 */
const metrics = {
  aa_intelligence: {
    source: 'aa',
    mapping: 'aa',
    group: 'general',
    weight: 1,
    floor: { type: 'absolute', value: 0 },
  },
  // LiveBench's overall score: the weighted mean of its suites.
  livebench: {
    source: 'livebench',
    mapping: 'livebench',
    group: 'general',
    weight: 1,
    floor: { type: 'absolute', value: 0 },
    url: 'https://livebench.ai/',
  },
  arena_text: {
    source: 'arena',
    mapping: 'arena_text',
    group: 'preference',
    weight: 1,
    floor: { type: 'below_frontier', gap: 300 },
    url: 'https://arena.ai/leaderboard/text',
  },
  // WebDev ratings are spread wider than text ratings. With a gap of 450
  // about 70% of that board sits above the zero point, the same share that
  // a gap of 300 leaves on the text board (measured on 2026-11-11).
  arena_webdev: {
    source: 'arena',
    mapping: 'arena_webdev',
    group: 'coding',
    weight: 1,
    floor: { type: 'below_frontier', gap: 450 },
    url: 'https://arena.ai/leaderboard/webdev',
  },
  // Share of terminal tasks resolved. A row is a model inside an agent tool.
  terminal_bench: {
    source: 'terminal_bench',
    mapping: 'terminal_bench',
    group: 'coding',
    weight: 1,
    floor: { type: 'absolute', value: 0 },
    url: 'https://www.tbench.ai/',
  },
} satisfies Record<string, MetricConfig & { group: MetricGroup }>;

export type MetricKey = keyof typeof metrics;
export const METRIC_KEYS = Object.keys(metrics) as MetricKey[];
/** The group of a metric in use. */
export const metricGroup = (key: MetricKey): MetricGroup => metrics[key].group;

export const scoringConfig: ScoringConfig = {
  intelligence: {
    groups,
    metrics,
    tiers: { top: 90, high: 75, mid: 55 },
  },
  cost: {
    // 7 : 2 : 1 is Artificial Analysis's default blend (artificialanalysis.ai/
    // methodology, checked 2026-11-11): about 78% of input tokens are cache
    // hits and input outweighs output 9 to 1. Real use is mostly agents and
    // long chats that resend their context; on OpenRouter, agent traffic ran
    // just under 90% cached in September 2026.
    cacheReadWeight: 7,
    inputWeight: 2,
    outputWeight: 1,
    // A typical price list (output 5× input, cache reads 10% of input) blends
    // to about 0.385× what a plain 3:1 input:output blend gives. The index
    // bounds and tiers were scaled by that factor when the blend changed, so
    // they mean what they meant before.
    indexFloorPrice: 0.04,
    indexCeilPrice: 12,
    tiers: { low: 0.4, mid: 2, high: 6 },
  },
  value: {
    intelligenceExponent: 0.6,
    affordabilityExponent: 0.4,
    minAffordability: 5,
    runCostWeight: 1,
    tiers: { top: 70, high: 60, mid: 50 },
  },
};

/**
 * What the changelog and the RSS feeds report (src/lib/changelog.ts). Tier
 * changes, price changes, new leaders and models added or removed are always
 * listed. A score that moves without changing tier is listed once it has
 * drifted at least `scoreDelta` points from the last score reported for it,
 * so small daily leaderboard moves add up instead of being lost or spamming
 * the feed.
 */
export const changelogConfig = {
  scoreDelta: 3,
};

export type ChangelogConfig = typeof changelogConfig;

/**
 * Every tunable number of the rating algorithm lives here: weights,
 * normalisation parameters and tier thresholds. See docs/SPEC.md §5.
 *
 * After changing anything, run `pnpm test` and `pnpm report`.
 */

/** Snapshot file (data/snapshots/<source>.json) a metric is read from. */
export type BenchmarkSource = 'aa' | 'arena' | 'livebench';

/** The field under `sources` in the model list that names the model for a metric. */
export type MappingField = 'aa' | 'arena_text' | 'arena_webdev' | 'arena_agent' | 'livebench';

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
   * Relative weight inside the benchmark score, re-normalised over the
   * metrics a model actually has.
   */
  weight: number;
  floor: FloorRule;
  /** Public page of the leaderboard, linked from the model page. */
  url?: string;
}

export const INTELLIGENCE_TIERS = ['top', 'high', 'mid', 'low', 'very_low'] as const;
export const COST_TIERS = ['very_low', 'low', 'mid', 'high', 'very_high'] as const;
export const VALUE_TIERS = ['top', 'high', 'mid', 'low', 'very_low'] as const;
export type IntelligenceTier = (typeof INTELLIGENCE_TIERS)[number];
export type CostTier = (typeof COST_TIERS)[number];
export type ValueTier = (typeof VALUE_TIERS)[number];

export interface ScoringConfig {
  intelligence: {
    /** Benchmark metrics that feed the intelligence score, keyed by metric. */
    metrics: Record<string, MetricConfig>;
    /** Minimum (rounded) score for each tier, checked top-down; anything lower is `very_low`. */
    tiers: { top: number; high: number; mid: number; low: number };
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
    tiers: { very_low: number; low: number; mid: number; high: number };
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
    /** Minimum (rounded) score for each tier; anything lower is `very_low`. */
    tiers: { top: number; high: number; mid: number; low: number };
  };
}

/**
 * LiveBench's categories, with LiveBench's own weights (`_overall_weights`
 * in its categories.json; a category it does not list weighs 1), checked
 * against release 20261106 on 2026-11-11.
 *
 * The categories the AA Intelligence Index already tests are dropped, so
 * the same kind of task is not counted twice: Coding (bug fixes in a real
 * repository, as in FrontierCode) and Long Agentic (long-running coding
 * work, as in Terminal-Bench). The LiveBench score is the weighted mean of
 * the kept categories, and LiveBench counts for the share of its overall
 * weight they carry.
 *
 * The adapter stops if LiveBench's categories or weights stop matching
 * this list, so a new category is sorted into one side by hand.
 */
export const livebenchCategories = {
  kept: { Reasoning: 1, 'Data Analysis': 1, Research: 1, Browser: 1, Design: 1.5 },
  dropped: { Coding: 1.5, 'Long Agentic': 2 },
} satisfies Record<'kept' | 'dropped', Record<string, number>>;

const sum = (weights: Record<string, number>) =>
  Object.values(weights).reduce((total, weight) => total + weight, 0);

/** Share of LiveBench's overall weight the kept categories carry (5.5 of 9). */
export const livebenchKeptShare =
  sum(livebenchCategories.kept) /
  (sum(livebenchCategories.kept) + sum(livebenchCategories.dropped));

/**
 * The leaderboard metrics in use. To add one: add it here, make its source's
 * adapter write it to the snapshot (scripts/sources/), and add its label to
 * the dictionaries in src/i18n/.
 *
 * Each leaderboard counts once. A leaderboard the AA Intelligence Index
 * already contains is not used (Terminal-Bench, FrontierCode), and one
 * that overlaps with it in part counts only for the part that does not
 * (LiveBench, see `livebenchCategories`).
 */
const metrics = {
  aa_intelligence: {
    source: 'aa',
    mapping: 'aa',
    weight: 1,
    floor: { type: 'absolute', value: 0 },
  },
  arena_text: {
    source: 'arena',
    mapping: 'arena_text',
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
    weight: 1,
    floor: { type: 'below_frontier', gap: 450 },
    url: 'https://arena.ai/leaderboard/webdev',
  },
  // How a model does on real agent sessions rather than in votes: an IPS
  // score, about −0.25 to 0.2 with 0 near the middle. A gap of 0.25 leaves
  // about 70% of the board above the zero point (measured on 2026-11-11).
  arena_agent: {
    source: 'arena',
    mapping: 'arena_agent',
    weight: 1,
    floor: { type: 'below_frontier', gap: 0.25 },
    url: 'https://arena.ai/leaderboard/agent',
  },
  // The weighted mean of the categories AA does not already test. Those
  // scores sit close together (most models between 60 and 87), so counting
  // from 0 would put nearly every model in the 70s to 90s. Like the Arena
  // boards it uses a range below the leader instead: a gap of 17 leaves
  // about 70% of the board above the zero point (measured on 2026-11-11).
  livebench: {
    source: 'livebench',
    mapping: 'livebench',
    weight: livebenchKeptShare,
    floor: { type: 'below_frontier', gap: 17 },
    url: 'https://livebench.ai/',
  },
} satisfies Record<string, MetricConfig>;

export type MetricKey = keyof typeof metrics;
export const METRIC_KEYS = Object.keys(metrics) as MetricKey[];

export const scoringConfig: ScoringConfig = {
  intelligence: {
    metrics,
    // Each line sits in a gap between the listed models, at least a point from
    // the nearest, so a small daily move does not flip a tier; hence 87 and 74
    // rather than multiples of 5. The 31 models then split 3 / 5 / 4 / 13 / 6
    // (set on 2026-11-11, after the list became generated).
    tiers: { top: 87, high: 74, mid: 55, low: 38 },
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
    // bounds were scaled by that factor when the blend changed, so they mean
    // what they meant before.
    indexFloorPrice: 0.04,
    indexCeilPrice: 12,
    // Each step is 2 to 4 times the last, and each line is at least 10% from
    // the nearest listed model's price. The 31 models then split
    // 5 / 7 / 4 / 9 / 6 (set on 2026-11-11, after the list became generated).
    tiers: { very_low: 0.13, low: 0.48, mid: 1, high: 2 },
  },
  value: {
    intelligenceExponent: 0.6,
    affordabilityExponent: 0.4,
    minAffordability: 5,
    runCostWeight: 1,
    // Value spreads less than intelligence (it is a geometric mean with the
    // price), and 15 models sit between 45 and 54 with no gap of two points, so
    // no line can go through them: the 31 models split 2 / 3 / 15 / 10 / 1.
    // Each line is at least a point from the nearest listed model (set on
    // 2026-11-11, after the list became generated).
    tiers: { top: 65, high: 57, mid: 44, low: 34 },
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
  /**
   * Whether `pnpm sync` and `pnpm history` record the day's ratings in
   * data/history.jsonl. Off until the site is published: the scoring is still
   * being tuned, and a changelog of that tuning would mean nothing. Turn it on
   * at launch; the first recorded day becomes the baseline.
   */
  recordHistory: false,
};

export type ChangelogConfig = typeof changelogConfig;

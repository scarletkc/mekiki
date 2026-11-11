export type BenchmarkSource = 'aa' | 'arena' | 'livebench';

export type MappingField = 'aa' | 'arena_text' | 'arena_webdev' | 'arena_agent' | 'livebench';

export type FloorRule =
  | { type: 'absolute'; value: number }
  | { type: 'below_frontier'; gap: number };

export interface MetricConfig {
  source: BenchmarkSource;
  mapping: MappingField;
  weight: number;
  floor: FloorRule;
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
    metrics: Record<string, MetricConfig>;
    tiers: { top: number; high: number; mid: number; low: number };
  };
  cost: {
    cacheReadWeight: number;
    inputWeight: number;
    outputWeight: number;
    indexFloorPrice: number;
    indexCeilPrice: number;
    tiers: { very_low: number; low: number; mid: number; high: number };
  };
  value: {
    intelligenceExponent: number;
    affordabilityExponent: number;
    minAffordability: number;
    runCostWeight: number;
    tiers: { top: number; high: number; mid: number; low: number };
  };
}

export const livebenchCategories = {
  kept: { Reasoning: 1, 'Data Analysis': 1, Research: 1, Browser: 1, Design: 1.5 },
  dropped: { Coding: 1.5, 'Long Agentic': 2 },
} satisfies Record<'kept' | 'dropped', Record<string, number>>;

const sum = (weights: Record<string, number>) =>
  Object.values(weights).reduce((total, weight) => total + weight, 0);

export const livebenchKeptShare =
  sum(livebenchCategories.kept) /
  (sum(livebenchCategories.kept) + sum(livebenchCategories.dropped));

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
  arena_webdev: {
    source: 'arena',
    mapping: 'arena_webdev',
    weight: 1,
    floor: { type: 'below_frontier', gap: 450 },
    url: 'https://arena.ai/leaderboard/webdev',
  },
  arena_agent: {
    source: 'arena',
    mapping: 'arena_agent',
    weight: 1,
    floor: { type: 'below_frontier', gap: 0.25 },
    url: 'https://arena.ai/leaderboard/agent',
  },
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
    tiers: { top: 87, high: 74, mid: 55, low: 38 },
  },
  cost: {
    cacheReadWeight: 7,
    inputWeight: 2,
    outputWeight: 1,
    indexFloorPrice: 0.04,
    indexCeilPrice: 12,
    tiers: { very_low: 0.13, low: 0.48, mid: 1, high: 2 },
  },
  value: {
    intelligenceExponent: 0.6,
    affordabilityExponent: 0.4,
    minAffordability: 5,
    runCostWeight: 1,
    tiers: { top: 65, high: 57, mid: 44, low: 34 },
  },
};

export const changelogConfig = {
  scoreDelta: 3,
  recordHistory: true,
};

export type ChangelogConfig = typeof changelogConfig;

export const highlightConfig = {
  burnerRatio: 1.5,
  frugalRatio: 0.75,
  sleeperRank: 15,
};

export type HighlightConfig = typeof highlightConfig;

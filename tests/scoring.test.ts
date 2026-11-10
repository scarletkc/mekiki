import { describe, expect, it } from 'vitest';
import {
  blendedPrice,
  computeBenchmark,
  computeIntelligence,
  computeValue,
  costIndex,
  costTier,
  effectiveInputPrice,
  intelligenceTier,
  normalizeMetric,
  rateModel,
  valueTier,
  type RatingInput,
} from '@/lib/scoring';
import { METRIC_KEYS, scoringConfig, type ScoringConfig } from '@/lib/scoring.config';

/** Fictional leaderboard tops used by the fixtures in docs/SPEC.md §6.5. */
const frontier = { aa_intelligence: 70, aa_coding: 62, arena_text: 1500 };

/**
 * The metric set the fixtures in docs/SPEC.md §6.5 were computed with: two
 * index-style metrics and one Elo-style metric. The fixtures pin the
 * algorithm, so they use this reference set and not whatever the live
 * config in scoring.config.ts currently lists.
 */
const specConfig: ScoringConfig = {
  ...scoringConfig,
  intelligence: {
    ...scoringConfig.intelligence,
    benchmarkWeight: 0.6,
    subjectiveWeight: 0.4,
    metrics: {
      aa_intelligence: {
        source: 'aa',
        mapping: 'aa',
        weight: 0.5,
        floor: { type: 'absolute', value: 0 },
      },
      aa_coding: {
        source: 'aa',
        mapping: 'aa',
        weight: 0.2,
        floor: { type: 'absolute', value: 0 },
      },
      arena_text: {
        source: 'arena',
        mapping: 'arena_text',
        weight: 0.3,
        floor: { type: 'below_frontier', gap: 300 },
      },
    },
    tiers: { top: 90, high: 75, mid: 55 },
  },
  cost: {
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
    tiers: { top: 70, high: 60, mid: 50 },
  },
};

interface Fixture {
  name: string;
  input: RatingInput;
  expected: {
    benchmark: number | null;
    intelligence: number;
    intelligenceTier: string;
    basis: string;
    blended: number;
    costTier: string;
    costIndex: number;
    value: number;
    valueTier: string;
  };
}

// The table from docs/SPEC.md §6.5, verbatim. Tolerance ±0.1.
const fixtures: Fixture[] = [
  {
    name: 'A flagship',
    input: {
      metrics: { aa_intelligence: 68, aa_coding: 60, arena_text: 1490 },
      frontier,
      subjective: 95,
      price: { input: 5, output: 25 },
    },
    expected: {
      benchmark: 96.9,
      intelligence: 96.2,
      intelligenceTier: 'top',
      basis: 'both',
      blended: 10,
      costTier: 'high',
      costIndex: 80.7,
      value: 50.5,
      valueTier: 'mid',
    },
  },
  {
    name: 'B balanced',
    input: {
      metrics: { aa_intelligence: 60, aa_coding: 52, arena_text: 1450 },
      frontier,
      subjective: 85,
      price: { input: 1.25, output: 10 },
    },
    expected: {
      benchmark: 84.6,
      intelligence: 84.8,
      intelligenceTier: 'high',
      basis: 'both',
      blended: 3.4375,
      costTier: 'mid',
      costIndex: 62.0,
      value: 61.5,
      valueTier: 'high',
    },
  },
  {
    name: 'C cheap and good',
    input: {
      metrics: { aa_intelligence: 50, aa_coding: 40, arena_text: 1400 },
      frontier,
      subjective: 70,
      price: { input: 0.3, output: 2.5 },
    },
    expected: {
      benchmark: 68.6,
      intelligence: 69.2,
      intelligenceTier: 'mid',
      basis: 'both',
      blended: 0.85,
      costTier: 'low',
      costIndex: 37.5,
      value: 66.4,
      valueTier: 'high',
    },
  },
  {
    name: 'D ultra cheap',
    input: {
      metrics: { aa_intelligence: 30, aa_coding: 22, arena_text: 1300 },
      frontier,
      subjective: 40,
      price: { input: 0.05, output: 0.2 },
    },
    expected: {
      benchmark: 38.5,
      intelligence: 39.1,
      intelligenceTier: 'low',
      basis: 'both',
      blended: 0.0875,
      costTier: 'low',
      costIndex: 0,
      value: 56.9,
      valueTier: 'mid',
    },
  },
  {
    name: 'E subjective only',
    input: {
      metrics: {},
      frontier,
      subjective: 80,
      price: { input: 3, output: 15 },
    },
    expected: {
      benchmark: null,
      intelligence: 80.0,
      intelligenceTier: 'high',
      basis: 'subjective_only',
      blended: 6,
      costTier: 'high',
      costIndex: 71.8,
      value: 52.7,
      valueTier: 'mid',
    },
  },
  {
    name: 'F no coding index, no subjective score',
    input: {
      metrics: { aa_intelligence: 56, aa_coding: null, arena_text: 1430 },
      frontier,
      subjective: null,
      price: { input: 2, output: 8 },
    },
    expected: {
      benchmark: 78.8,
      intelligence: 78.8,
      intelligenceTier: 'high',
      basis: 'benchmark_only',
      blended: 3.5,
      costTier: 'mid',
      costIndex: 62.3,
      value: 58.6,
      valueTier: 'mid',
    },
  },
  {
    name: 'G balanced, with a cache price',
    input: {
      metrics: { aa_intelligence: 60, aa_coding: 52, arena_text: 1450 },
      frontier,
      subjective: 85,
      price: { input: 1.25, output: 10, cache_read: 0.125 },
    },
    expected: {
      benchmark: 84.6,
      intelligence: 84.8,
      intelligenceTier: 'high',
      basis: 'both',
      blended: 3.015625,
      costTier: 'mid',
      costIndex: 59.7,
      value: 63.0,
      valueTier: 'high',
    },
  },
];

const TOLERANCE = 0.1;
function near(actual: number | null, expected: number) {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(TOLERANCE + 1e-9);
}

describe('SPEC §6.5 fixtures', () => {
  for (const { name, input, expected } of fixtures) {
    it(name, () => {
      const rating = rateModel(input, specConfig);

      if (expected.benchmark === null) expect(rating.intelligence.benchmark).toBeNull();
      else near(rating.intelligence.benchmark, expected.benchmark);

      near(rating.intelligence.score, expected.intelligence);
      expect(rating.intelligence.tier).toBe(expected.intelligenceTier);
      expect(rating.intelligence.basis).toBe(expected.basis);

      expect(rating.cost.blended).toBeCloseTo(expected.blended, 6);
      expect(rating.cost.tier).toBe(expected.costTier);
      near(rating.cost.index, expected.costIndex);

      near(rating.value.score, expected.value);
      expect(rating.value.tier).toBe(expected.valueTier);
    });
  }
});

describe('normalizeMetric', () => {
  it('scales index metrics from 0 to the frontier', () => {
    expect(normalizeMetric(35, 70, { type: 'absolute', value: 0 })).toBe(50);
    expect(normalizeMetric(70, 70, { type: 'absolute', value: 0 })).toBe(100);
  });

  it('scales Elo metrics over a fixed gap below the frontier', () => {
    const floor = { type: 'below_frontier', gap: 300 } as const;
    expect(normalizeMetric(1500, 1500, floor)).toBe(100);
    expect(normalizeMetric(1350, 1500, floor)).toBe(50);
    expect(normalizeMetric(1200, 1500, floor)).toBe(0);
  });

  it('clamps to 0–100', () => {
    expect(normalizeMetric(900, 1500, { type: 'below_frontier', gap: 300 })).toBe(0);
    expect(normalizeMetric(80, 70, { type: 'absolute', value: 0 })).toBe(100);
    expect(normalizeMetric(-5, 70, { type: 'absolute', value: 0 })).toBe(0);
  });

  it('returns null for a degenerate scale', () => {
    expect(normalizeMetric(10, 0, { type: 'absolute', value: 0 })).toBeNull();
    expect(normalizeMetric(10, 5, { type: 'absolute', value: 5 })).toBeNull();
  });
});

describe('computeBenchmark', () => {
  it('re-normalises weights over the metrics that have a score', () => {
    const { score } = computeBenchmark({ arena_text: 1350 }, frontier, specConfig);
    expect(score).toBe(50);
  });

  it('skips a metric whose frontier is missing', () => {
    const withCoding = computeBenchmark(
      { aa_intelligence: 56, aa_coding: 40, arena_text: 1430 },
      { aa_intelligence: 70, aa_coding: null, arena_text: 1500 },
      specConfig,
    );
    const withoutCoding = computeBenchmark(
      { aa_intelligence: 56, arena_text: 1430 },
      frontier,
      specConfig,
    );
    expect(withCoding.score).toBeCloseTo(withoutCoding.score as number, 9);
    expect(withCoding.breakdown.aa_coding).toEqual({
      raw: 40,
      normalized: null,
      weight: 0.2,
      frontier: null,
    });
  });

  it('ignores scores for metrics that are not in the config', () => {
    const { score, breakdown } = computeBenchmark(
      { made_up: 99, arena_text: 1350 },
      { made_up: 100, arena_text: 1500 },
    );
    expect(score).toBe(50);
    expect(breakdown.made_up).toBeUndefined();
  });

  it('returns null when no metric has a score', () => {
    expect(computeBenchmark({}, frontier).score).toBeNull();
    expect(computeBenchmark({ aa_intelligence: null }, frontier).score).toBeNull();
    expect(computeBenchmark({ aa_intelligence: 50 }, {}).score).toBeNull();
  });

  it('always reports every configured metric in the breakdown', () => {
    const { breakdown } = computeBenchmark({}, {});
    expect(Object.keys(breakdown).sort()).toEqual([...METRIC_KEYS].sort());
    expect(Object.keys(computeBenchmark({}, {}, specConfig).breakdown).sort()).toEqual([
      'aa_coding',
      'aa_intelligence',
      'arena_text',
    ]);
    expect(breakdown.arena_text.raw).toBeNull();
    expect(breakdown.arena_text.normalized).toBeNull();
  });
});

describe('computeIntelligence', () => {
  it('reports how the score was derived', () => {
    expect(computeIntelligence(80, 90)).toEqual({ score: 84, basis: 'both' });
    expect(computeIntelligence(80, null)).toEqual({ score: 80, basis: 'benchmark_only' });
    expect(computeIntelligence(null, 90)).toEqual({ score: 90, basis: 'subjective_only' });
    expect(computeIntelligence(null, null)).toEqual({ score: null, basis: 'none' });
  });

  it('treats a subjective score of 0 as a real score', () => {
    expect(computeIntelligence(null, 0)).toEqual({ score: 0, basis: 'subjective_only' });
  });
});

describe('cost', () => {
  it('blends input and output 3:1', () => {
    expect(blendedPrice(5, 25)).toBe(10);
    expect(blendedPrice(0, 0)).toBe(0);
  });

  it('bills the assumed cache hits at the cache-read price', () => {
    expect(effectiveInputPrice(5, 0.5, specConfig)).toBe(2.75);
    // A cache price of 0 is a real price, not a missing one.
    expect(effectiveInputPrice(5, 0, specConfig)).toBe(2.5);
  });

  it('charges the full input price when the cache price is unknown', () => {
    expect(effectiveInputPrice(5, null, specConfig)).toBe(5);
    expect(effectiveInputPrice(5, undefined, specConfig)).toBe(5);
  });

  it('never lets a cache price above the input price raise the cost', () => {
    expect(effectiveInputPrice(1, 2, specConfig)).toBe(1);
  });

  it('reproduces the cache-free price at a hit rate of 0', () => {
    const noCache: ScoringConfig = { ...specConfig, cost: { ...specConfig.cost, cacheHitRate: 0 } };
    const input: RatingInput = {
      metrics: {},
      frontier,
      subjective: null,
      price: { input: 5, output: 25, cache_read: 0.5 },
    };
    expect(rateModel(input, noCache).cost).toMatchObject({
      blended: 10,
      index: 80.7,
      tier: 'high',
    });
  });

  it('maps the blended price to a log-scaled index', () => {
    expect(costIndex(0)).toBe(0);
    expect(costIndex(0.1)).toBe(0);
    expect(costIndex(30)).toBeCloseTo(100, 9);
    expect(costIndex(300)).toBe(100);
    expect(costIndex(Math.sqrt(3))).toBeCloseTo(50, 9);
  });

  it('assigns tiers by absolute blended price', () => {
    expect(costTier(0)).toBe('low');
    expect(costTier(0.99)).toBe('low');
    expect(costTier(1)).toBe('mid');
    expect(costTier(4.99)).toBe('mid');
    expect(costTier(5)).toBe('high');
    expect(costTier(14.99)).toBe('high');
    expect(costTier(15)).toBe('very_high');
  });
});

describe('tiers', () => {
  it('intelligence thresholds are inclusive', () => {
    expect(intelligenceTier(90)).toBe('top');
    expect(intelligenceTier(89.9)).toBe('high');
    expect(intelligenceTier(75)).toBe('high');
    expect(intelligenceTier(55)).toBe('mid');
    expect(intelligenceTier(54.9)).toBe('low');
  });

  it('value thresholds are inclusive', () => {
    expect(valueTier(70)).toBe('top');
    expect(valueTier(60)).toBe('high');
    expect(valueTier(50)).toBe('mid');
    expect(valueTier(49.9)).toBe('low');
  });
});

describe('computeValue', () => {
  it('never lets affordability drop below the configured minimum', () => {
    expect(computeValue(100, 100)).toBeCloseTo(Math.pow(100, 0.6) * Math.pow(5, 0.4), 9);
    expect(computeValue(100, 99)).toBeCloseTo(computeValue(100, 100), 9);
  });

  it('is 100 for a frontier model that costs nothing', () => {
    expect(computeValue(100, 0)).toBeCloseTo(100, 9);
  });
});

describe('rateModel edge cases', () => {
  it('leaves everything null when there is no data at all', () => {
    const rating = rateModel({ metrics: {}, frontier: {}, subjective: null, price: null });
    expect(rating.intelligence.score).toBeNull();
    expect(rating.intelligence.tier).toBeNull();
    expect(rating.intelligence.basis).toBe('none');
    expect(rating.cost).toEqual({
      tier: null,
      index: null,
      blended: null,
      input: null,
      output: null,
      cache_read: null,
      free: false,
    });
    expect(rating.value).toEqual({ score: null, tier: null });
  });

  it('rates cost without intelligence, but not value', () => {
    const rating = rateModel({
      metrics: {},
      frontier,
      subjective: null,
      price: { input: 2, output: 10, cache_read: 0.1 },
    });
    expect(rating.cost.tier).toBe('mid');
    expect(rating.cost.cache_read).toBe(0.1);
    expect(rating.value.score).toBeNull();
  });

  it('rates intelligence without a price, but not cost or value', () => {
    const rating = rateModel({ metrics: {}, frontier, subjective: 70, price: null });
    expect(rating.intelligence.score).toBe(70);
    expect(rating.cost.tier).toBeNull();
    expect(rating.value.score).toBeNull();
  });

  it('marks a zero price as free with cost index 0', () => {
    const rating = rateModel({
      metrics: {},
      frontier,
      subjective: 60,
      price: { input: 0, output: 0 },
    });
    expect(rating.cost.free).toBe(true);
    expect(rating.cost.index).toBe(0);
    expect(rating.cost.tier).toBe('low');
    expect(rating.value.score).toBeCloseTo(Math.pow(60, 0.6) * Math.pow(100, 0.4), 1);
  });

  it('derives the tier from the rounded score', () => {
    // 0.6 × 89.9 + 0.4 × 90.1 = 89.98, shown as 90.0, so the tier must be `top`.
    const rating = rateModel({
      metrics: { aa_intelligence: 62.93 },
      frontier: { aa_intelligence: 70 },
      subjective: 90.1,
      price: null,
    });
    expect(rating.intelligence.score).toBe(90);
    expect(rating.intelligence.tier).toBe('top');
  });

  it('honours a custom config', () => {
    const config = structuredClone(scoringConfig);
    config.intelligence.benchmarkWeight = 1;
    config.intelligence.subjectiveWeight = 1;
    const rating = rateModel(
      {
        metrics: { aa_intelligence: 35 },
        frontier: { aa_intelligence: 70 },
        subjective: 100,
        price: null,
      },
      config,
    );
    expect(rating.intelligence.score).toBe(75);
  });
});

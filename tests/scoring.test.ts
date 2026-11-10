import { describe, expect, it } from 'vitest';
import {
  blendedPrice,
  cacheHitPercent,
  cacheReadPrice,
  computeBenchmark,
  computeValue,
  costIndex,
  costTier,
  effectivePrice,
  intelligenceTier,
  normalizeMetric,
  rateModel,
  valueTier,
  type RatingInput,
} from '@/lib/scoring';
import { METRIC_KEYS, scoringConfig, type ScoringConfig } from '@/lib/scoring.config';

/** Fictional leaderboard tops used by the fixtures in docs/SPEC.md §5.5. */
const frontier = { aa_intelligence: 70, aa_coding: 62, arena_text: 1500 };

/**
 * The metric set the fixtures in docs/SPEC.md §5.5 were computed with: two
 * index-style metrics and one Elo-style metric. The fixtures pin the
 * algorithm, so they use this reference set and not whatever the live
 * config in scoring.config.ts currently lists.
 */
const specConfig: ScoringConfig = {
  ...scoringConfig,
  intelligence: {
    ...scoringConfig.intelligence,
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
    cacheReadWeight: 7,
    inputWeight: 2,
    outputWeight: 1,
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

interface Fixture {
  name: string;
  input: RatingInput;
  expected: {
    intelligence: number | null;
    intelligenceTier: string | null;
    blended: number;
    costTier: string;
    costIndex: number;
    value: number | null;
    valueTier: string | null;
  };
}

// The table from docs/SPEC.md §5.5, verbatim. Tolerance ±0.1.
const fixtures: Fixture[] = [
  {
    name: 'A flagship',
    input: {
      metrics: { aa_intelligence: 68, aa_coding: 60, arena_text: 1490 },
      frontier,
      price: { input: 5, output: 25, cache_read: 0.5 },
    },
    expected: {
      intelligence: 96.9,
      intelligenceTier: 'top',
      blended: 3.85,
      costTier: 'high',
      costIndex: 80.1,
      value: 51.5,
      valueTier: 'mid',
    },
  },
  {
    name: 'B balanced',
    input: {
      metrics: { aa_intelligence: 60, aa_coding: 52, arena_text: 1450 },
      frontier,
      price: { input: 1.25, output: 10, cache_read: 0.125 },
    },
    expected: {
      intelligence: 84.6,
      intelligenceTier: 'high',
      blended: 1.3375,
      costTier: 'mid',
      costIndex: 61.5,
      value: 61.7,
      valueTier: 'high',
    },
  },
  {
    name: 'C cheap and good',
    input: {
      metrics: { aa_intelligence: 50, aa_coding: 40, arena_text: 1400 },
      frontier,
      price: { input: 0.3, output: 2.5, cache_read: 0.03 },
    },
    expected: {
      intelligence: 68.6,
      intelligenceTier: 'mid',
      blended: 0.331,
      costTier: 'low',
      costIndex: 37.0,
      value: 66.3,
      valueTier: 'high',
    },
  },
  {
    name: 'D ultra cheap',
    input: {
      metrics: { aa_intelligence: 30, aa_coding: 22, arena_text: 1300 },
      frontier,
      price: { input: 0.05, output: 0.2, cache_read: 0.005 },
    },
    expected: {
      intelligence: 38.5,
      intelligenceTier: 'low',
      blended: 0.0335,
      costTier: 'low',
      costIndex: 0,
      value: 56.4,
      valueTier: 'mid',
    },
  },
  {
    name: 'E on no leaderboard',
    input: {
      metrics: {},
      frontier,
      price: { input: 3, output: 15, cache_read: 0.3 },
    },
    expected: {
      intelligence: null,
      intelligenceTier: null,
      blended: 2.31,
      costTier: 'high',
      costIndex: 71.1,
      value: null,
      valueTier: null,
    },
  },
  {
    name: 'F no coding index, no cache price',
    input: {
      metrics: { aa_intelligence: 56, aa_coding: null, arena_text: 1430 },
      frontier,
      price: { input: 2, output: 8 },
    },
    expected: {
      intelligence: 78.8,
      intelligenceTier: 'high',
      blended: 2.6,
      costTier: 'high',
      costIndex: 73.2,
      value: 51.2,
      valueTier: 'mid',
    },
  },
];

const TOLERANCE = 0.1;
function near(actual: number | null, expected: number) {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(TOLERANCE + 1e-9);
}

describe('SPEC §5.5 fixtures', () => {
  for (const { name, input, expected } of fixtures) {
    it(name, () => {
      const rating = rateModel(input, specConfig);

      if (expected.intelligence === null) expect(rating.intelligence.score).toBeNull();
      else near(rating.intelligence.score, expected.intelligence);
      expect(rating.intelligence.tier).toBe(expected.intelligenceTier);

      expect(rating.cost.blended).toBeCloseTo(expected.blended, 6);
      expect(rating.cost.tier).toBe(expected.costTier);
      near(rating.cost.index, expected.costIndex);

      if (expected.value === null) expect(rating.value.score).toBeNull();
      else near(rating.value.score, expected.value);
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

describe('cost', () => {
  it('blends cache reads, input and output 7:2:1', () => {
    expect(blendedPrice({ input: 5, output: 25, cache_read: 0.5 }, specConfig)).toBeCloseTo(
      3.85,
      9,
    );
    expect(blendedPrice({ input: 0, output: 0 }, specConfig)).toBe(0);
  });

  it('equals a 9:1 input:output blend with 7 in 9 input tokens cached', () => {
    const hit = 7 / 9;
    const effectiveInput = hit * 0.2 + (1 - hit) * 2;
    expect(blendedPrice({ input: 2, output: 10, cache_read: 0.2 }, specConfig)).toBeCloseTo(
      (9 * effectiveInput + 10) / 10,
      9,
    );
    expect(cacheHitPercent(specConfig.cost)).toBe(78);
  });

  it('treats a cache price of 0 as a real price', () => {
    expect(blendedPrice({ input: 5, output: 25, cache_read: 0 }, specConfig)).toBeCloseTo(3.5, 9);
  });

  it('charges the input price for cached tokens when the cache price is unknown', () => {
    expect(cacheReadPrice(5, null)).toBe(5);
    expect(cacheReadPrice(5, undefined)).toBe(5);
    expect(blendedPrice({ input: 2, output: 8 }, specConfig)).toBeCloseTo(2.6, 9);
  });

  it('never lets a cache price above the input price raise the cost', () => {
    expect(cacheReadPrice(1, 2)).toBe(1);
  });

  it('maps the blended price to a log-scaled index', () => {
    expect(costIndex(0, specConfig)).toBe(0);
    expect(costIndex(0.04, specConfig)).toBe(0);
    expect(costIndex(12, specConfig)).toBeCloseTo(100, 9);
    expect(costIndex(120, specConfig)).toBe(100);
    expect(costIndex(Math.sqrt(0.04 * 12), specConfig)).toBeCloseTo(50, 9);
  });

  it('assigns tiers by absolute blended price', () => {
    expect(costTier(0, specConfig)).toBe('low');
    expect(costTier(0.39, specConfig)).toBe('low');
    expect(costTier(0.4, specConfig)).toBe('mid');
    expect(costTier(1.99, specConfig)).toBe('mid');
    expect(costTier(2, specConfig)).toBe('high');
    expect(costTier(5.99, specConfig)).toBe('high');
    expect(costTier(6, specConfig)).toBe('very_high');
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
    expect(computeValue(100, 100)).toBeCloseTo(100 ** 0.6 * 5 ** 0.4, 9);
    expect(computeValue(100, 99)).toBeCloseTo(computeValue(100, 100), 9);
  });

  it('is 100 for a frontier model that costs nothing', () => {
    expect(computeValue(100, 0)).toBeCloseTo(100, 9);
  });
});

describe('metric groups', () => {
  const zero = { type: 'absolute', value: 0 } as const;
  const metric = (group: string) =>
    ({ source: 'aa', mapping: 'aa', group, weight: 1, floor: zero }) as const;
  const grouped = (weights: { wide: number; narrow: number }): ScoringConfig => ({
    ...specConfig,
    intelligence: {
      groups: { wide: { weight: weights.wide }, narrow: { weight: weights.narrow } },
      metrics: { first: metric('wide'), second: metric('wide'), third: metric('narrow') },
      tiers: { top: 90, high: 75, mid: 55 },
    },
  });
  const equal = grouped({ wide: 1, narrow: 1 });
  const tops = { first: 100, second: 100, third: 100 };

  it('averages inside a group before averaging the groups', () => {
    // A flat mean of 100, 0 and 100 would be 66.7.
    const { score } = computeBenchmark({ first: 100, second: 0, third: 100 }, tops, equal);
    expect(score).toBe(75);
  });

  it('scores a group on the metrics a model has', () => {
    expect(computeBenchmark({ first: 80, third: 40 }, tops, equal).score).toBe(60);
  });

  it('leaves out a group that has no score', () => {
    expect(computeBenchmark({ first: 80, second: 60 }, tops, equal).score).toBe(70);
    expect(computeBenchmark({}, tops, equal).score).toBeNull();
  });

  it('honours the group weights', () => {
    const { score } = computeBenchmark(
      { first: 100, third: 0 },
      tops,
      grouped({ wide: 3, narrow: 1 }),
    );
    expect(score).toBe(75);
  });

  it("reports each metric's share of the whole", () => {
    const { breakdown } = computeBenchmark({}, tops, equal);
    expect(breakdown.first?.weight).toBe(0.25);
    expect(breakdown.second?.weight).toBe(0.25);
    expect(breakdown.third?.weight).toBe(0.5);
  });

  it('treats a metric without a group as a group of its own', () => {
    // The reference config is flat: shares are its weights.
    const { breakdown } = computeBenchmark({}, frontier, specConfig);
    expect(breakdown.aa_intelligence?.weight).toBe(0.5);
    expect(breakdown.aa_coding?.weight).toBe(0.2);
    expect(breakdown.arena_text?.weight).toBe(0.3);
  });
});

describe('effectivePrice', () => {
  it('takes a measured price over the blended list price', () => {
    expect(effectivePrice(4, 1, specConfig)).toEqual({ price: 1, basis: 'run_cost' });
    expect(effectivePrice(0.2, 3, specConfig)).toEqual({ price: 3, basis: 'run_cost' });
  });

  it('keeps the blended price when nothing usable was measured', () => {
    for (const measured of [null, undefined, 0, -1, Number.NaN]) {
      expect(effectivePrice(4, measured, specConfig)).toEqual({ price: 4, basis: 'list_price' });
    }
  });

  it('blends the two geometrically by runCostWeight', () => {
    const half: ScoringConfig = {
      ...specConfig,
      value: { ...specConfig.value, runCostWeight: 0.5 },
    };
    expect(effectivePrice(4, 1, half).price).toBeCloseTo(2, 9);
    const off: ScoringConfig = { ...specConfig, value: { ...specConfig.value, runCostWeight: 0 } };
    expect(effectivePrice(4, 1, off)).toEqual({ price: 4, basis: 'list_price' });
  });

  it('moves value but leaves the cost rating alone', () => {
    const input: RatingInput = {
      metrics: { aa_intelligence: 56 },
      frontier,
      price: { input: 2, output: 8 },
    };
    const listed = rateModel(input, specConfig);
    const measured = rateModel({ ...input, measuredPrice: 0.26 }, specConfig);
    expect(measured.cost).toEqual(listed.cost);
    expect(listed.value).toMatchObject({
      cost_basis: 'list_price',
      effective_price: 2.6,
      cost_index: 73.2,
    });
    // A tenth of the price is 100 ÷ log10(300) = 40.4 index points lower.
    expect(measured.value).toMatchObject({
      cost_basis: 'run_cost',
      effective_price: 0.26,
      cost_index: 32.8,
    });
    expect(measured.value.score).toBeGreaterThan(listed.value.score as number);
  });
});

describe('rateModel edge cases', () => {
  it('leaves everything null when there is no data at all', () => {
    const rating = rateModel({ metrics: {}, frontier: {}, price: null });
    expect(rating.intelligence.score).toBeNull();
    expect(rating.intelligence.tier).toBeNull();
    expect(rating.cost).toEqual({
      tier: null,
      index: null,
      blended: null,
      input: null,
      output: null,
      cache_read: null,
      free: false,
    });
    expect(rating.value).toEqual({
      score: null,
      tier: null,
      cost_basis: null,
      effective_price: null,
      cost_index: null,
    });
  });

  it('rates cost without intelligence, but not value', () => {
    const rating = rateModel({
      metrics: {},
      frontier,
      price: { input: 2, output: 10, cache_read: 0.1 },
    });
    expect(rating.cost.tier).toBe('mid');
    expect(rating.cost.cache_read).toBe(0.1);
    expect(rating.value.score).toBeNull();
  });

  it('rates intelligence without a price, but not cost or value', () => {
    const rating = rateModel({ metrics: { aa_intelligence: 49 }, frontier, price: null });
    expect(rating.intelligence.score).toBe(70);
    expect(rating.cost.tier).toBeNull();
    expect(rating.value.score).toBeNull();
  });

  it('marks a zero price as free with cost index 0', () => {
    const rating = rateModel({
      metrics: { aa_intelligence: 42 },
      frontier,
      price: { input: 0, output: 0 },
    });
    expect(rating.cost.free).toBe(true);
    expect(rating.cost.index).toBe(0);
    expect(rating.cost.tier).toBe('low');
    expect(rating.value.score).toBeCloseTo(60 ** 0.6 * 100 ** 0.4, 1);
  });

  it('derives the tier from the rounded score', () => {
    // 62.97 / 70 = 89.96, shown as 90.0, so the tier must be `top`.
    const rating = rateModel({
      metrics: { aa_intelligence: 62.97 },
      frontier: { aa_intelligence: 70 },
      price: null,
    });
    expect(rating.intelligence.score).toBe(90);
    expect(rating.intelligence.tier).toBe('top');
  });

  it('honours a custom config', () => {
    const config = structuredClone(scoringConfig);
    config.intelligence.tiers = { top: 50, high: 40, mid: 30 };
    const rating = rateModel(
      { metrics: { aa_intelligence: 35 }, frontier: { aa_intelligence: 70 }, price: null },
      config,
    );
    expect(rating.intelligence.score).toBe(50);
    expect(rating.intelligence.tier).toBe('top');
  });
});

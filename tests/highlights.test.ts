import { describe, expect, it } from 'vitest';
import { LOCALES, useTranslations } from '@/i18n';
import type { Dataset, ModelRecord } from '@/lib/dataset';
import { buildHighlights } from '@/lib/highlights';
import {
  highlightConfig,
  scoringConfig,
  type HighlightConfig,
  type ScoringConfig,
} from '@/lib/scoring.config';
import { getDataset } from '@/lib/site-data';

const refConfig: ScoringConfig = {
  ...scoringConfig,
  intelligence: {
    ...scoringConfig.intelligence,
    tiers: { top: 87, high: 74, mid: 55, low: 38 },
  },
  value: {
    ...scoringConfig.value,
    tiers: { top: 65, high: 57, mid: 44, low: 34 },
  },
};

const refThresholds: HighlightConfig = {
  ...highlightConfig,
  burnerRatio: 1.5,
  frugalRatio: 0.75,
  sleeperRank: 15,
};

function makeModel(
  id: string,
  overrides: {
    name?: string;
    vendor?: string;
    status?: 'active' | 'legacy';
    intScore?: number | null;
    intTier?: ModelRecord['rating']['intelligence']['tier'];
    blended?: number | null;
    free?: boolean;
    valScore?: number | null;
    valTier?: ModelRecord['rating']['value']['tier'];
    costBasis?: ModelRecord['rating']['value']['cost_basis'];
    effectivePrice?: number | null;
    indexCostUsd?: number | null;
    rank?: number | null;
  } = {},
): ModelRecord {
  const blended = overrides.blended === undefined ? 1 : overrides.blended;
  const effectivePrice =
    overrides.effectivePrice === undefined ? blended : overrides.effectivePrice;
  return {
    id,
    name: overrides.name ?? id,
    vendor: overrides.vendor ?? 'Vendor',
    status: overrides.status ?? 'active',
    rating: {
      intelligence: {
        score: overrides.intScore === undefined ? 80 : overrides.intScore,
        tier: overrides.intTier === undefined ? 'high' : overrides.intTier,
        breakdown: {},
      },
      cost: {
        tier: 'mid',
        index: 50,
        blended,
        input: blended,
        output: blended,
        cache_read: blended,
        free: overrides.free ?? false,
      },
      value: {
        score: overrides.valScore === undefined ? 55 : overrides.valScore,
        tier: overrides.valTier === undefined ? 'mid' : overrides.valTier,
        cost_basis: overrides.costBasis ?? 'run_cost',
        effective_price: effectivePrice,
        cost_index: 50,
      },
    },
    price_source: 'modelsdev',
    facts: {
      context: 128000,
      release_date: '2026-09-01',
      open_weights: false,
      modalities: null,
      index_cost_usd: overrides.indexCostUsd === undefined ? 1000 : overrides.indexCostUsd,
    },
    source_ids: {
      modelsdev: id,
      aa: id,
      arena_text: null,
      arena_webdev: null,
      arena_agent: null,
      livebench: null,
    },
    matched: { modelsdev: true, aa: true, arena: true, livebench: false },
    openrouter:
      overrides.rank === undefined
        ? null
        : { permaslug: id, tokens: 1_000_000, days: 7, rank: overrides.rank },
    url: `https://mekiki.fog.moe/m/${id}`,
  };
}

function makeDataset(models: ModelRecord[], withOpenrouter = true): Dataset {
  return {
    generated_at: '2026-11-11T00:00:00.000Z',
    sources: {
      modelsdev: {
        name: 'models.dev',
        url: 'https://models.dev',
        license: null,
        fetched_at: '2026-11-11T00:00:00.000Z',
        edition: null,
        as_of: null,
      },
      aa: {
        name: 'Artificial Analysis',
        url: 'https://artificialanalysis.ai/',
        license: null,
        fetched_at: '2026-11-11T00:00:00.000Z',
        edition: null,
        as_of: null,
      },
      arena: {
        name: 'Arena',
        url: 'https://arena.ai/leaderboard',
        license: 'CC BY 4.0',
        fetched_at: '2026-11-11T00:00:00.000Z',
        edition: null,
        as_of: null,
      },
      livebench: {
        name: 'LiveBench',
        url: 'https://livebench.ai/',
        license: null,
        fetched_at: '2026-11-11T00:00:00.000Z',
        edition: null,
        as_of: null,
      },
      openrouter: {
        name: 'OpenRouter',
        url: 'https://openrouter.ai/rankings',
        license: 'CC BY 4.0',
        fetched_at: withOpenrouter ? '2026-11-11T00:00:00.000Z' : null,
        edition: withOpenrouter ? '2026-11-04/2026-11-10' : null,
        as_of: withOpenrouter ? '2026-11-11T00:00:00.000Z' : null,
      },
    },
    frontier: {
      aa_intelligence: 60,
      arena_text: 1500,
      arena_webdev: 1800,
      arena_agent: 0.2,
      livebench: 85,
    },
    floor: {
      aa_intelligence: null,
      arena_text: null,
      arena_webdev: null,
      arena_agent: -0.05,
      livebench: null,
    },
    run_cost: { typical_token_use: 2500, models: models.length },
    models,
  };
}

describe('buildHighlights', () => {
  it('picks distinct active models across all four archetypes and ignores legacy models', () => {
    const models = [
      makeModel('v/legacy-god', {
        name: 'Legacy God',
        status: 'legacy',
        intScore: 100,
        intTier: 'top',
      }),
      makeModel('v/crown', {
        name: 'Crown',
        intScore: 100,
        intTier: 'top',
        blended: 6,
        effectivePrice: 9,
        valScore: 30,
        valTier: 'very_low',
        indexCostUsd: 22191.4,
        rank: 5,
      }),
      makeModel('v/slayer', {
        name: 'Slayer',
        intScore: 80,
        intTier: 'high',
        blended: 1.5,
        effectivePrice: 0.45,
        valScore: 70,
        valTier: 'top',
        rank: 8,
      }),
      makeModel('v/burner', {
        name: 'Burner',
        intScore: 45,
        intTier: 'low',
        blended: 0.5,
        effectivePrice: 2.0,
        valScore: 37,
        valTier: 'low',
        rank: 12,
      }),
      makeModel('v/sleeper', {
        name: 'Sleeper',
        intScore: 73,
        intTier: 'mid',
        blended: 0.8,
        effectivePrice: 0.4,
        valScore: 67,
        valTier: 'top',
        rank: 29,
      }),
    ];

    const cards = buildHighlights(makeDataset(models), useTranslations('en'), {
      config: refConfig,
      thresholds: refThresholds,
    });

    expect(cards.map((card) => card.kind)).toEqual(['frontier', 'value', 'burner', 'sleeper']);
    expect(cards.map((card) => card.model.id)).toEqual([
      'v/crown',
      'v/slayer',
      'v/burner',
      'v/sleeper',
    ]);
    expect(cards[0]!.contrast).toContain('$22,191');
    expect(cards[1]!.contrast).toContain('80%');
    expect(cards[1]!.contrast).toContain('20×');
    expect(cards[2]!.stat.value).toBe('4.0×');
    expect(cards[3]!.contrast).toContain('#29');
  });

  it('falls back to frugal token saver when OpenRouter rankings are unavailable', () => {
    const models = [
      makeModel('v/crown', {
        name: 'Crown',
        intScore: 100,
        intTier: 'top',
        blended: 5,
        effectivePrice: 6,
        valScore: 35,
        valTier: 'low',
      }),
      makeModel('v/slayer', {
        name: 'Slayer',
        intScore: 78,
        intTier: 'high',
        blended: 1.5,
        effectivePrice: 0.5,
        valScore: 68,
        valTier: 'top',
      }),
      makeModel('v/burner', {
        name: 'Burner',
        intScore: 50,
        intTier: 'low',
        blended: 0.6,
        effectivePrice: 1.8,
        valScore: 40,
        valTier: 'low',
      }),
      makeModel('v/frugal', {
        name: 'Frugal',
        intScore: 60,
        intTier: 'mid',
        blended: 1.0,
        effectivePrice: 0.5,
        valScore: 62,
        valTier: 'high',
      }),
    ];

    const cards = buildHighlights(makeDataset(models, false), useTranslations('en'), {
      config: refConfig,
      thresholds: refThresholds,
    });

    expect(cards.map((card) => card.kind)).toEqual(['frontier', 'value', 'burner', 'frugal']);
    expect(cards[3]!.model.id).toBe('v/frugal');
    expect(cards[3]!.stat.value).toBe('−50%');
  });

  it.each(LOCALES)(
    'builds clean, unique spotlight cards on the live dataset in %s',
    async (locale) => {
      const dataset = await getDataset();
      const cards = buildHighlights(dataset, useTranslations(locale));
      expect(cards.length).toBeGreaterThan(0);
      const ids = cards.map((card) => card.model.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const card of cards) {
        const model = dataset.models.find((item) => item.id === card.model.id);
        expect(model?.status).toBe('active');
        expect(card.contrast).not.toMatch(/\b(null|undefined|NaN)\b/);
        expect(card.stat.value).not.toMatch(/\b(null|undefined|NaN)\b/);
      }
    },
  );
});

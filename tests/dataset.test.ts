import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readModelEntries } from '../scripts/lib/content';
import { toApiFull, toApiIndex, toApiModel } from '@/lib/api';
import { buildDataset, latestSync } from '@/lib/dataset';
import { DEFAULT_LOCALE, localePath, stripLocale } from '@/i18n';
import { parseModelEntry } from '@/lib/model-list';
import type { ModelEntry } from '@/lib/model-schema';
import { METRIC_KEYS, scoringConfig, type ScoringConfig } from '@/lib/scoring.config';
import type { Snapshots } from '@/lib/snapshots';

const NOW = new Date('2026-11-11T00:00:00Z');

const config: ScoringConfig = {
  ...scoringConfig,
  intelligence: {
    metrics: {
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
      },
      arena_webdev: {
        source: 'arena',
        mapping: 'arena_webdev',
        weight: 0.2,
        floor: { type: 'below_frontier', gap: 300 },
      },
    },
    tiers: { top: 90, high: 75, mid: 55, low: 40 },
  },
  cost: {
    cacheReadWeight: 7,
    inputWeight: 2,
    outputWeight: 1,
    indexFloorPrice: 0.04,
    indexCeilPrice: 12,
    tiers: { very_low: 0.1, low: 0.4, mid: 2, high: 6 },
  },
  value: {
    intelligenceExponent: 0.6,
    affordabilityExponent: 0.4,
    minAffordability: 5,
    runCostWeight: 1,
    tiers: { top: 70, high: 60, mid: 50, low: 40 },
  },
};

function entry(id: string, yaml: string): ModelEntry {
  return parseModelEntry(id, parseYaml(yaml));
}

const snapshots: Snapshots = {
  modelsdev: {
    source: 'modelsdev',
    fetched_at: '2026-11-10T00:00:00.000Z',
    frontier: {},
    models: {
      'acme/flagship': {
        name: 'Flagship',
        input: 5,
        output: 25,
        cache_read: 0.5,
        context: 1000000,
        release_date: '2026-09-01',
        open_weights: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      'acme/free': {
        name: 'Free',
        input: 0,
        output: 0,
        cache_read: null,
        context: 200000,
        release_date: null,
        open_weights: true,
        modalities: null,
      },
    },
  },
  aa: {
    source: 'aa',
    fetched_at: '2026-11-09T00:00:00.000Z',
    frontier: { aa_intelligence: 70 },
    models: {
      flagship: {
        name: 'Flagship',
        aa_intelligence: 68,
        index_cost_usd: 123.4,
      },
    },
  },
  arena: {
    source: 'arena',
    fetched_at: '2026-11-10T12:00:00.000Z',
    frontier: { arena_text: 1500, arena_webdev: 1800 },
    models: {
      'Flagship (High)': {
        arena_text: 1490,
        arena_webdev: null,
        arena_agent: null,
        published: '2026-11-09',
      },
      'Flagship (Max)': {
        arena_text: null,
        arena_webdev: 1790,
        arena_agent: null,
        published: '2026-11-09',
      },
    },
  },
  livebench: null,
};

const flagship = entry(
  'acme/flagship',
  [
    'name: Flagship',
    'vendor: Acme',
    'sources:',
    '  aa: flagship',
    '  arena_text: Flagship (High)',
    '  arena_webdev: "Flagship (Max)"',
  ].join('\n'),
);

const blank = entry(
  'acme/unknown-1.5',
  [
    'name: Unknown 1.5',
    'vendor: Acme',
    'status: legacy',
    'sources:',
    '  modelsdev:',
    '  aa:',
    '  arena_text:',
    '  arena_webdev:',
    'overrides:',
  ].join('\n'),
);

describe('model entries', () => {
  it('treats empty values as not filled in', () => {
    expect(blank.data.sources).toEqual({});
    expect(blank.data.overrides).toEqual({});
  });

  it('reads every mapping field', () => {
    expect(flagship.data.sources).toEqual({
      aa: 'flagship',
      arena_text: 'Flagship (High)',
      arena_webdev: 'Flagship (Max)',
    });
  });

  it('ignores the subjective score and text reviews, which the site no longer has', () => {
    const old = entry(
      'a/b',
      'name: B\nvendor: A\nsubjective:\n  score: 70\n  verdict: Great\n  pros: [fast]\nreviewed_at: 2026-11-01',
    );
    expect(Object.keys(old.data).sort()).toEqual([
      'name',
      'overrides',
      'sources',
      'status',
      'vendor',
    ]);
  });

  it('rejects an invalid model with its ID in the message', () => {
    expect(() => entry('a/b', 'name: B')).toThrow(/a\/b/);
    expect(() => entry('a/b', 'name: B\nvendor: A\nstatus: retired')).toThrow();
  });

  it('the model list is valid', () => {
    const entries = readModelEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length);
  });
});

describe('buildDataset', () => {
  const dataset = buildDataset([blank, flagship], snapshots, { now: NOW, config });
  const [first, second] = dataset.models;

  it('rates a fully mapped model from every leaderboard', () => {
    expect(first?.id).toBe('acme/flagship');
    expect(first?.rating.intelligence).toMatchObject({ score: 96.9, tier: 'top' });
    expect(first?.rating.intelligence.breakdown).toEqual({
      aa_intelligence: { raw: 68, normalized: 97.1, weight: 0.5, frontier: 70 },
      arena_text: { raw: 1490, normalized: 96.7, weight: 0.3, frontier: 1500 },
      arena_webdev: { raw: 1790, normalized: 96.7, weight: 0.2, frontier: 1800 },
    });
    expect(first?.rating.cost).toMatchObject({
      blended: 3.85,
      tier: 'high',
      index: 80.1,
      cache_read: 0.5,
    });
    expect(first?.rating.value).toMatchObject({
      score: 51.5,
      tier: 'mid',
      cost_basis: 'run_cost',
      cost_index: 80.1,
    });
    expect(first?.rating.value.effective_price).toBeCloseTo(3.85, 9);
    expect(first?.facts).toMatchObject({
      context: 1000000,
      open_weights: false,
      index_cost_usd: 123.4,
    });
    expect(first?.price_source).toBe('modelsdev');
    expect(first?.source_ids).toEqual({
      modelsdev: 'acme/flagship',
      aa: 'flagship',
      arena_text: 'Flagship (High)',
      arena_webdev: 'Flagship (Max)',
      arena_agent: null,
      livebench: null,
    });
    expect(first?.matched).toEqual({
      modelsdev: true,
      aa: true,
      arena: true,
      livebench: false,
    });
    expect(first?.url).toBe('https://mekiki.fog.moe/m/acme/flagship');
  });

  it('rates a model that is on one leaderboard only', () => {
    const webdevOnly = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\nsources:\n  arena_webdev: "Flagship (Max)"',
    );
    const [model] = buildDataset([webdevOnly], snapshots, { now: NOW, config }).models;
    expect(model?.rating.intelligence).toMatchObject({ score: 96.7, tier: 'top' });
    expect(model?.matched).toMatchObject({ modelsdev: true, aa: false, arena: true });
  });

  it('counts what a model costs to run in its value, not in its cost rating', () => {
    const frugal = entry(
      'acme/frugal',
      'name: Frugal\nvendor: Acme\nsources:\n  modelsdev: acme/flagship\n  aa: frugal\n  arena_webdev: "Flagship (Max)"',
    );
    const withFrugal: Snapshots = {
      ...snapshots,
      aa: {
        ...snapshots.aa!,
        models: {
          ...snapshots.aa!.models,
          frugal: { name: 'Frugal', aa_intelligence: 68, index_cost_usd: 12.34 },
        },
      },
    };
    const built = buildDataset([flagship, frugal], withFrugal, { now: NOW, config });
    const costly = built.models.find((model) => model.id === 'acme/flagship')!;
    const cheap = built.models.find((model) => model.id === 'acme/frugal')!;

    expect(built.run_cost.models).toBe(2);
    expect(built.run_cost.typical_token_use).toBeCloseTo((123.4 + 12.34) / 2 / 3.85, 9);
    expect(cheap.rating.cost).toEqual(costly.rating.cost);
    expect(cheap.rating.value.effective_price).toBeCloseTo((3.85 * 2) / 11, 9);
    expect(costly.rating.value.effective_price).toBeCloseTo((3.85 * 20) / 11, 9);
    expect(cheap.rating.value).toMatchObject({ cost_basis: 'run_cost', cost_index: 50.2 });
    expect(costly.rating.value).toMatchObject({ cost_basis: 'run_cost', cost_index: 90.6 });
    expect(cheap.rating.value.score).toBeGreaterThan(costly.rating.value.score as number);
  });

  it('falls back to the blended price when there is no run cost', () => {
    const unmeasured = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\nsources:\n  arena_webdev: "Flagship (Max)"',
    );
    const built = buildDataset([unmeasured], snapshots, { now: NOW, config });
    expect(built.run_cost).toEqual({ typical_token_use: null, models: 0 });
    expect(built.models[0]?.rating.value).toMatchObject({
      cost_basis: 'list_price',
      effective_price: 3.85,
      cost_index: 80.1,
    });
  });

  it('reads LiveBench next to the other boards at its own weight', () => {
    const zero = { type: 'absolute', value: 0 } as const;
    const gap = { type: 'below_frontier', gap: 300 } as const;
    const withLivebench: ScoringConfig = {
      ...config,
      intelligence: {
        metrics: {
          aa_intelligence: { source: 'aa', mapping: 'aa', weight: 1, floor: zero },
          arena_text: { source: 'arena', mapping: 'arena_text', weight: 1, floor: gap },
          arena_webdev: { source: 'arena', mapping: 'arena_webdev', weight: 1, floor: gap },
          livebench: { source: 'livebench', mapping: 'livebench', weight: 0.5, floor: zero },
        },
        tiers: { top: 90, high: 75, mid: 55, low: 40 },
      },
    };
    const withBoard: Snapshots = {
      ...snapshots,
      livebench: {
        source: 'livebench',
        fetched_at: '2026-11-10T00:00:00.000Z',
        edition: '2026-11-06',
        frontier: { livebench: 80 },
        models: { flagship: { livebench: 72 } },
      },
    };
    const mapped = [
      'name: Flagship',
      'vendor: Acme',
      'sources:',
      '  aa: flagship',
      '  arena_text: Flagship (High)',
      '  arena_webdev: "Flagship (Max)"',
    ];
    const everywhere = entry('acme/flagship', [...mapped, '  livebench: flagship'].join('\n'));
    const noLivebench = entry('acme/flagship', mapped.join('\n'));

    const built = buildDataset([everywhere], withBoard, { now: NOW, config: withLivebench });
    const [model] = built.models;
    expect(model?.rating.intelligence.score).toBe(95.9);
    expect(model?.rating.intelligence.breakdown).toMatchObject({
      aa_intelligence: { normalized: 97.1, weight: 0.2857 },
      arena_text: { normalized: 96.7, weight: 0.2857 },
      arena_webdev: { normalized: 96.7, weight: 0.2857 },
      livebench: { raw: 72, normalized: 90, weight: 0.1429, frontier: 80 },
    });
    expect(model?.matched.livebench).toBe(true);
    expect(model?.source_ids.livebench).toBe('flagship');
    expect(built.sources.livebench.edition).toBe('2026-11-06');
    expect(built.sources.aa.edition).toBeNull();

    const [partial] = buildDataset([noLivebench], withBoard, {
      now: NOW,
      config: withLivebench,
    }).models;
    expect(partial?.rating.intelligence.score).toBe(96.8);
    expect(partial?.matched.livebench).toBe(false);
  });

  it('does not read a rating from the wrong board', () => {
    const wrongBoard = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\nsources:\n  arena_text: "Flagship (Max)"',
    );
    const [model] = buildDataset([wrongBoard], snapshots, { now: NOW, config }).models;
    expect(model?.rating.intelligence.score).toBeNull();
  });

  it('sorts unrated models last and leaves their numbers null, never 0', () => {
    expect(second?.id).toBe('acme/unknown-1.5');
    expect(second?.rating.intelligence).toMatchObject({ score: null, tier: null });
    expect(second?.rating.cost).toMatchObject({
      tier: null,
      index: null,
      blended: null,
      free: false,
    });
    expect(second?.rating.value).toEqual({
      score: null,
      tier: null,
      cost_basis: null,
      effective_price: null,
      cost_index: null,
    });
    expect(second?.matched).toEqual({
      modelsdev: false,
      aa: false,
      arena: false,
      livebench: false,
    });
    expect(second?.price_source).toBeNull();
  });

  it('prefers a price override', () => {
    const overridden = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\noverrides:\n  price: { input: 1, output: 2 }',
    );
    const [model] = buildDataset([overridden], snapshots, { now: NOW, config }).models;
    expect(model?.rating.cost).toMatchObject({
      input: 1,
      output: 2,
      blended: 0.75,
      cache_read: 0.5,
    });
    expect(model?.price_source).toBe('override');
  });

  it('marks a zero price as free', () => {
    const free = entry('acme/free', 'name: Free\nvendor: Acme');
    const [model] = buildDataset([free], snapshots, { now: NOW, config }).models;
    expect(model?.rating.cost).toMatchObject({ free: true, index: 0, tier: 'very_low' });
  });

  it.each(['modelsdev', 'aa', 'arena'] as const)(
    'still builds without the %s snapshot',
    (source) => {
      const partial = buildDataset(
        [flagship],
        { ...snapshots, [source]: null },
        { now: NOW, config },
      );
      expect(partial.sources[source].fetched_at).toBeNull();
      const [model] = partial.models;
      expect(model?.matched[source]).toBe(false);
      if (source === 'modelsdev') {
        expect(model?.rating.cost.tier).toBeNull();
        expect(model?.rating.value.score).toBeNull();
        expect(model?.rating.intelligence.score).not.toBeNull();
      } else {
        expect(model?.rating.intelligence.score).not.toBeNull();
        expect(model?.rating.cost.tier).toBe('high');
      }
    },
  );

  it('builds with no snapshots at all', () => {
    const empty = buildDataset(
      [flagship, blank],
      { modelsdev: null, aa: null, arena: null, livebench: null },
      { now: NOW, config },
    );
    expect(empty.models.map((model) => model.rating.intelligence.score)).toEqual([null, null]);
    expect(empty.frontier).toEqual({
      aa_intelligence: null,
      livebench: null,
      arena_text: null,
      arena_webdev: null,
      arena_agent: null,
    });
    expect(latestSync(empty)).toBeNull();
  });

  it('reports the most recent sync and the frontier of every metric', () => {
    expect(latestSync(dataset)).toBe('2026-11-10T12:00:00.000Z');
    expect(dataset.frontier).toMatchObject({
      aa_intelligence: 70,
      arena_text: 1500,
      arena_webdev: 1800,
    });
  });
});

describe('scoring config', () => {
  it('reads every metric from a snapshot the model files can map to', () => {
    const everything = entry(
      'a/b',
      'name: B\nvendor: A\nsources:\n  aa: x\n  arena_text: x\n  arena_webdev: x\n  arena_agent: x\n  livebench: x',
    );
    const mappings = Object.keys(everything.data.sources);
    for (const key of METRIC_KEYS) {
      expect(mappings).toContain(scoringConfig.intelligence.metrics[key].mapping);
    }
  });
});

describe('JSON API', () => {
  const dataset = buildDataset([blank, flagship], snapshots, { now: NOW, config });
  const full = toApiFull(dataset);

  it('matches the documented shape', () => {
    expect(full.version).toBe(1);
    expect(full.generated_at).toBe('2026-11-11T00:00:00.000Z');
    expect(full.sources.aa).toEqual({
      name: 'Artificial Analysis',
      url: 'https://artificialanalysis.ai/',
      fetched_at: '2026-11-09T00:00:00.000Z',
    });
    expect(full.models[0]).toEqual({
      id: 'acme/flagship',
      name: 'Flagship',
      vendor: 'Acme',
      status: 'active',
      intelligence: {
        score: 96.9,
        tier: 'top',
        label: 'Top',
        labels: { 'zh-CN': '最高', 'zh-TW': '最高', en: 'Top' },
        breakdown: {
          aa_intelligence: { raw: 68, normalized: 97.1, weight: 0.5 },
          arena_text: { raw: 1490, normalized: 96.7, weight: 0.3 },
          arena_webdev: { raw: 1790, normalized: 96.7, weight: 0.2 },
          arena_agent: { raw: null, normalized: null, weight: 0 },
          livebench: { raw: null, normalized: null, weight: 0 },
        },
      },
      cost: {
        tier: 'high',
        label: 'High',
        labels: { 'zh-CN': '高', 'zh-TW': '高', en: 'High' },
        index: 80.1,
        blended: 3.85,
        input: 5,
        output: 25,
        cache_read: 0.5,
      },
      value: {
        score: 51.5,
        tier: 'mid',
        label: 'Mid',
        labels: { 'zh-CN': '中', 'zh-TW': '中', en: 'Mid' },
        cost_basis: 'run_cost',
        run_cost: 123.4,
        effective_price: 3.85,
        cost_index: 80.1,
      },
      url: 'https://mekiki.fog.moe/m/acme/flagship',
    });
  });

  it('uses null for missing values and never drops a field', () => {
    const unrated = toApiModel(dataset.models[1]!);
    const roundTripped = JSON.parse(JSON.stringify(unrated));
    expect(roundTripped).toEqual(unrated);
    expect(Object.keys(roundTripped)).toEqual(Object.keys(full.models[0]!));
    expect(Object.keys(roundTripped.intelligence)).toEqual(
      Object.keys(full.models[0]!.intelligence),
    );
    expect(Object.keys(roundTripped.cost)).toEqual(Object.keys(full.models[0]!.cost));
    expect(Object.keys(roundTripped.value)).toEqual(Object.keys(full.models[0]!.value));
    expect(roundTripped.intelligence.score).toBeNull();
    expect(roundTripped.intelligence.breakdown.arena_webdev).toEqual({
      raw: null,
      normalized: null,
      weight: 0.2,
    });
    expect(roundTripped.cost.blended).toBeNull();
    expect(roundTripped.value.label).toBeNull();
  });

  it('carries no text-review fields', () => {
    for (const model of full.models) {
      expect(model).not.toHaveProperty('verdict');
      expect(model).not.toHaveProperty('best_for');
      expect(model).not.toHaveProperty('reviewed_at');
    }
  });

  it('lists every model in the index', () => {
    expect(toApiIndex(dataset)).toEqual([
      { id: 'acme/flagship', name: 'Flagship', vendor: 'Acme', status: 'active' },
      { id: 'acme/unknown-1.5', name: 'Unknown 1.5', vendor: 'Acme', status: 'legacy' },
    ]);
  });
});

describe('locale paths', () => {
  it('prefixes every locale, including the default', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(localePath('en')).toBe('/en/');
    expect(localePath('zh-cn')).toBe('/zh-cn/');
    expect(localePath('zh-cn', '/method')).toBe('/zh-cn/method/');
    expect(localePath('zh-tw', 'api')).toBe('/zh-tw/api/');
    expect(localePath('en', '/m/openai/gpt-6.1-sol/')).toBe('/en/m/openai/gpt-6.1-sol/');
    expect(localePath('zh-cn', '/m/openai/gpt-6.1-sol')).toBe('/zh-cn/m/openai/gpt-6.1-sol/');
  });

  it('never localises files', () => {
    expect(localePath('en', '/api.json')).toBe('/api.json');
    expect(localePath('zh-tw', '/api/models/openai/gpt-6.1-sol.json')).toBe(
      '/api/models/openai/gpt-6.1-sol.json',
    );
  });

  it('strips the prefix again', () => {
    expect(stripLocale('/en/method/')).toBe('/method/');
    expect(stripLocale('/zh-tw')).toBe('/');
    expect(stripLocale('/zh-cn/api/')).toBe('/api/');
    expect(stripLocale('/m/x/y/')).toBe('/m/x/y/');
    expect(stripLocale('/english/')).toBe('/english/');
  });
});

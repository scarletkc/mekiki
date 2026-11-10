import { describe, expect, it } from 'vitest';
import { parseModelFile, readModelEntries } from '../scripts/lib/content';
import { toApiFull, toApiIndex, toApiModel } from '@/lib/api';
import { buildDataset, latestSync } from '@/lib/dataset';
import { DEFAULT_LOCALE, localePath, stripLocale } from '@/i18n';
import { modelIdFromPath, type ModelEntry } from '@/lib/model-schema';
import { METRIC_KEYS, scoringConfig, type ScoringConfig } from '@/lib/scoring.config';
import type { Snapshots } from '@/lib/snapshots';

const NOW = new Date('2026-11-11T00:00:00Z');

// A fixed copy of the config, so these expectations do not move when the
// live weights and gaps in scoring.config.ts are tuned.
const config: ScoringConfig = {
  ...scoringConfig,
  intelligence: {
    benchmarkWeight: 0.6,
    subjectiveWeight: 0.4,
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
    tokenUseExponent: 1,
    tokenUseReferenceSize: 50,
    tiers: { top: 70, high: 60, mid: 50 },
  },
};

function entry(id: string, frontmatter: string, body = ''): ModelEntry {
  return parseModelFile(`---\n${frontmatter}\n---\n${body}`, `${id}.md`);
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
        index_token_use: null,
      },
    },
  },
  // The same model is listed under different names on the two Arena boards.
  arena: {
    source: 'arena',
    fetched_at: '2026-11-10T12:00:00.000Z',
    frontier: { arena_text: 1500, arena_webdev: 1800 },
    models: {
      'Flagship (High)': { arena_text: 1490, arena_webdev: null, published: '2026-11-09' },
      'Flagship (Max)': { arena_text: null, arena_webdev: 1790, published: '2026-11-09' },
    },
  },
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
    'subjective:',
    '  score: 95',
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
    'subjective:',
    '  score:',
    'overrides:',
  ].join('\n'),
);

describe('model files', () => {
  it('keeps dots and upper case in the ID', () => {
    expect(modelIdFromPath('openai/gpt-6.1-sol.md')).toBe('openai/gpt-6.1-sol');
    expect(modelIdFromPath('minimax\\MiniMax-M3.1-Flash.md')).toBe('minimax/MiniMax-M3.1-Flash');
  });

  it('treats empty YAML values as not filled in', () => {
    expect(blank.data.subjective).toEqual({});
    expect(blank.data.sources).toEqual({});
    expect(blank.data.overrides).toEqual({});
  });

  it('reads every mapping field', () => {
    expect(flagship.data.sources).toEqual({
      aa: 'flagship',
      arena_text: 'Flagship (High)',
      arena_webdev: 'Flagship (Max)',
    });
    expect(flagship.data.subjective).toEqual({ score: 95 });
  });

  it('ignores text-review fields, which the site no longer has', () => {
    const old = entry(
      'a/b',
      'name: B\nvendor: A\nsubjective:\n  score: 70\n  verdict: Great\n  pros: [fast]\nreviewed_at: 2026-11-01',
      'A long review.',
    );
    expect(old.data.subjective).toEqual({ score: 70 });
    expect(Object.keys(old.data).sort()).toEqual([
      'name',
      'overrides',
      'sources',
      'status',
      'subjective',
      'vendor',
    ]);
  });

  it('rejects invalid frontmatter with the file name in the message', () => {
    expect(() => entry('a/b', 'name: B')).toThrow(/a\/b\.md/);
    expect(() => entry('a/b', 'name: B\nvendor: A\nsubjective:\n  score: 120')).toThrow();
    expect(() => entry('a/b', 'name: B\nvendor: A\nstatus: retired')).toThrow();
    expect(() => parseModelFile('no frontmatter', 'a/b.md')).toThrow(/frontmatter/);
  });

  it('every file in src/content/models is valid', () => {
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
    // 0.5 × 97.14 + 0.3 × 96.67 + 0.2 × 96.67 = 96.90; with a subjective 95: 96.14
    expect(first?.rating.intelligence).toMatchObject({
      score: 96.1,
      tier: 'top',
      basis: 'both',
      benchmark: 96.9,
      subjective: 95,
    });
    expect(first?.rating.intelligence.breakdown).toEqual({
      aa_intelligence: { raw: 68, normalized: 97.1, weight: 0.5, frontier: 70 },
      arena_text: { raw: 1490, normalized: 96.7, weight: 0.3, frontier: 1500 },
      arena_webdev: { raw: 1790, normalized: 96.7, weight: 0.2, frontier: 1800 },
    });
    // Half the input at the $0.5 cache price: (3 × 2.75 + 25) / 4 = 8.3125
    expect(first?.rating.cost).toMatchObject({
      blended: 8.3125,
      tier: 'high',
      index: 77.5,
      cache_read: 0.5,
    });
    expect(first?.rating.value).toEqual({ score: 53.8, tier: 'mid' });
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
    });
    expect(first?.matched).toEqual({ modelsdev: true, aa: true, arena: true });
    expect(first?.url).toBe('https://mekiki.fog.moe/m/acme/flagship');
  });

  it('needs no subjective score: intelligence is then the benchmark score', () => {
    const noOpinion = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\nsources:\n  aa: flagship\n  arena_text: Flagship (High)\n  arena_webdev: "Flagship (Max)"',
    );
    const [model] = buildDataset([noOpinion], snapshots, { now: NOW, config }).models;
    expect(model?.rating.intelligence).toMatchObject({
      score: 96.9,
      basis: 'benchmark_only',
      benchmark: 96.9,
      subjective: null,
    });
    expect(model?.rating.value.score).not.toBeNull();
  });

  it('rates a model that is on one leaderboard only', () => {
    const webdevOnly = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\nsources:\n  arena_webdev: "Flagship (Max)"',
    );
    const [model] = buildDataset([webdevOnly], snapshots, { now: NOW, config }).models;
    expect(model?.rating.intelligence).toMatchObject({ score: 96.7, basis: 'benchmark_only' });
    expect(model?.matched).toEqual({ modelsdev: true, aa: false, arena: true });
  });

  it('does not read a rating from the wrong board', () => {
    // "Flagship (Max)" exists in the snapshot, but only with a WebDev rating.
    const wrongBoard = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\nsources:\n  arena_text: "Flagship (Max)"',
    );
    const [model] = buildDataset([wrongBoard], snapshots, { now: NOW, config }).models;
    expect(model?.rating.intelligence.score).toBeNull();
  });

  it('sorts unrated models last and leaves their numbers null, never 0', () => {
    expect(second?.id).toBe('acme/unknown-1.5');
    expect(second?.rating.intelligence).toMatchObject({ score: null, tier: null, basis: 'none' });
    expect(second?.rating.cost).toMatchObject({
      tier: null,
      index: null,
      blended: null,
      free: false,
    });
    expect(second?.rating.value).toEqual({ score: null, tier: null });
    expect(second?.matched).toEqual({ modelsdev: false, aa: false, arena: false });
    expect(second?.price_source).toBeNull();
  });

  it('prefers a price override', () => {
    const overridden = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\noverrides:\n  price: { input: 1, output: 2 }',
    );
    const [model] = buildDataset([overridden], snapshots, { now: NOW, config }).models;
    // The models.dev cache price still applies: (3 × 0.75 + 2) / 4 = 1.0625
    expect(model?.rating.cost).toMatchObject({
      input: 1,
      output: 2,
      blended: 1.0625,
      cache_read: 0.5,
    });
    expect(model?.price_source).toBe('override');
  });

  it('marks a zero price as free', () => {
    const free = entry('acme/free', 'name: Free\nvendor: Acme');
    const [model] = buildDataset([free], snapshots, { now: NOW, config }).models;
    expect(model?.rating.cost).toMatchObject({ free: true, index: 0, tier: 'low' });
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
        expect(model?.rating.intelligence.basis).toBe('both');
        expect(model?.rating.cost.tier).toBe('high');
      }
    },
  );

  it('builds with no snapshots at all', () => {
    const empty = buildDataset(
      [flagship, blank],
      { modelsdev: null, aa: null, arena: null },
      { now: NOW, config },
    );
    expect(empty.models[0]?.rating.intelligence).toMatchObject({
      score: 95,
      basis: 'subjective_only',
    });
    expect(empty.frontier).toEqual({ aa_intelligence: null, arena_text: null, arena_webdev: null });
    expect(latestSync(empty)).toBeNull();
  });

  it('reports the most recent sync and the frontier of every metric', () => {
    expect(latestSync(dataset)).toBe('2026-11-10T12:00:00.000Z');
    expect(dataset.frontier).toEqual({ aa_intelligence: 70, arena_text: 1500, arena_webdev: 1800 });
  });
});

describe('scoring config', () => {
  it('reads every metric from a snapshot the model files can map to', () => {
    const mappings = Object.keys(flagship.data.sources);
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
        score: 96.1,
        tier: 'top',
        label: 'Top',
        labels: { 'zh-CN': '最高', 'zh-TW': '最高', en: 'Top' },
        basis: 'both',
        benchmark: 96.9,
        subjective: 95,
        breakdown: {
          aa_intelligence: { raw: 68, normalized: 97.1, weight: 0.5 },
          arena_text: { raw: 1490, normalized: 96.7, weight: 0.3 },
          arena_webdev: { raw: 1790, normalized: 96.7, weight: 0.2 },
        },
      },
      cost: {
        tier: 'high',
        label: 'High',
        labels: { 'zh-CN': '高', 'zh-TW': '高', en: 'High' },
        index: 77.5,
        blended: 8.3125,
        input: 5,
        output: 25,
        cache_read: 0.5,
      },
      value: {
        score: 53.8,
        tier: 'mid',
        label: 'Mid',
        labels: { 'zh-CN': '中', 'zh-TW': '中', en: 'Mid' },
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
    expect(roundTripped.intelligence.subjective).toBeNull();
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

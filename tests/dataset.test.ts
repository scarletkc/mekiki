import { describe, expect, it } from 'vitest';
import { parseModelFile, readModelEntries } from '../scripts/lib/content';
import { toApiFull, toApiIndex, toApiModel } from '@/lib/api';
import { buildDataset, latestSync } from '@/lib/dataset';
import { localePath, stripLocale } from '@/i18n';
import { modelIdFromPath, type ModelEntry } from '@/lib/model-schema';
import type { Snapshots } from '@/lib/snapshots';

const NOW = new Date('2026-11-11T00:00:00Z');

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
    frontier: { aa_intelligence: 70, aa_coding: 62 },
    models: {
      flagship: { name: 'Flagship', aa_intelligence: 68, aa_coding: 60, index_cost_usd: 123.4 },
    },
  },
  arena: {
    source: 'arena',
    fetched_at: '2026-11-10T12:00:00.000Z',
    frontier: { arena_text: 1500 },
    models: { 'Flagship (High)': { arena_text: 1490, published: '2026-11-09' } },
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
    'subjective:',
    '  score: 95',
    '  verdict: Best in class',
    '  pros: [fast]',
    '  best_for: [coding]',
    'reviewed_at: 2026-11-01',
  ].join('\n'),
  'Long review.',
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
    'subjective:',
    '  score:',
    '  verdict:',
    '  pros: []',
    '  cons:',
    '  best_for: []',
    'overrides:',
    'reviewed_at:',
  ].join('\n'),
);

describe('model files', () => {
  it('keeps dots and upper case in the ID', () => {
    expect(modelIdFromPath('openai/gpt-6.1-sol.md')).toBe('openai/gpt-6.1-sol');
    expect(modelIdFromPath('minimax\\MiniMax-M3.1-Flash.md')).toBe('minimax/MiniMax-M3.1-Flash');
  });

  it('treats empty YAML values as not filled in', () => {
    expect(blank.data.subjective).toEqual({ pros: [], cons: [], best_for: [] });
    expect(blank.data.sources).toEqual({});
    expect(blank.data.overrides).toEqual({});
    expect(blank.data.reviewed_at).toBeUndefined();
    expect(blank.hasReview).toBe(false);
  });

  it('normalises the review date whether YAML gives a date or a string', () => {
    expect(flagship.data.reviewed_at).toBe('2026-11-01');
    expect(entry('a/b', 'name: B\nvendor: A\nreviewed_at: "2026-01-02"').data.reviewed_at).toBe(
      '2026-01-02',
    );
  });

  it('rejects invalid frontmatter with the file name in the message', () => {
    expect(() => entry('a/b', 'name: B')).toThrow(/a\/b\.md/);
    expect(() => entry('a/b', 'name: B\nvendor: A\nsubjective:\n  score: 120')).toThrow();
    expect(() => entry('a/b', `name: B\nvendor: A\nsubjective:\n  verdict: ${'x'.repeat(41)}`)).toThrow();
    expect(() => parseModelFile('no frontmatter', 'a/b.md')).toThrow(/frontmatter/);
  });

  it('every file in src/content/models is valid', () => {
    const entries = readModelEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length);
  });
});

describe('buildDataset', () => {
  const dataset = buildDataset([blank, flagship], snapshots, { now: NOW });
  const [first, second] = dataset.models;

  it('rates a fully mapped model exactly like SPEC §6.5 case A', () => {
    expect(first?.id).toBe('acme/flagship');
    expect(first?.rating.intelligence).toMatchObject({ score: 96.2, tier: 'top', basis: 'both', benchmark: 96.9 });
    expect(first?.rating.cost).toMatchObject({ blended: 10, tier: 'high', index: 80.7, cache_read: 0.5 });
    expect(first?.rating.value).toEqual({ score: 50.5, tier: 'mid' });
    expect(first?.facts).toMatchObject({ context: 1000000, open_weights: false, index_cost_usd: 123.4 });
    expect(first?.price_source).toBe('modelsdev');
    expect(first?.stale).toBe(false);
    expect(first?.has_review).toBe(true);
    expect(first?.url).toBe('https://mekiki.fog.moe/m/acme/flagship');
  });

  it('sorts unrated models last and leaves their numbers null, never 0', () => {
    expect(second?.id).toBe('acme/unknown-1.5');
    expect(second?.rating.intelligence).toMatchObject({ score: null, tier: null, basis: 'none' });
    expect(second?.rating.cost).toMatchObject({ tier: null, index: null, blended: null, free: false });
    expect(second?.rating.value).toEqual({ score: null, tier: null });
    expect(second?.matched).toEqual({ modelsdev: false, aa: false, arena: false });
    expect(second?.price_source).toBeNull();
  });

  it('prefers a price override', () => {
    const overridden = entry(
      'acme/flagship',
      'name: Flagship\nvendor: Acme\noverrides:\n  price: { input: 1, output: 2 }',
    );
    const [model] = buildDataset([overridden], snapshots, { now: NOW }).models;
    expect(model?.rating.cost).toMatchObject({ input: 1, output: 2, blended: 1.25, cache_read: 0.5 });
    expect(model?.price_source).toBe('override');
  });

  it('marks a zero price as free', () => {
    const free = entry('acme/free', 'name: Free\nvendor: Acme');
    const [model] = buildDataset([free], snapshots, { now: NOW }).models;
    expect(model?.rating.cost).toMatchObject({ free: true, index: 0, tier: 'low' });
  });

  it('flags a review older than 90 days', () => {
    const old = entry('a/old', 'name: Old\nvendor: A\nreviewed_at: 2026-08-01');
    const fresh = entry('a/fresh', 'name: Fresh\nvendor: A\nreviewed_at: 2026-08-14');
    const { models } = buildDataset([old, fresh], snapshots, { now: NOW });
    expect(models.find((model) => model.id === 'a/old')?.stale).toBe(true);
    expect(models.find((model) => model.id === 'a/fresh')?.stale).toBe(false);
  });

  it.each(['modelsdev', 'aa', 'arena'] as const)('still builds without the %s snapshot', (source) => {
    const partial = buildDataset([flagship], { ...snapshots, [source]: null }, { now: NOW });
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
  });

  it('builds with no snapshots at all', () => {
    const empty = buildDataset([flagship, blank], { modelsdev: null, aa: null, arena: null }, { now: NOW });
    expect(empty.models[0]?.rating.intelligence).toMatchObject({ score: 95, basis: 'subjective_only' });
    expect(latestSync(empty)).toBeNull();
  });

  it('reports the most recent sync', () => {
    expect(latestSync(dataset)).toBe('2026-11-10T12:00:00.000Z');
  });
});

describe('JSON API', () => {
  const dataset = buildDataset([blank, flagship], snapshots, { now: NOW });
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
        score: 96.2,
        tier: 'top',
        label: '最高',
        labels: { 'zh-CN': '最高', 'zh-TW': '最高', en: 'Top' },
        basis: 'both',
        benchmark: 96.9,
        subjective: 95,
        breakdown: {
          aa_intelligence: { raw: 68, normalized: 97.1, weight: 0.5 },
          aa_coding: { raw: 60, normalized: 96.8, weight: 0.2 },
          arena_text: { raw: 1490, normalized: 96.7, weight: 0.3 },
        },
      },
      cost: {
        tier: 'high',
        label: '高',
        labels: { 'zh-CN': '高', 'zh-TW': '高', en: 'High' },
        index: 80.7,
        blended: 10,
        input: 5,
        output: 25,
        cache_read: 0.5,
      },
      value: { score: 50.5, tier: 'mid', label: '中', labels: { 'zh-CN': '中', 'zh-TW': '中', en: 'Mid' } },
      verdict: 'Best in class',
      best_for: ['coding'],
      reviewed_at: '2026-11-01',
      url: 'https://mekiki.fog.moe/m/acme/flagship',
    });
  });

  it('uses null for missing values and never drops a field', () => {
    const unrated = toApiModel(dataset.models[1]!);
    const roundTripped = JSON.parse(JSON.stringify(unrated));
    expect(roundTripped).toEqual(unrated);
    expect(Object.keys(roundTripped)).toEqual(Object.keys(full.models[0]!));
    expect(Object.keys(roundTripped.intelligence)).toEqual(Object.keys(full.models[0]!.intelligence));
    expect(Object.keys(roundTripped.cost)).toEqual(Object.keys(full.models[0]!.cost));
    expect(Object.keys(roundTripped.value)).toEqual(Object.keys(full.models[0]!.value));
    expect(roundTripped.intelligence.score).toBeNull();
    expect(roundTripped.intelligence.breakdown.arena_text).toEqual({ raw: null, normalized: null, weight: 0.3 });
    expect(roundTripped.cost.blended).toBeNull();
    expect(roundTripped.value.label).toBeNull();
    expect(roundTripped.verdict).toBeNull();
    expect(roundTripped.reviewed_at).toBeNull();
    expect(roundTripped.best_for).toEqual([]);
  });

  it('lists every model in the index', () => {
    expect(toApiIndex(dataset)).toEqual([
      { id: 'acme/flagship', name: 'Flagship', vendor: 'Acme', status: 'active' },
      { id: 'acme/unknown-1.5', name: 'Unknown 1.5', vendor: 'Acme', status: 'legacy' },
    ]);
  });
});

describe('locale paths', () => {
  it('leaves the default locale unprefixed', () => {
    expect(localePath('zh-cn')).toBe('/');
    expect(localePath('zh-cn', '/method')).toBe('/method/');
    expect(localePath('zh-cn', '/m/openai/gpt-6.1-sol')).toBe('/m/openai/gpt-6.1-sol/');
  });

  it('prefixes the other locales', () => {
    expect(localePath('en')).toBe('/en/');
    expect(localePath('zh-tw', 'api')).toBe('/zh-tw/api/');
    expect(localePath('en', '/m/openai/gpt-6.1-sol/')).toBe('/en/m/openai/gpt-6.1-sol/');
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
    expect(stripLocale('/m/x/y/')).toBe('/m/x/y/');
    expect(stripLocale('/english/')).toBe('/english/');
  });
});

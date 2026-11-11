import { describe, expect, it } from 'vitest';
import {
  BEST,
  bestOfEachVendor,
  type Filterable,
  type Filters,
  filterModels,
  matchesFilters,
  NO_FILTERS,
} from '@/lib/filters';

const model = (
  id: string,
  vendor: string,
  extra: Partial<Omit<Filterable, 'id' | 'vendor'>> = {},
): Filterable => ({
  id,
  name: id,
  vendor,
  legacy: false,
  intelligence: { score: 70, tier: 'high' },
  cost: { tier: 'low' },
  value: { tier: 'high' },
  openWeights: false,
  ...extra,
});

const MODELS = [
  model('grok-new', 'xAI'),
  model('grok-old', 'xAI', { legacy: true }),
  model('claude-new', 'Anthropic', { intelligence: { score: 90, tier: 'top' } }),
  model('claude-old', 'Anthropic', { legacy: true, intelligence: { score: 85, tier: 'top' } }),
  model('claude-older', 'Anthropic', {
    legacy: true,
    intelligence: { score: 80, tier: 'top' },
  }),
  model('kimi', 'Moonshot AI', { openWeights: true }),
];

const ids = (rows: Filterable[]) => rows.map((row) => row.id);
const filters = (changes: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...changes });

describe('matchesFilters', () => {
  it('searches the name and the id, ignoring case and outer spaces', () => {
    const grok = model('grok-4-7', 'xAI', { name: 'Grok 4.7' });
    expect(matchesFilters(grok, filters({ q: '  GROK 4.7 ' }))).toBe(true);
    expect(matchesFilters(grok, filters({ q: '4-7' }))).toBe(true);
    expect(matchesFilters(grok, filters({ q: 'claude' }))).toBe(false);
  });

  it('treats unknown open weights as neither open nor closed', () => {
    const unknown = model('mystery', 'Acme', { openWeights: null });
    expect(matchesFilters(unknown, filters({}))).toBe(true);
    expect(matchesFilters(unknown, filters({ open: 'open' }))).toBe(false);
    expect(matchesFilters(unknown, filters({ open: 'closed' }))).toBe(false);
  });

  it('ignores the legacy toggle', () => {
    const old = model('old', 'Acme', { legacy: true });
    expect(matchesFilters(old, filters({ legacy: false }))).toBe(true);
  });
});

describe('filterModels', () => {
  it('lists active models only while legacy ones are collapsed', () => {
    const result = filterModels(MODELS, NO_FILTERS);
    expect(ids(result.rows)).toEqual(['grok-new', 'claude-new', 'kimi']);
    expect(result.total).toBe(3);
    expect(result.legacy).toBe(3);
  });

  it('counts only the legacy models that pass the filters', () => {
    const result = filterModels(MODELS, filters({ vendor: 'xAI' }));
    expect(ids(result.rows)).toEqual(['grok-new']);
    expect(result.legacy).toBe(1);
  });

  it('keeps the total to the whole list whichever filter is set', () => {
    for (const changes of [{ vendor: 'xAI' }, { int: 'top' }, { open: 'open' }, { q: 'kimi' }]) {
      expect(filterModels(MODELS, filters(changes)).total).toBe(3);
    }
  });

  it('adds legacy models to the rows and the total once they are shown', () => {
    const result = filterModels(MODELS, filters({ vendor: 'Anthropic', legacy: true }));
    expect(ids(result.rows)).toEqual(['claude-new', 'claude-old', 'claude-older']);
    expect(result.total).toBe(6);
    expect(result.legacy).toBe(2);
  });

  it('counts no legacy models when none pass the filters', () => {
    expect(filterModels(MODELS, filters({ open: 'open' })).legacy).toBe(0);
  });

  it('counts legacy matches when only legacy models pass the filters', () => {
    const result = filterModels(MODELS, filters({ q: 'old' }));
    expect(result.rows).toEqual([]);
    expect(result.legacy).toBe(3);
  });
});

describe('bestOfEachVendor', () => {
  const scored = (id: string, vendor: string, score: number | null, legacy = false) =>
    model(id, vendor, { legacy, intelligence: { score, tier: score === null ? null : 'high' } });

  it('keeps the highest intelligence score of each vendor, in list order', () => {
    const rows = [
      scored('a-mid', 'A', 60),
      scored('b-top', 'B', 75),
      scored('a-top', 'A', 80),
      scored('b-low', 'B', 40),
    ];
    expect(ids(bestOfEachVendor(rows))).toEqual(['b-top', 'a-top']);
  });

  it('never picks an unscored model and drops a vendor with no score at all', () => {
    const rows = [scored('a-new', 'A', null), scored('a-old', 'A', 50), scored('b', 'B', null)];
    expect(ids(bestOfEachVendor(rows))).toEqual(['a-old']);
  });

  it('settles a tie on the active model, then on the first listed', () => {
    expect(ids(bestOfEachVendor([scored('old', 'A', 70, true), scored('new', 'A', 70)]))).toEqual([
      'new',
    ]);
    expect(ids(bestOfEachVendor([scored('first', 'A', 70), scored('second', 'A', 70)]))).toEqual([
      'first',
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(bestOfEachVendor([])).toEqual([]);
  });
});

describe('filterModels with the best of each vendor', () => {
  const best = (changes: Partial<Filters> = {}) => filters({ vendor: BEST, ...changes });

  it('matches every vendor', () => {
    expect(matchesFilters(model('x', 'Acme'), best())).toBe(true);
  });

  it('lists one model per vendor and keeps the total to the whole list', () => {
    const result = filterModels(MODELS, best());
    expect(ids(result.rows)).toEqual(['grok-new', 'claude-new', 'kimi']);
    expect(result.total).toBe(3);
  });

  it('picks the best among the models the other filters leave', () => {
    const rows = [
      model('a-top', 'A', { intelligence: { score: 90, tier: 'top' }, openWeights: false }),
      model('a-open', 'A', { intelligence: { score: 60, tier: 'mid' }, openWeights: true }),
      model('b-open', 'B', { intelligence: { score: 50, tier: 'mid' }, openWeights: true }),
    ];
    expect(ids(filterModels(rows, best({ open: 'open' })).rows)).toEqual(['a-open', 'b-open']);
    expect(ids(filterModels(rows, best({ int: 'mid' })).rows)).toEqual(['a-open', 'b-open']);
    expect(ids(filterModels(rows, best({ q: 'open' })).rows)).toEqual(['a-open', 'b-open']);
  });

  it('lets a shown legacy model win and counts only legacy models that would win', () => {
    const rows = [
      model('a-new', 'A', { intelligence: { score: 70, tier: 'high' } }),
      model('a-old', 'A', { legacy: true, intelligence: { score: 75, tier: 'high' } }),
      model('a-older', 'A', { legacy: true, intelligence: { score: 65, tier: 'high' } }),
      model('b-old', 'B', { legacy: true, intelligence: { score: 30, tier: 'low' } }),
    ];
    const hidden = filterModels(rows, best());
    expect(ids(hidden.rows)).toEqual(['a-new']);
    expect(hidden.legacy).toBe(2);
    const shown = filterModels(rows, best({ legacy: true }));
    expect(ids(shown.rows)).toEqual(['a-old', 'b-old']);
    expect(shown.total).toBe(4);
    expect(shown.legacy).toBe(2);
  });

  it('counts no legacy models when none would win', () => {
    expect(filterModels(MODELS, best()).legacy).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
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
  intelligence: { tier: 'high' },
  cost: { tier: 'low' },
  value: { tier: 'high' },
  openWeights: false,
  ...extra,
});

const MODELS = [
  model('grok-new', 'xAI'),
  model('grok-old', 'xAI', { legacy: true }),
  model('claude-new', 'Anthropic', { intelligence: { tier: 'top' } }),
  model('claude-old', 'Anthropic', { legacy: true, intelligence: { tier: 'top' } }),
  model('claude-older', 'Anthropic', { legacy: true, intelligence: { tier: 'top' } }),
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

import { describe, expect, it } from 'vitest';
import { LOCALES, useTranslations } from '@/i18n';
import {
  dayCount,
  leaderPeriods,
  modelStanding,
  periodText,
  recentLeaders,
  standingRows,
} from '@/lib/leaders';
import { utcDate } from '@/lib/history';
import { getDataset, getHistory } from '@/lib/site-data';
import { datasetOf, record, recorded } from './support/records';

const TODAY = '2026-11-20';

const entries = [
  recorded('2026-11-01', { 'a/x': { name: 'X', intelligence: 90, value: 40 } }),
  recorded('2026-11-03', {
    'a/x': { name: 'X', intelligence: 91, value: 40 },
    'a/y': { name: 'Y', intelligence: 80, value: 60 },
  }),
  recorded('2026-11-10', {
    'a/x': { name: 'X 1', intelligence: 91, value: 40 },
    'a/y': { name: 'Y', intelligence: 95, value: 60 },
  }),
];

describe('leader periods', () => {
  it('holds a lead until another model is recorded ahead', () => {
    expect(leaderPeriods(entries, 'intelligence', TODAY)).toEqual([
      {
        rating: 'intelligence',
        model: { id: 'a/x', name: 'X' },
        from: '2026-11-01',
        to: '2026-11-10',
        days: 9,
        next: { id: 'a/y', name: 'Y' },
      },
      {
        rating: 'intelligence',
        model: { id: 'a/y', name: 'Y' },
        from: '2026-11-10',
        to: null,
        days: 10,
        next: null,
      },
    ]);
  });

  it('counts each rating on its own, and reads the entries in date order', () => {
    const value = leaderPeriods([...entries].reverse(), 'value', TODAY);
    expect(value.map((period) => [period.model.id, period.from, period.to, period.days])).toEqual([
      ['a/x', '2026-11-01', '2026-11-03', 2],
      ['a/y', '2026-11-03', null, 17],
    ]);
  });

  it('keeps the latest name of a model that stays ahead', () => {
    const renamed = leaderPeriods(entries.slice(1), 'value', TODAY);
    expect(renamed).toHaveLength(1);
    expect(leaderPeriods(entries.slice(0, 2), 'intelligence', TODAY)[0]!.model.name).toBe('X');
    expect(
      leaderPeriods(
        [entries[0]!, recorded('2026-11-02', { 'a/x': { name: 'X 1', intelligence: 90 } })],
        'intelligence',
        TODAY,
      )[0]!.model.name,
    ).toBe('X 1');
  });

  it('ends a lead on a day no model is rated, and is empty without history', () => {
    const gap = leaderPeriods(
      [entries[0]!, recorded('2026-11-05', { 'a/x': { name: 'X' } })],
      'intelligence',
      TODAY,
    );
    expect(gap).toEqual([
      {
        rating: 'intelligence',
        model: { id: 'a/x', name: 'X' },
        from: '2026-11-01',
        to: '2026-11-05',
        days: 4,
        next: null,
      },
    ]);
    expect(leaderPeriods([], 'value', TODAY)).toEqual([]);
  });

  it('never counts a negative number of days', () => {
    expect(leaderPeriods(entries, 'intelligence', '2026-11-09').at(-1)!.days).toBe(0);
  });

  it('lists the newest periods of each rating first, up to the limit', () => {
    const all = recentLeaders(entries, TODAY);
    expect(all.map((period) => `${period.rating} ${period.model.id}`)).toEqual([
      'intelligence a/y',
      'intelligence a/x',
      'value a/y',
      'value a/x',
    ]);
    const latest = recentLeaders(entries, TODAY, { periodsShown: 1 });
    expect(latest.map((period) => period.model.id)).toEqual(['a/y', 'a/y']);
  });
});

describe('model standing', () => {
  const models = [
    record('a/x', { name: 'Atlas 2', intelligence: 95, value: 40 }),
    record('a/y', { name: 'Y', intelligence: 80, value: 60 }),
    record('a/z', { name: 'Z', intelligence: 80, value: 55 }),
    record('a/old', { name: 'Atlas 1', intelligence: 99, value: 70, status: 'legacy' }),
    record('a/old-y', { name: 'Borealis 1', intelligence: 60, value: 30, status: 'legacy' }),
    record('a/new-y', { name: 'Borealis 1.5', intelligence: 70, value: 45 }),
    record('a/unrated', { name: 'U', intelligence: null, value: null }),
  ];

  it('ranks a model among the models that are not legacy, ties sharing a place', async () => {
    const dataset = await datasetOf(models);
    const rank = (id: string) =>
      modelStanding(models.find((model) => model.id === id)!, dataset, [], TODAY).ranks;
    expect(rank('a/x')).toEqual([
      { rating: 'intelligence', rank: 1, total: 4 },
      { rating: 'value', rank: 4, total: 4 },
    ]);
    expect(rank('a/y')[0]).toEqual({ rating: 'intelligence', rank: 2, total: 4 });
    expect(rank('a/z')[0]).toEqual({ rating: 'intelligence', rank: 2, total: 4 });
    expect(rank('a/old')).toEqual([]);
    expect(rank('a/unrated')).toEqual([]);
  });

  it('measures the gap to the leader, except for the leader and unrated models', async () => {
    const dataset = await datasetOf(models);
    const leader = (id: string) =>
      modelStanding(models.find((model) => model.id === id)!, dataset, [], TODAY).leader;
    expect(leader('a/y')).toEqual({ model: { id: 'a/x', name: 'Atlas 2' }, points: 15 });
    expect(leader('a/x')).toBeNull();
    expect(leader('a/unrated')).toBeNull();
    expect(leader('a/old-y')).toEqual({ model: { id: 'a/x', name: 'Atlas 2' }, points: 35 });
  });

  it('names the newest version of a superseded model once', async () => {
    const dataset = await datasetOf(models);
    const standing = (id: string) =>
      modelStanding(models.find((model) => model.id === id)!, dataset, [], TODAY);
    expect(standing('a/old-y').newer).toEqual({
      model: { id: 'a/new-y', name: 'Borealis 1.5' },
      points: 10,
    });
    expect(standing('a/old').newer).toEqual({ model: { id: 'a/x', name: 'Atlas 2' }, points: -4 });
    expect(standing('a/old').leader).toBeNull();
    expect(standing('a/y').newer).toBeNull();
  });

  it('lists the periods a model led', async () => {
    const dataset = await datasetOf(models);
    const { led } = modelStanding(models[0]!, dataset, entries, TODAY);
    expect(led.map((period) => [period.rating, period.from, period.to])).toEqual([
      ['intelligence', '2026-11-01', '2026-11-10'],
      ['value', '2026-11-01', '2026-11-03'],
    ]);
  });

  it.each(LOCALES)('writes every row in full in %s', async (locale) => {
    const t = useTranslations(locale);
    const dataset = await datasetOf(models);
    const rows = standingRows(modelStanding(models[0]!, dataset, entries, TODAY), t);
    expect(rows.map((row) => row.key)).toEqual([
      'rank-intelligence',
      'rank-value',
      'led-intelligence-2026-11-01',
      'led-value-2026-11-01',
    ]);
    expect(rows[2]!.value.at(-1)).toEqual({ id: 'a/y', name: 'Y' });
    const legacy = standingRows(modelStanding(models[4]!, dataset, entries, TODAY), t);
    expect(legacy.map((row) => row.key)).toEqual(['leader', 'newer']);
    expect(legacy[1]!.value).toEqual([{ id: 'a/new-y', name: 'Borealis 1.5' }, ' +10.0']);
    for (const row of [...rows, ...legacy]) {
      const text = row.value.map((part) => (typeof part === 'string' ? part : part.name)).join('');
      expect(`${row.label}${text}`).not.toMatch(/[{}]|undefined|null|NaN/);
    }
  });

  it.each(LOCALES)('counts days and names periods in %s', (locale) => {
    const t = useTranslations(locale);
    expect(dayCount(1, t)).toBe(t.standing.dayOne);
    expect(dayCount(12, t)).toContain('12');
    const [closed, open] = leaderPeriods(entries, 'intelligence', TODAY);
    expect(periodText(closed!, t)).toContain('2026-11-10');
    expect(periodText(open!, t)).toContain('2026-11-10');
    expect(periodText(open!, t)).not.toMatch(/[{}]/);
  });
});

describe('the recorded history', () => {
  it('gives every rating a current leader that the dataset lists', async () => {
    const dataset = await getDataset();
    const { entries: history } = getHistory();
    const leaders = recentLeaders(history, utcDate(new Date(dataset.generated_at)));
    if (history.length === 0) {
      expect(leaders).toEqual([]);
      return;
    }
    const current = leaders.filter((period) => period.to === null);
    expect(current.map((period) => period.rating)).toEqual(['intelligence', 'value']);
    for (const period of leaders) expect(period.days).toBeGreaterThanOrEqual(0);
  });
});

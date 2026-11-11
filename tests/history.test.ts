import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseModelFile } from '../scripts/lib/content';
import { buildChangelog, changesFor, leaderOf, modelSeries, type Change } from '@/lib/changelog';
import { buildDataset } from '@/lib/dataset';
import {
  addEntry,
  historyEntry,
  parseHistory,
  readHistory,
  serializeHistory,
  utcDate,
  type HistoryEntry,
  type HistoryModel,
} from '@/lib/history';
import { buildFeed } from '@/lib/feed';
import { SOURCE_IDS, type Snapshots } from '@/lib/snapshots';

interface ModelSpec {
  name?: string;
  status?: 'active' | 'legacy';
  intelligence?: number | null;
  intelligenceTier?: string | null;
  value?: number | null;
  valueTier?: string | null;
  input?: number | null;
  output?: number | null;
  cacheRead?: number | null;
  costTier?: string | null;
  blended?: number | null;
}

function tierOf(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return 'top';
  if (score >= 75) return 'high';
  if (score >= 55) return 'mid';
  return score >= 40 ? 'low' : 'very_low';
}

function model(spec: ModelSpec = {}): HistoryModel {
  const intelligence = spec.intelligence === undefined ? 80 : spec.intelligence;
  const value = spec.value === undefined ? 60 : spec.value;
  const input = spec.input === undefined ? 1 : spec.input;
  return {
    name: spec.name ?? 'Model',
    status: spec.status ?? 'active',
    intelligence: {
      score: intelligence,
      tier: spec.intelligenceTier === undefined ? tierOf(intelligence) : spec.intelligenceTier,
    },
    cost: {
      tier: spec.costTier === undefined ? 'mid' : spec.costTier,
      blended: spec.blended === undefined ? 0.5 : spec.blended,
      input,
      output: spec.output === undefined ? 5 : spec.output,
      cache_read: spec.cacheRead === undefined ? 0.1 : spec.cacheRead,
    },
    value: { score: value, tier: spec.valueTier === undefined ? tierOf(value) : spec.valueTier },
  };
}

const day = (date: string, models: Record<string, HistoryModel>): HistoryEntry => ({
  date,
  models,
});

describe('history entries', () => {
  it('records what the dataset shows, keyed by model ID', () => {
    const entry = parseModelFile(
      '---\nname: Flagship\nvendor: Acme\noverrides:\n  price: { input: 1.25, output: 10 }\n---\n',
      'acme/flagship.md',
    );
    const noSnapshots = Object.fromEntries(
      SOURCE_IDS.map((id) => [id, null]),
    ) as unknown as Snapshots;
    const dataset = buildDataset([entry], noSnapshots);
    const recorded = historyEntry(dataset, '2026-11-11');
    const { cost } = dataset.models[0]!.rating;
    expect(recorded.date).toBe('2026-11-11');
    expect(recorded.models['acme/flagship']).toEqual({
      name: 'Flagship',
      status: 'active',
      intelligence: { score: null, tier: null },
      cost: { tier: cost.tier, blended: cost.blended, input: 1.25, output: 10, cache_read: null },
      value: { score: null, tier: null },
    });
    expect(cost.tier).not.toBeNull();
  });

  it('uses the UTC date', () => {
    expect(utcDate(new Date('2026-11-11T23:30:00-05:00'))).toBe('2026-11-12');
  });

  it('appends a changed day and skips an unchanged one', () => {
    const first = day('2026-11-10', { 'a/x': model() });
    const same = day('2026-11-11', { 'a/x': model() });
    const changed = day('2026-11-11', { 'a/x': model({ intelligence: 81 }) });

    expect(addEntry([], first)).toEqual({ history: [first], outcome: 'added' });
    expect(addEntry([first], same)).toEqual({ history: [first], outcome: 'unchanged' });
    expect(addEntry([first], changed)).toEqual({ history: [first, changed], outcome: 'added' });
  });

  it('replaces the same day, and drops it when it matches the day before again', () => {
    const first = day('2026-11-10', { 'a/x': model() });
    const morning = day('2026-11-11', { 'a/x': model({ intelligence: 81 }) });
    const evening = day('2026-11-11', { 'a/x': model({ intelligence: 82 }) });
    const reverted = day('2026-11-11', { 'a/x': model() });

    expect(addEntry([first, morning], evening)).toEqual({
      history: [first, evening],
      outcome: 'updated',
    });
    expect(addEntry([first, morning], morning).outcome).toBe('unchanged');
    expect(addEntry([first, morning], reverted)).toEqual({ history: [first], outcome: 'updated' });
  });

  it('compares by content, not key order', () => {
    const first = day('2026-11-10', { 'a/x': model(), 'b/y': model({ name: 'Y' }) });
    const reordered = day('2026-11-11', { 'b/y': model({ name: 'Y' }), 'a/x': model() });
    expect(addEntry([first], reordered).outcome).toBe('unchanged');
  });

  it('refuses to record a day before the latest one', () => {
    const later = day('2026-11-12', { 'a/x': model() });
    const result = addEntry([later], day('2026-11-11', { 'a/x': model({ intelligence: 10 }) }));
    expect(result).toEqual({ history: [later], outcome: 'skipped' });
  });

  it('round-trips through the file format and skips broken lines', () => {
    const entries = [
      day('2026-11-10', { 'a/x': model() }),
      day('2026-11-11', { 'a/x': model({ intelligence: 90 }) }),
    ];
    const text = serializeHistory(entries);
    expect(text.split('\n')).toHaveLength(3);
    expect(parseHistory(text)).toEqual({ entries, invalid: 0 });

    const damaged = `${text}not json\n{"date":"bad","models":{}}\r\n\n`;
    expect(parseHistory(damaged)).toEqual({ entries, invalid: 2 });
  });

  it('reads a missing file as an empty history', () => {
    const root = mkdtempSync(join(tmpdir(), 'mekiki-history-'));
    try {
      expect(readHistory(root)).toEqual({ entries: [], invalid: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('changelog', () => {
  const kinds = (changes: Change[]) => changes.map((change) => change.kind);

  it('treats the first day as the baseline', () => {
    const changelog = buildChangelog([day('2026-11-10', { 'a/x': model() })]);
    expect(changelog).toEqual({ start: '2026-11-10', end: '2026-11-10', days: [] });
    expect(buildChangelog([])).toEqual({ start: null, end: null, days: [] });
  });

  it('reports tier changes with the scores, and ignores small moves', () => {
    const changelog = buildChangelog([
      day('2026-11-10', { 'a/x': model({ name: 'X', intelligence: 89.5 }) }),
      day('2026-11-11', { 'a/x': model({ name: 'X', intelligence: 90.2 }) }),
      day('2026-11-12', { 'a/x': model({ name: 'X', intelligence: 91.0 }) }),
    ]);
    expect(changelog.days).toEqual([
      {
        date: '2026-11-11',
        changes: [
          {
            kind: 'tier',
            rating: 'intelligence',
            model: { id: 'a/x', name: 'X' },
            from: 'high',
            to: 'top',
            fromFigure: 89.5,
            toFigure: 90.2,
          },
        ],
      },
    ]);
  });

  it('reports a score once it drifts far enough from the last reported one', () => {
    const scores = [80, 81, 82, 83, 84, 84.5, 87];
    const entries = scores.map((score, index) =>
      day(`2026-11-${String(10 + index)}`, { 'a/x': model({ intelligence: score }) }),
    );
    const changes = buildChangelog(entries, { scoreDelta: 3 }).days.flatMap((d) => d.changes);
    expect(changes).toEqual([
      {
        kind: 'score',
        rating: 'intelligence',
        model: { id: 'a/x', name: 'Model' },
        from: 83,
        to: 87,
      },
      {
        kind: 'score',
        rating: 'intelligence',
        model: { id: 'a/x', name: 'Model' },
        from: 80,
        to: 83,
      },
    ]);
  });

  it('reports a price change with the cost tier it caused', () => {
    const changelog = buildChangelog([
      day('2026-11-10', { 'a/x': model({ input: 1, costTier: 'mid' }) }),
      day('2026-11-11', { 'a/x': model({ input: 3, costTier: 'high' }) }),
    ]);
    expect(changelog.days[0]!.changes).toEqual([
      {
        kind: 'price',
        model: { id: 'a/x', name: 'Model' },
        from: { input: 1, output: 5, cache_read: 0.1 },
        to: { input: 3, output: 5, cache_read: 0.1 },
        tier: { from: 'mid', to: 'high' },
      },
    ]);
  });

  it('reports a cost tier change without a price change as a tier change', () => {
    const changelog = buildChangelog([
      day('2026-11-10', { 'a/x': model({ costTier: 'mid', blended: 1.9 }) }),
      day('2026-11-11', { 'a/x': model({ costTier: 'high', blended: 2.1 }) }),
    ]);
    expect(changelog.days[0]!.changes).toMatchObject([
      { kind: 'tier', rating: 'cost', from: 'mid', to: 'high', fromFigure: 1.9, toFigure: 2.1 },
    ]);
  });

  it('reports models added, removed and moved to legacy, and a new leader', () => {
    const changelog = buildChangelog([
      day('2026-11-10', {
        'a/old': model({ name: 'Old', intelligence: 70 }),
        'a/x': model({ name: 'X', intelligence: 80 }),
      }),
      day('2026-11-11', {
        'a/x': model({ name: 'X', intelligence: 80, status: 'legacy' }),
        'a/new': model({ name: 'New', intelligence: 95, value: 75 }),
      }),
    ]);
    const changes = changelog.days[0]!.changes;
    expect(kinds(changes)).toEqual(['leader', 'leader', 'added', 'removed', 'status']);
    expect(changes[0]).toEqual({
      kind: 'leader',
      rating: 'intelligence',
      model: { id: 'a/new', name: 'New' },
      previous: { id: 'a/x', name: 'X' },
    });
    expect(changes[1]).toMatchObject({ kind: 'leader', rating: 'value' });
    expect(changes[4]).toMatchObject({ kind: 'status', from: 'active', to: 'legacy' });
  });

  it('lists days newest first and filters by model', () => {
    const changelog = buildChangelog([
      day('2026-11-10', { 'a/x': model(), 'a/y': model({ name: 'Y', intelligence: 50 }) }),
      day('2026-11-11', {
        'a/x': model({ intelligence: 92 }),
        'a/y': model({ name: 'Y', intelligence: 50 }),
      }),
      day('2026-11-12', {
        'a/x': model({ intelligence: 92 }),
        'a/y': model({ name: 'Y', intelligence: 60 }),
      }),
    ]);
    expect(changelog.days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-11']);
    expect(changesFor(changelog, 'a/y').map((item) => item.date)).toEqual(['2026-11-12']);
  });

  it('picks the leader by score, then by name', () => {
    const entry = day('2026-11-10', {
      'a/b': model({ name: 'B', intelligence: 90 }),
      'a/a': model({ name: 'A', intelligence: 90 }),
      'a/c': model({ name: 'C', intelligence: null }),
    });
    expect(leaderOf(entry, 'intelligence')).toEqual({ id: 'a/a', name: 'A' });
    expect(leaderOf(day('2026-11-10', {}), 'value')).toBeNull();
  });
});

describe('model series', () => {
  const entries = [
    day('2026-11-08', { 'a/y': model() }),
    day('2026-11-09', { 'a/x': model({ intelligence: 70, value: 50 }) }),
    day('2026-11-10', {}),
    day('2026-11-11', { 'a/x': model({ intelligence: 72, value: 51 }) }),
  ];

  it('starts at the first appearance and breaks where the model was missing', () => {
    expect(modelSeries(entries, 'a/x')).toEqual([
      { date: '2026-11-09', intelligence: 70, value: 50 },
      { date: '2026-11-10', intelligence: null, value: null },
      { date: '2026-11-11', intelligence: 72, value: 51 },
    ]);
  });

  it('ends on the current numbers, replacing a recorded point on the same day', () => {
    const current = { date: '2026-11-11', intelligence: 73, value: 52 };
    expect(modelSeries(entries, 'a/x', current).at(-1)).toEqual(current);
    expect(modelSeries(entries, 'a/x', current)).toHaveLength(3);
    expect(modelSeries([], 'a/x', current)).toEqual([current]);
  });
});

describe('RSS feed', () => {
  const changelog = buildChangelog([
    day('2026-11-10', { 'a/x': model({ name: 'X & Co <1>', intelligence: 89 }) }),
    day('2026-11-11', { 'a/x': model({ name: 'X & Co <1>', intelligence: 91 }) }),
  ]);

  it('has one escaped item per day, dated by the history', () => {
    const xml = buildFeed(changelog, 'en');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<language>en</language>');
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).toContain('<pubDate>Wed, 11 Nov 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain(
      '<guid isPermaLink="true">https://mekiki.fog.moe/en/changelog/#2026-11-11</guid>',
    );
    expect(xml).toContain('https://mekiki.fog.moe/en/m/a/x/');
    expect(xml).not.toContain('X & Co <1>');
    expect(xml).toContain('X &amp;amp; Co &amp;lt;1&amp;gt;');
  });

  it('does not change between builds', () => {
    expect(buildFeed(changelog, 'zh-cn')).toBe(buildFeed(changelog, 'zh-cn'));
    expect(buildFeed(changelog, 'zh-cn')).toContain('<language>zh-CN</language>');
  });
});

describe('history file on disk', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('ignores broken lines when reading, and leaves the file alone', () => {
    root = mkdtempSync(join(tmpdir(), 'mekiki-history-'));
    mkdirSync(join(root, 'data'), { recursive: true });
    const path = join(root, 'data', 'history.jsonl');
    writeFileSync(path, `${serializeHistory([day('2026-11-10', { 'a/x': model() })])}{broken\n`);
    expect(readHistory(root)).toMatchObject({ invalid: 1 });
    expect(readHistory(root).entries).toHaveLength(1);
    expect(readFileSync(path, 'utf8')).toContain('{broken');
  });
});

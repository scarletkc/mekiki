import { describe, expect, it } from 'vitest';
import {
  linearTicks,
  logDomain,
  logTicks,
  placeLabels,
  pointAt,
  scoreDomain,
  stepPath,
  trendSeries,
  zeroBasedAxis,
  type TrendPoint,
} from '@/lib/charts';
import type { HistoryEntry, HistoryModel } from '@/lib/history';

describe('logTicks', () => {
  it('lists the 1-2-5 steps inside the range', () => {
    expect(logTicks(0.05, 5)).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2, 5]);
    expect(logTicks(0.3, 3)).toEqual([0.5, 1, 2]);
  });

  it('returns nothing for a range that is not positive', () => {
    expect(logTicks(0, 5)).toEqual([]);
    expect(logTicks(5, 1)).toEqual([]);
  });
});

describe('logDomain', () => {
  it('widens to the steps just outside the values, with room', () => {
    expect(logDomain([0.077, 1.47, 2.94])).toEqual([0.05, 5]);
  });

  it('gives room around a value that sits on a step', () => {
    const [lo, hi] = logDomain([1, 2]);
    expect(lo).toBeLessThan(1);
    expect(hi).toBeGreaterThan(2);
  });

  it('ignores zero and missing values', () => {
    expect(logDomain([0, Number.NaN, 1.47])).toEqual([1, 2]);
    expect(logDomain([])).toEqual([0.1, 10]);
  });
});

describe('scoreDomain', () => {
  it('zooms to the values in whole steps', () => {
    expect(scoreDomain([48.5, 94.5, 75])).toEqual([40, 100]);
  });

  it('stays inside 0–100 and at least two steps tall', () => {
    expect(scoreDomain([99])).toEqual([80, 100]);
    expect(scoreDomain([1])).toEqual([0, 20]);
    expect(scoreDomain([])).toEqual([0, 100]);
  });
});

describe('axes', () => {
  it('spaces linear ticks evenly', () => {
    expect(linearTicks(40, 100, 10)).toEqual([40, 50, 60, 70, 80, 90, 100]);
  });

  it('rounds a zero-based axis up to a 1-2-5 step', () => {
    expect(zeroBasedAxis(2.94)).toEqual({ hi: 3, ticks: [0, 1, 2, 3] });
    expect(zeroBasedAxis(3.85)).toEqual({ hi: 4, ticks: [0, 1, 2, 3, 4] });
    expect(zeroBasedAxis(0.35).hi).toBeCloseTo(0.4);
    expect(zeroBasedAxis(0)).toEqual({ hi: 1, ticks: [0, 1] });
  });
});

describe('placeLabels', () => {
  const label = (id: string, x: number, y: number) => ({ id, x, y, r: 6, width: 60, height: 14 });

  it('puts a lone label to the right of its mark', () => {
    const placed = placeLabels([label('a', 100, 100)], 400, 300);
    expect(placed.get('a')?.anchor).toBe('start');
    expect(placed.get('a')?.box.left).toBeGreaterThan(100);
  });

  it('moves a label left when the right side is out of bounds', () => {
    const placed = placeLabels([label('a', 380, 100)], 400, 300);
    expect(placed.get('a')?.anchor).toBe('end');
  });

  it('never overlaps two labels, and drops one that has no room', () => {
    const marks = [label('a', 100, 100), label('b', 100, 104), label('c', 100, 108)];
    const placed = placeLabels(marks, 400, 300);
    const boxes = [...placed.values()].map((item) => item.box);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const overlap =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap).toBe(false);
      }
    }
    expect(placed.size).toBeGreaterThan(1);
  });

  it('keeps clear of obstacles', () => {
    const obstacle = { left: 105, top: 90, right: 200, bottom: 110 };
    const placed = placeLabels([label('a', 100, 100)], 400, 300, [obstacle]);
    expect(placed.get('a')?.anchor).not.toBe('start');
  });
});

function historyModel(intelligence: number | null, blended: number | null): HistoryModel {
  return {
    name: 'Model',
    status: 'active',
    intelligence: { score: intelligence, tier: null },
    cost: { tier: null, blended, input: null, output: null, cache_read: null },
    value: { score: null, tier: null },
  };
}

describe('trendSeries', () => {
  const now: TrendPoint = { date: '2026-11-11', int: 90, val: 60, cost: 2 };

  it('ends on the current figures, replacing anything recorded today', () => {
    const entries: HistoryEntry[] = [
      { date: '2026-11-01', models: { m: historyModel(80, 2.5) } },
      { date: '2026-11-11', models: { m: historyModel(85, 2.5) } },
    ];
    expect(trendSeries(entries, 'm', now)).toEqual([
      { date: '2026-11-01', int: 80, val: null, cost: 2.5 },
      now,
    ]);
  });

  it('breaks the line on days the model was not listed, after it first appeared', () => {
    const entries: HistoryEntry[] = [
      { date: '2026-10-01', models: {} },
      { date: '2026-10-05', models: { m: historyModel(80, 2) } },
      { date: '2026-10-09', models: {} },
    ];
    expect(trendSeries(entries, 'm', now).map((point) => point.int)).toEqual([80, null, 90]);
  });

  it('is just today without any history', () => {
    expect(trendSeries([], 'm', now)).toEqual([now]);
  });
});

describe('pointAt and stepPath', () => {
  const series: TrendPoint[] = [
    { date: '2026-11-01', int: 80, val: null, cost: null },
    { date: '2026-11-05', int: 85, val: null, cost: null },
  ];

  it('finds the point in force on a day', () => {
    expect(pointAt(series, '2026-10-30')).toBeUndefined();
    expect(pointAt(series, '2026-11-03')?.int).toBe(80);
    expect(pointAt(series, '2026-11-09')?.int).toBe(85);
  });

  it('draws steps and breaks on empty ones', () => {
    expect(
      stepPath([
        { x0: 0, x1: 10, y: 5 },
        { x0: 10, x1: 20, y: 8 },
        { x0: 20, x1: 30, y: null },
        { x0: 30, x1: 40, y: 2 },
      ]),
    ).toBe('M0.0 5.0H10.0V8.0H20.0M30.0 2.0H40.0');
  });
});

/**
 * Pure helpers for the home page charts (docs/SPEC.md §7, "Home table"):
 * scales and ticks, label placement for the quadrant chart, and the score
 * history behind the trend chart.
 *
 * No DOM access and no `astro:*` imports, so they run in tests, at build
 * time and in the browser alike.
 */
import type { HistoryEntry } from './history';

/** What the bar and trend charts plot. Keys double as the `metric` URL parameter. */
export const CHART_METRICS = ['int', 'val', 'cost'] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

// ---------------------------------------------------------------------------
// Scales and ticks

/** The 1-2-5 steps (…0.1, 0.2, 0.5, 1, 2, 5, 10…) between `lo` and `hi`, inclusive. */
export function logTicks(lo: number, hi: number): number[] {
  if (!(lo > 0) || !(hi >= lo)) return [];
  const ticks: number[] = [];
  for (let exp = Math.floor(Math.log10(lo)); exp <= Math.ceil(Math.log10(hi)); exp += 1) {
    for (const mantissa of [1, 2, 5]) {
      const tick = Number((mantissa * 10 ** exp).toPrecision(12));
      if (tick >= lo * (1 - 1e-9) && tick <= hi * (1 + 1e-9)) ticks.push(tick);
    }
  }
  return ticks;
}

/**
 * A log range that holds every positive value with some room around it,
 * widened to the 1-2-5 steps just outside, so both ends get a tick.
 */
export function logDomain(values: number[]): [number, number] {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) return [0.1, 10];
  const min = Math.min(...positive) / 1.15;
  const max = Math.max(...positive) * 1.15;
  const steps = logTicks(min / 10, max * 10);
  const lo = steps.filter((step) => step <= min).at(-1) ?? min;
  const hi = steps.find((step) => step >= max) ?? max;
  return [lo, hi];
}

/**
 * A 0–100 score range zoomed to the values, in whole `step`s, with a little
 * room above and below and at least two steps tall.
 */
export function scoreDomain(values: number[], step = 10): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [0, 100];
  let lo = Math.max(0, Math.floor((Math.min(...finite) - 3) / step) * step);
  let hi = Math.min(100, Math.ceil((Math.max(...finite) + 3) / step) * step);
  while (hi - lo < step * 2) {
    if (hi < 100) hi += step;
    else lo -= step;
  }
  return [lo, hi];
}

/** Evenly spaced ticks from `lo` to `hi`. */
export function linearTicks(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  for (let tick = lo; tick <= hi + step * 1e-9; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
  }
  return ticks;
}

/**
 * A linear axis from 0 that holds `max`, with a round 1-2-5 step giving
 * about `count` intervals.
 */
export function zeroBasedAxis(max: number, count = 4): { hi: number; ticks: number[] } {
  if (!(max > 0)) return { hi: 1, ticks: [0, 1] };
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((mantissa) => mantissa * magnitude >= raw) ?? 10) * magnitude;
  const hi = Number((Math.ceil(max / step - 1e-9) * step).toPrecision(12));
  return { hi, ticks: linearTicks(0, hi, step) };
}

// ---------------------------------------------------------------------------
// Label placement

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelRequest {
  id: string;
  /** Centre of the mark the label belongs to. */
  x: number;
  y: number;
  /** Radius of that mark. */
  r: number;
  /** Size of the label text. */
  width: number;
  height: number;
}

export interface PlacedLabel {
  /** Anchor of the text: `start`, `end` or `middle` of the line at (x, y). */
  anchor: 'start' | 'middle' | 'end';
  x: number;
  /** Vertical centre of the text. */
  y: number;
  box: Box;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Put each label next to its mark without covering another label, another
 * mark or anything in `obstacles`, staying inside `width` × `height`. Labels
 * are placed in the order given, so the ones that matter most go first. A
 * label with no free spot is left out (its mark keeps its tooltip, and the
 * table lists every model anyway).
 */
export function placeLabels(
  requests: LabelRequest[],
  width: number,
  height: number,
  obstacles: Box[] = [],
): Map<string, PlacedLabel> {
  const marks = requests.map((item) => ({
    id: item.id,
    box: {
      left: item.x - item.r,
      top: item.y - item.r,
      right: item.x + item.r,
      bottom: item.y + item.r,
    },
  }));
  const taken: Box[] = [...obstacles];
  const placed = new Map<string, PlacedLabel>();

  for (const item of requests) {
    const { x, y, r, width: w, height: h } = item;
    const gap = r + 4;
    const diagonal = r + 1;
    const candidates: PlacedLabel[] = [
      { anchor: 'start', x: x + gap, y, box: box(x + gap, y - h / 2, w, h) },
      { anchor: 'end', x: x - gap, y, box: box(x - gap - w, y - h / 2, w, h) },
      {
        anchor: 'start',
        x: x + diagonal,
        y: y - diagonal - h / 2,
        box: box(x + diagonal, y - diagonal - h, w, h),
      },
      {
        anchor: 'start',
        x: x + diagonal,
        y: y + diagonal + h / 2,
        box: box(x + diagonal, y + diagonal, w, h),
      },
      {
        anchor: 'end',
        x: x - diagonal,
        y: y - diagonal - h / 2,
        box: box(x - diagonal - w, y - diagonal - h, w, h),
      },
      {
        anchor: 'end',
        x: x - diagonal,
        y: y + diagonal + h / 2,
        box: box(x - diagonal - w, y + diagonal, w, h),
      },
      { anchor: 'middle', x, y: y - gap - h / 2, box: box(x - w / 2, y - gap - h, w, h) },
      { anchor: 'middle', x, y: y + gap + h / 2, box: box(x - w / 2, y + gap, w, h) },
    ];
    const fit = candidates.find(
      (candidate) =>
        candidate.box.left >= 0 &&
        candidate.box.right <= width &&
        candidate.box.top >= 0 &&
        candidate.box.bottom <= height &&
        taken.every((other) => !overlaps(candidate.box, other)) &&
        marks.every((mark) => mark.id === item.id || !overlaps(candidate.box, mark.box)),
    );
    if (fit) {
      placed.set(item.id, fit);
      taken.push(fit.box);
    }
  }
  return placed;
}

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

// ---------------------------------------------------------------------------
// Score history

export interface TrendPoint {
  date: string;
  int: number | null;
  val: number | null;
  /** Blended price, USD per 1M tokens. */
  cost: number | null;
}

/**
 * One model's recorded scores and blended price, oldest first; each point
 * holds until the next. Days on which the model was not listed after it
 * first appeared become empty points, which break the line. `current` is
 * what the site shows now and replaces anything recorded on or after its
 * date, so the chart ends on the numbers in the table.
 */
export function trendSeries(
  entries: HistoryEntry[],
  id: string,
  current: TrendPoint,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const entry of entries) {
    if (entry.date >= current.date) break;
    const model = entry.models[id];
    if (model) {
      points.push({
        date: entry.date,
        int: model.intelligence.score,
        val: model.value.score,
        cost: model.cost.blended,
      });
    } else if (points.length > 0) {
      points.push({ date: entry.date, int: null, val: null, cost: null });
    }
  }
  points.push(current);
  return points;
}

/** The point in force on `date`: the last one recorded on or before it. */
export function pointAt(series: TrendPoint[], date: string): TrendPoint | undefined {
  let found: TrendPoint | undefined;
  for (const point of series) {
    if (point.date > date) break;
    found = point;
  }
  return found;
}

/**
 * SVG path of a step line. Each step runs flat from `x0` to `x1` at `y`
 * and joins the next with a vertical; a step without `y` breaks the line.
 */
export function stepPath(steps: { x0: number; x1: number; y: number | null }[]): string {
  let path = '';
  let drawing = false;
  for (const step of steps) {
    if (step.y === null) {
      drawing = false;
      continue;
    }
    const y = step.y.toFixed(1);
    path += drawing ? `V${y}` : `M${step.x0.toFixed(1)} ${y}`;
    path += `H${step.x1.toFixed(1)}`;
    drawing = true;
  }
  return path;
}

const DAY = 86_400_000;

/** Days since the epoch of a `YYYY-MM-DD` date, for a time axis. */
export function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
}

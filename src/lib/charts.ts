import type { HistoryEntry } from './history';

export const CHART_METRICS = ['int', 'val', 'cost'] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

export const EVEN_LOG_STEPS = [1, 3];

export function logTicks(lo: number, hi: number, steps: number[] = [1, 2, 5]): number[] {
  if (!(lo > 0) || !(hi >= lo)) return [];
  const ticks: number[] = [];
  for (let exp = Math.floor(Math.log10(lo)); exp <= Math.ceil(Math.log10(hi)); exp += 1) {
    for (const mantissa of steps) {
      const tick = Number((mantissa * 10 ** exp).toPrecision(12));
      if (tick >= lo * (1 - 1e-9) && tick <= hi * (1 + 1e-9)) ticks.push(tick);
    }
  }
  return ticks;
}

export function evenLogTicks(
  lo: number,
  hi: number,
  span: (tick: number) => [number, number],
  gap = 6,
): number[] {
  for (const steps of [EVEN_LOG_STEPS, [1]]) {
    const ticks = logTicks(lo, hi, steps);
    const spans = ticks.map(span).sort((a, b) => a[0] - b[0]);
    if (spans.every((current, i) => i === 0 || current[0] >= spans[i - 1][1] + gap)) return ticks;
  }
  return logTicks(lo, hi, [1]);
}

export function logDomain(values: number[], steps: number[] = [1, 2, 5]): [number, number] {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) return [0.1, 10];
  const min = Math.min(...positive) / 1.15;
  const max = Math.max(...positive) * 1.15;
  const candidates = logTicks(min / 10, max * 10, steps);
  const lo = candidates.filter((step) => step <= min).at(-1) ?? min;
  const hi = candidates.find((step) => step >= max) ?? max;
  return [lo, hi];
}

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

export function linearTicks(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  for (let tick = lo; tick <= hi + step * 1e-9; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
  }
  return ticks;
}

export function zeroBasedAxis(max: number, count = 4): { hi: number; ticks: number[] } {
  if (!(max > 0)) return { hi: 1, ticks: [0, 1] };
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((mantissa) => mantissa * magnitude >= raw) ?? 10) * magnitude;
  const hi = Number((Math.ceil(max / step - 1e-9) * step).toPrecision(12));
  return { hi, ticks: linearTicks(0, hi, step) };
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelRequest {
  id: string;
  x: number;
  y: number;
  r: number;
  width: number;
  height: number;
}

export interface PlacedLabel {
  anchor: 'start' | 'middle' | 'end';
  x: number;
  y: number;
  box: Box;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export function placeLabels(
  requests: LabelRequest[],
  width: number,
  height: number,
  obstacles: Box[] = [],
): Map<string, PlacedLabel> {
  const marks = requests.map((item) =>
    box(item.x - item.r, item.y - item.r, item.r * 2, item.r * 2),
  );
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
    const fit = candidates.find((candidate) => {
      const own = distanceTo(candidate.box, x, y);
      return (
        candidate.box.left >= 0 &&
        candidate.box.right <= width &&
        candidate.box.top >= 0 &&
        candidate.box.bottom <= height &&
        taken.every((other) => !overlaps(candidate.box, other)) &&
        requests.every(
          (other, index) =>
            other.id === item.id ||
            (!overlaps(candidate.box, marks[index]) &&
              distanceTo(candidate.box, other.x, other.y) > own),
        )
      );
    });
    if (fit) {
      placed.set(item.id, fit);
      taken.push(fit.box);
    }
  }
  return placed;
}

export function clearOf(candidates: Box[], obstacles: Box[]): Box {
  return (
    candidates.find((candidate) => obstacles.every((other) => !overlaps(candidate, other))) ??
    candidates[0]
  );
}

function distanceTo(area: Box, x: number, y: number): number {
  const dx = Math.max(area.left - x, 0, x - area.right);
  const dy = Math.max(area.top - y, 0, y - area.bottom);
  return Math.hypot(dx, dy);
}

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

export interface TrendPoint {
  date: string;
  int: number | null;
  val: number | null;
  cost: number | null;
}

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

export function pointAt(series: TrendPoint[], date: string): TrendPoint | undefined {
  let found: TrendPoint | undefined;
  for (const point of series) {
    if (point.date > date) break;
    found = point;
  }
  return found;
}

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

export function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
}

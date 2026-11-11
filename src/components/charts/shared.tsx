import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Dictionary } from '@/i18n';
import type { ChartMetric } from '@/lib/charts';
import { formatPrice, formatScore } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ModelRow } from '../ModelTable';

export type ChartStrings = Pick<Dictionary, 'chart' | 'tier' | 'empty' | 'rating'>;

/**
 * Width of an element in CSS pixels, kept up to date as it resizes. Null
 * until the first measurement, so charts draw only at their real size and
 * their text and strokes never scale.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

let canvas: CanvasRenderingContext2D | null | undefined;

/** Rendered width of a line of text in the page's font, for label placement. */
export function textWidth(text: string, size: number, weight = 400): number {
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * size * 0.6;
  canvas.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
  return canvas.measureText(text).width;
}

/** A metric's figure as the site prints it. */
export function formatMetric(metric: ChartMetric, value: number): string {
  return metric === 'cost' ? formatPrice(value) : formatScore(value);
}

/** The figure a model has for a metric now, or null. */
export function metricOf(model: ModelRow, metric: ChartMetric): number | null {
  if (metric === 'int') return model.intelligence.score;
  if (metric === 'val') return model.value.score;
  return model.cost.blended;
}

/** Name of a metric, as the charts' metric picker shows it. */
export function metricLabel(metric: ChartMetric, strings: ChartStrings): string {
  if (metric === 'int') return strings.rating.intelligence;
  if (metric === 'val') return strings.rating.value;
  return strings.chart.blended;
}

/** The three ratings of a model as label / figure / tier rows, for tooltips. */
export function ratingRows(model: ModelRow, strings: ChartStrings) {
  const { tier, empty, rating, chart } = strings;
  const { intelligence, cost, value } = model;
  return [
    {
      label: rating.intelligence,
      figure: intelligence.score === null ? empty.unrated : formatScore(intelligence.score),
      tier: intelligence.tier ? tier.intelligence[intelligence.tier] : null,
    },
    {
      label: chart.blended,
      figure: cost.free
        ? empty.free
        : cost.blended === null
          ? empty.noPrice
          : formatPrice(cost.blended),
      tier: cost.tier ? tier.cost[cost.tier] : null,
    },
    {
      label: rating.value,
      figure: value.score === null ? empty.unrated : formatScore(value.score),
      tier: value.tier ? tier.value[value.tier] : null,
    },
  ];
}

/** Plain-text summary of a model's ratings, for accessible names and titles. */
export function ratingSummary(model: ModelRow, strings: ChartStrings): string {
  const rows = ratingRows(model, strings).map(
    (row) => `${row.label} ${row.figure}${row.tier ? ` (${row.tier})` : ''}`,
  );
  return `${model.name}: ${rows.join(', ')}`;
}

/**
 * A tooltip pinned to a point inside a chart, flipped to the left of the
 * point on the right half so it stays inside the chart.
 */
export function ChartTooltip({
  x,
  y,
  width,
  children,
  className,
}: {
  x: number;
  y: number;
  /** Width of the chart, to decide which side the tooltip goes. */
  width: number;
  children: ReactNode;
  className?: string;
}) {
  const flip = x > width / 2;
  return (
    <div
      role="presentation"
      className={cn(
        'bg-popover text-popover-foreground pointer-events-none absolute z-20 w-max max-w-[16rem] rounded-lg border px-3 py-2 text-xs shadow-md',
        className,
      )}
      style={{
        left: x,
        top: y,
        transform: flip ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)',
      }}
    >
      {children}
    </div>
  );
}

/** Tooltip body listing a model's three ratings, figures first. */
export function RatingTooltipBody({ model, strings }: { model: ModelRow; strings: ChartStrings }) {
  return (
    <>
      <p className="mb-1.5 font-medium">{model.name}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {ratingRows(model, strings).map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="num">
              <span className="font-medium">{row.figure}</span>
              {row.tier && <span className="text-muted-foreground"> · {row.tier}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

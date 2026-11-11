import { ImageDown } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { Dictionary } from '@/i18n';
import { chartImageName, exportChartImage } from '@/lib/chart-image';
import type { ChartMetric } from '@/lib/charts';
import { formatPrice, formatScore } from '@/lib/format';
import { LOGO_EYE, LOGO_RADIUS, LOGO_VIEWBOX } from '@/lib/logo';
import { SITE_HOST } from '@/lib/share';
import { cn } from '@/lib/utils';
import type { ModelRow } from '../ModelTable';

export type ChartStrings = Pick<Dictionary, 'chart' | 'tier' | 'empty' | 'rating'>;

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

export function textWidth(text: string, size: number, weight = 400): number {
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * size * 0.6;
  canvas.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`;
  return canvas.measureText(text).width;
}

export function formatMetric(metric: ChartMetric, value: number): string {
  return metric === 'cost' ? formatPrice(value) : formatScore(value);
}

export function metricOf(model: ModelRow, metric: ChartMetric): number | null {
  if (metric === 'int') return model.intelligence.score;
  if (metric === 'val') return model.value.score;
  return model.cost.blended;
}

export function metricLabel(metric: ChartMetric, strings: ChartStrings): string {
  if (metric === 'int') return strings.rating.intelligence;
  if (metric === 'val') return strings.rating.value;
  return strings.chart.blended;
}

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

export function ratingSummary(model: ModelRow, strings: ChartStrings): string {
  const rows = ratingRows(model, strings).map(
    (row) => `${row.label} ${row.figure}${row.tier ? ` (${row.tier})` : ''}`,
  );
  return `${model.name}: ${rows.join(', ')}`;
}

export function ChartTooltip({
  x,
  y,
  width,
  children,
  className,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
  className?: string;
}) {
  const flip = x > width / 2;
  return (
    <div
      role="presentation"
      data-export-ignore
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

export function ChartWatermark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-chart-watermark
      className={cn(
        'text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs font-medium',
        className,
      )}
    >
      <svg viewBox={LOGO_VIEWBOX} className="size-3.5 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx={LOGO_RADIUS} className="fill-expense" />
        <path d={LOGO_EYE} fillRule="evenodd" className="fill-card" />
      </svg>
      {SITE_HOST}
    </span>
  );
}

export function ChartFooter({ children }: { children?: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-dashed pt-2.5">
      <div className="text-muted-foreground min-w-0 flex-1 basis-64 space-y-1 text-xs">
        {children}
      </div>
      <ChartWatermark className="ml-auto" />
    </div>
  );
}

type ExportState = 'idle' | 'busy' | 'done' | 'failed';

export function ExportButton({
  name,
  strings,
}: {
  name: string[];
  strings: ChartStrings['chart'];
}) {
  const [state, setState] = useState<ExportState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = async (event: MouseEvent<HTMLButtonElement>) => {
    const figure = event.currentTarget.closest('figure');
    if (!figure) return;
    window.clearTimeout(timer.current);
    setState('busy');
    try {
      await exportChartImage(figure, chartImageName(name));
      setState('done');
    } catch {
      setState('failed');
    }
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };

  const result =
    state === 'done' ? strings.exported : state === 'failed' ? strings.exportFailed : '';
  return (
    <span data-export-ignore className="-my-1 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 sm:h-7"
        disabled={state === 'busy'}
        onClick={run}
      >
        <ImageDown aria-hidden="true" />
        {result || strings.export}
      </Button>
      <span className="sr-only" aria-live="polite">
        {result}
      </span>
    </span>
  );
}

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

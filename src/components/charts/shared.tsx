import { Check, ImageDown, Info, X } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import type { Dictionary } from '@/i18n';
import {
  chartImageName,
  EXPORT_WIDTH,
  exportChartImage,
  settle,
  withOffscreenHost,
} from '@/lib/chart-image';
import type { ChartMetric } from '@/lib/charts';
import { formatPrice, formatScore } from '@/lib/format';
import { LOGO_EYE, LOGO_RADIUS, LOGO_VIEWBOX } from '@/lib/logo';
import { SITE_HOST } from '@/lib/share';
import { cn } from '@/lib/utils';
import type { ModelRow } from '../ModelTable';

export interface MethodLink {
  href: string;
  label: string;
}

export type ChartStrings = Pick<Dictionary, 'chart' | 'tier' | 'empty' | 'rating'> & {
  method: MethodLink;
};

export function ChartCaption({
  text,
  link,
  section,
}: {
  text: string;
  link: MethodLink;
  section: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm font-medium">{text}</span>
      <a
        href={`${link.href}#${section}`}
        data-export-ignore
        className="text-muted-foreground hover:text-foreground inline-flex shrink-0 transition-colors"
        aria-label={link.label}
        title={link.label}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </a>
    </span>
  );
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    setWidth(Math.floor(element.clientWidth - padding));
  }, []);
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

export function ChartFigure({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <figure className="bg-card rounded-xl border px-3 pt-3 pb-3 @xl:px-4">{children}</figure>
    </div>
  );
}

type ExportState = 'idle' | 'busy' | 'done' | 'failed';

async function exportRendered(chart: ReactNode, filename: string): Promise<void> {
  await withOffscreenHost(EXPORT_WIDTH.chart, async (host) => {
    const root = createRoot(host);
    try {
      flushSync(() => root.render(chart));
      await settle();
      const figure = host.querySelector('figure');
      if (!figure) throw new Error('The chart did not render');
      await exportChartImage(figure, filename);
    } finally {
      root.unmount();
    }
  });
}

export function ExportButton({
  name,
  strings,
  render,
}: {
  name: string[];
  strings: ChartStrings['chart'];
  render: () => ReactNode;
}) {
  const [state, setState] = useState<ExportState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = async () => {
    window.clearTimeout(timer.current);
    setState('busy');
    try {
      await exportRendered(render(), chartImageName(name));
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
        size="icon-sm"
        className="text-foreground size-8 sm:size-7"
        aria-label={strings.export}
        title={result || strings.export}
        disabled={state === 'busy'}
        onClick={run}
      >
        {state === 'done' ? (
          <Check aria-hidden="true" />
        ) : state === 'failed' ? (
          <X aria-hidden="true" className="text-destructive" />
        ) : (
          <ImageDown aria-hidden="true" />
        )}
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

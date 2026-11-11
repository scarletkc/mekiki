import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmt } from '@/i18n/fmt';
import {
  dayNumber,
  linearTicks,
  logDomain,
  logTicks,
  pointAt,
  scoreDomain,
  stepPath,
  type ChartMetric,
  type TrendPoint,
} from '@/lib/charts';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ModelRow } from '../ModelTable';
import {
  ChartCaption,
  ChartFigure,
  ChartFooter,
  ChartTooltip,
  ExportButton,
  formatMetric,
  metricLabel,
  useWidth,
  type ChartStrings,
} from './shared';

export interface TrendData {
  start: string;
  end: string;
  days: number;
  series: Record<string, TrendPoint[]>;
}

const PAD = { top: 10, right: 52, bottom: 22, left: 36 };
const HEIGHT = 300;

function figureOf(point: TrendPoint | undefined, metric: ChartMetric): number | null {
  const value = point?.[metric] ?? null;
  return metric === 'cost' && value !== null && value <= 0 ? null : value;
}

export function TrendChart({
  models,
  metric,
  data,
  strings,
  initialPinned = null,
}: {
  models: ModelRow[];
  metric: ChartMetric;
  data: TrendData;
  strings: ChartStrings;
  initialPinned?: string | null;
}) {
  const { chart } = strings;
  const label = metricLabel(metric, strings);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [pinned, setPinned] = useState<string | null>(initialPinned);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const figure = (point: TrendPoint | undefined) => figureOf(point, metric);

  const lines = useMemo(
    () =>
      models
        .map((model) => ({ model, points: data.series[model.id] ?? [] }))
        .filter((line) => line.points.some((point) => figureOf(point, metric) !== null)),
    [models, data, metric],
  );

  const layout = useMemo(() => {
    if (width === null || lines.length === 0) return null;
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const values = lines.flatMap((line) =>
      line.points
        .map((point) => figureOf(point, metric))
        .filter((value): value is number => value !== null),
    );
    const log = metric === 'cost';
    const [lo, hi] = log ? logDomain(values) : scoreDomain(values);
    const scale = log
      ? (value: number) => (Math.log(hi) - Math.log(value)) / (Math.log(hi) - Math.log(lo))
      : (value: number) => (hi - value) / (hi - lo);
    const y = (value: number) => PAD.top + scale(value) * plotHeight;
    const first = dayNumber(data.start);
    const span = Math.max(1, dayNumber(data.end) - first);
    const x = (date: string) => PAD.left + ((dayNumber(date) - first) / span) * plotWidth;

    const paths = lines.map((line) => ({
      id: line.model.id,
      d: stepPath(
        line.points.map((point, index) => {
          const value = figureOf(point, metric);
          return {
            x0: x(point.date),
            x1: x(line.points[index + 1]?.date ?? data.end),
            y: value === null ? null : y(value),
          };
        }),
      ),
    }));
    const dates = [
      ...new Set(lines.flatMap((line) => line.points.map((point) => point.date))),
    ].sort();
    return {
      plotWidth,
      plotHeight,
      x,
      y,
      paths,
      dates,
      ticks: log ? logTicks(lo, hi) : linearTicks(lo, hi, 10),
    };
  }, [width, lines, data, metric]);

  if (data.days < 2) {
    return (
      <figure className="bg-card rounded-xl border px-4 py-3">
        <figcaption className="text-sm font-medium">
          {fmt(chart.trendCaption, { metric: label })}
        </figcaption>
        <p className="text-muted-foreground grid h-40 place-items-center text-center text-sm">
          {chart.trendEmpty}
        </p>
      </figure>
    );
  }

  const focus =
    lines.find((line) => line.model.id === (hovered ?? pinned))?.model ?? lines[0]?.model ?? null;
  const focusPath = layout?.paths.find((path) => path.id === focus?.id);
  const focusEnd = focus ? figure(pointAt(data.series[focus.id] ?? [], data.end)) : null;
  const accent = metric === 'cost' ? 'stroke-expense' : 'stroke-quality';
  const accentFill = metric === 'cost' ? 'fill-expense' : 'fill-quality';

  const cursorDate = layout && cursor !== null ? layout.dates[cursor] : undefined;
  const readout = cursorDate
    ? lines
        .map((line) => ({ model: line.model, value: figure(pointAt(line.points, cursorDate)) }))
        .filter((row): row is { model: ModelRow; value: number } => row.value !== null)
        .sort((a, b) => b.value - a.value)
    : [];

  const track = (event: PointerEvent<SVGRectElement>) => {
    if (!layout) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left + PAD.left;
    const py = event.clientY - bounds.top + PAD.top;
    let index = 0;
    layout.dates.forEach((date, i) => {
      if (Math.abs(layout.x(date) - px) < Math.abs(layout.x(layout.dates[index]!) - px)) index = i;
    });
    setCursor(index);
    const date = layout.dates[index]!;
    let nearest: string | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const value = figure(pointAt(line.points, date));
      if (value === null) continue;
      const gap = Math.abs(layout.y(value) - py);
      if (gap < distance) {
        distance = gap;
        nearest = line.model.id;
      }
    }
    setHovered(nearest);
  };

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!layout) return;
    const last = layout.dates.length - 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      setCursor((current) =>
        Math.min(last, Math.max(0, (current ?? last + (delta > 0 ? -1 : 1)) + delta)),
      );
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setCursor(event.key === 'Home' ? 0 : last);
    } else if (event.key === 'Escape') {
      setCursor(null);
    }
  };

  const tickText = (tick: number) => (metric === 'cost' ? formatPrice(tick) : String(tick));

  return (
    <ChartFigure>
      <figcaption className="mb-2 flex items-start justify-between gap-3">
        <ChartCaption text={fmt(chart.trendCaption, { metric: label })} />
        <ExportButton
          name={['trend', metric]}
          strings={chart}
          render={() => (
            <TrendChart
              models={models}
              metric={metric}
              data={data}
              strings={strings}
              initialPinned={pinned}
            />
          )}
        />
      </figcaption>
      <div
        ref={ref}
        className="focus-visible:outline-ring relative rounded-sm outline-offset-4 focus-visible:outline-2"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="slider"
        aria-label={fmt(chart.trendCaption, { metric: label })}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, (layout?.dates.length ?? 1) - 1)}
        aria-valuenow={cursor ?? Math.max(0, (layout?.dates.length ?? 1) - 1)}
        aria-valuetext={
          cursorDate
            ? `${cursorDate}: ${readout.map((row) => `${row.model.name} ${formatMetric(metric, row.value)}`).join(', ')}`
            : `${data.start} – ${data.end}`
        }
        onKeyDown={step}
        onBlur={() => setCursor(null)}
      >
        {layout && width !== null && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            <g className="stroke-border" strokeWidth="1" shapeRendering="crispEdges">
              {layout.ticks.map((tick) => (
                <line
                  key={tick}
                  x1={PAD.left}
                  x2={PAD.left + layout.plotWidth}
                  y1={layout.y(tick)}
                  y2={layout.y(tick)}
                />
              ))}
            </g>
            <g className="fill-muted-foreground" fontSize="11">
              {layout.ticks.map((tick) => (
                <text
                  key={tick}
                  x={PAD.left - 6}
                  y={layout.y(tick)}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="num"
                >
                  {tickText(tick)}
                </text>
              ))}
              <text x={PAD.left} y={HEIGHT - 6} className="num">
                {data.start}
              </text>
              <text x={PAD.left + layout.plotWidth} y={HEIGHT - 6} textAnchor="end" className="num">
                {data.end}
              </text>
            </g>

            <g
              fill="none"
              className="stroke-muted-foreground"
              strokeOpacity="0.4"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              {layout.paths
                .filter((path) => path.id !== focus?.id)
                .map((path) => (
                  <path key={path.id} d={path.d} />
                ))}
            </g>
            {focusPath && (
              <path
                d={focusPath.d}
                fill="none"
                className={accent}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {focus && focusEnd !== null && (
              <g>
                <circle
                  cx={PAD.left + layout.plotWidth}
                  cy={layout.y(focusEnd)}
                  r="4"
                  className={cn(accentFill, 'stroke-card')}
                  strokeWidth="2"
                />
                <text
                  x={PAD.left + layout.plotWidth + 8}
                  y={layout.y(focusEnd)}
                  dominantBaseline="central"
                  fontSize="12"
                  fontWeight="500"
                  className="fill-foreground num"
                >
                  {formatMetric(metric, focusEnd)}
                </text>
              </g>
            )}

            {cursorDate && (
              <line
                data-export-ignore
                x1={layout.x(cursorDate)}
                x2={layout.x(cursorDate)}
                y1={PAD.top}
                y2={PAD.top + layout.plotHeight}
                className="stroke-muted-foreground"
                strokeWidth="1"
                shapeRendering="crispEdges"
              />
            )}

            <rect
              x={PAD.left}
              y={PAD.top}
              width={layout.plotWidth}
              height={layout.plotHeight}
              fill="transparent"
              onPointerMove={track}
              onPointerDown={track}
              onPointerLeave={(event) => {
                if (event.pointerType === 'touch') return;
                setCursor(null);
                setHovered(null);
              }}
            />
          </svg>
        )}
        {layout && width !== null && cursorDate && readout.length > 0 && (
          <ChartTooltip x={layout.x(cursorDate)} y={PAD.top + layout.plotHeight / 2} width={width}>
            <p className="text-muted-foreground num mb-1.5">{cursorDate}</p>
            <ul className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
              {readout.map((row) => (
                <li key={row.model.id} className="contents">
                  <span className="num font-medium">{formatMetric(metric, row.value)}</span>
                  <span
                    className={cn(
                      'truncate',
                      row.model.id === focus?.id
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {row.model.name}
                  </span>
                </li>
              ))}
            </ul>
          </ChartTooltip>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {lines.map(({ model }) => {
          const isFocus = model.id === focus?.id;
          return (
            <li key={model.id}>
              <button
                type="button"
                aria-pressed={pinned === model.id}
                title={fmt(chart.follow, { name: model.name })}
                onClick={() => setPinned((current) => (current === model.id ? null : model.id))}
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') setHovered(model.id);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== 'touch') setHovered(null);
                }}
                onFocus={() => setHovered(model.id)}
                onBlur={() => setHovered(null)}
                className={cn(
                  'focus-visible:ring-ring/50 flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors outline-none focus-visible:ring-[3px]',
                  isFocus
                    ? 'text-foreground bg-muted'
                    : 'text-muted-foreground hover:text-foreground',
                  pinned === model.id && 'border-foreground/40',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-0.5 w-3 rounded-full',
                    isFocus
                      ? metric === 'cost'
                        ? 'bg-expense'
                        : 'bg-quality'
                      : 'bg-muted-foreground/50',
                  )}
                />
                {model.name}
              </button>
            </li>
          );
        })}
      </ul>
      <ChartFooter />
    </ChartFigure>
  );
}

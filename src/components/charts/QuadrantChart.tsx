import { useMemo, useRef, useState } from 'react';
import { fmt } from '@/i18n/fmt';
import { linearTicks, logDomain, logTicks, placeLabels, scoreDomain, type Box } from '@/lib/charts';
import { formatPrice } from '@/lib/format';
import { scoringConfig } from '@/lib/scoring.config';
import { cn } from '@/lib/utils';
import type { ModelRow } from '../ModelTable';
import {
  ChartTooltip,
  RatingTooltipBody,
  ratingSummary,
  textWidth,
  useWidth,
  type ChartStrings,
} from './shared';

const SPLIT_SCORE = scoringConfig.intelligence.tiers.high;
const SPLIT_PRICE = scoringConfig.cost.tiers.mid;

const DOT = 5;
const HIT = 14;
const LABEL_SIZE = 11;
const LABEL_HEIGHT = 14;
const LABEL_RING = DOT + 2;
const PAD = { top: LABEL_RING + 1 + LABEL_HEIGHT + 2, right: 12, bottom: 22, left: 32 };

export function QuadrantChart({ models, strings }: { models: ModelRow[]; strings: ChartStrings }) {
  const { chart } = strings;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const lastPointer = useRef<string>('mouse');

  const [plotted, skipped] = useMemo(() => {
    const onAxis = (model: ModelRow) =>
      model.intelligence.score !== null && model.cost.blended !== null && model.cost.blended > 0;
    return [models.filter(onAxis), models.filter((model) => !onAxis(model))];
  }, [models]);

  const height = PAD.top + PAD.bottom + (width !== null && width < 560 ? 310 : 390);
  const layout = useMemo(() => {
    if (width === null) return null;
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = height - PAD.top - PAD.bottom;
    const prices = plotted.map((model) => model.cost.blended!);
    const scores = plotted.map((model) => model.intelligence.score!);
    const [xLo, xHi] = logDomain([...prices, SPLIT_PRICE]);
    const [yLo, yHi] = scoreDomain([...scores, SPLIT_SCORE]);
    const x = (price: number) =>
      PAD.left + ((Math.log(price) - Math.log(xLo)) / (Math.log(xHi) - Math.log(xLo))) * plotWidth;
    const y = (score: number) => PAD.top + ((yHi - score) / (yHi - yLo)) * plotHeight;

    const centres = plotted.map((model) => ({
      model,
      x: x(model.cost.blended!),
      y: y(model.intelligence.score!),
    }));
    const points = centres.map((point) => {
      const nearest = Math.min(
        ...centres
          .filter((other) => other !== point)
          .map((other) => Math.hypot(other.x - point.x, other.y - point.y)),
      );
      return { ...point, hit: Math.max(DOT + 1, Math.min(HIT, nearest / 2)) };
    });

    const corner = (text: string, side: 'left' | 'right', edge: 'top' | 'bottom') => {
      const w = textWidth(text, LABEL_SIZE);
      const left = side === 'left' ? PAD.left + 6 : PAD.left + plotWidth - 6 - w;
      const top = edge === 'top' ? PAD.top + 4 : PAD.top + plotHeight - 4 - LABEL_HEIGHT;
      return { text, side, box: { left, top, right: left + w, bottom: top + LABEL_HEIGHT } };
    };
    const corners = [
      corner(chart.areas.smartCheap, 'left', 'top'),
      corner(chart.areas.smartPricey, 'right', 'top'),
      corner(chart.areas.basicCheap, 'left', 'bottom'),
      corner(chart.areas.basicPricey, 'right', 'bottom'),
    ];

    const byScore = [...points].sort(
      (a, b) => b.model.intelligence.score! - a.model.intelligence.score!,
    );
    const labels = placeLabels(
      byScore.map((point) => ({
        id: point.model.id,
        x: point.x,
        y: point.y,
        r: LABEL_RING,
        width: textWidth(point.model.name, LABEL_SIZE, 500),
        height: LABEL_HEIGHT,
      })),
      width,
      height - PAD.bottom,
      corners.map((item) => item.box satisfies Box),
    );

    return {
      plotWidth,
      plotHeight,
      x,
      y,
      xTicks: logTicks(xLo, xHi),
      yTicks: linearTicks(yLo, yHi, 10),
      points,
      corners,
      labels,
    };
  }, [width, height, plotted, chart.areas]);

  const activePoint = layout?.points.find((point) => point.model.id === active);

  return (
    <figure className="bg-card rounded-xl border px-3 pt-3 pb-3 sm:px-4">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{chart.quadrantCaption}</span>
        <span className="text-muted-foreground text-xs">{strings.rating.intelligence} ↑</span>
      </figcaption>
      <div ref={ref} className="relative" style={{ height }}>
        {layout && width !== null && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            <g className="stroke-border" strokeWidth="1" shapeRendering="crispEdges">
              {layout.yTicks.map((tick) => (
                <line
                  key={`y${tick}`}
                  x1={PAD.left}
                  x2={PAD.left + layout.plotWidth}
                  y1={layout.y(tick)}
                  y2={layout.y(tick)}
                />
              ))}
              {layout.xTicks.map((tick) => (
                <line
                  key={`x${tick}`}
                  x1={layout.x(tick)}
                  x2={layout.x(tick)}
                  y1={PAD.top}
                  y2={PAD.top + layout.plotHeight}
                />
              ))}
            </g>
            <g
              className="stroke-muted-foreground"
              strokeOpacity="0.55"
              strokeWidth="1"
              shapeRendering="crispEdges"
            >
              <line
                x1={layout.x(SPLIT_PRICE)}
                x2={layout.x(SPLIT_PRICE)}
                y1={PAD.top}
                y2={PAD.top + layout.plotHeight}
              />
              <line
                x1={PAD.left}
                x2={PAD.left + layout.plotWidth}
                y1={layout.y(SPLIT_SCORE)}
                y2={layout.y(SPLIT_SCORE)}
              />
            </g>

            <g
              className="fill-muted-foreground stroke-card"
              fontSize="11"
              strokeWidth="3"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {layout.yTicks.map((tick) => (
                <text
                  key={tick}
                  x={PAD.left - 6}
                  y={layout.y(tick)}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="num"
                >
                  {tick}
                </text>
              ))}
              {layout.xTicks.map((tick, index) => (
                <text
                  key={tick}
                  x={layout.x(tick)}
                  y={height - 6}
                  textAnchor={
                    index === 0 ? 'start' : index === layout.xTicks.length - 1 ? 'end' : 'middle'
                  }
                  className="num"
                >
                  {formatPrice(tick)}
                </text>
              ))}
              {layout.corners.map((item) => (
                <text
                  key={item.text}
                  x={item.side === 'left' ? item.box.left : item.box.right}
                  y={(item.box.top + item.box.bottom) / 2}
                  textAnchor={item.side === 'left' ? 'start' : 'end'}
                  dominantBaseline="central"
                >
                  {item.text}
                </text>
              ))}
            </g>

            <g
              className="fill-foreground stroke-card"
              fontSize={LABEL_SIZE}
              fontWeight="500"
              strokeWidth="3"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {layout.points.map(({ model }) => {
                const label = layout.labels.get(model.id);
                if (!label) return null;
                return (
                  <text
                    key={model.id}
                    x={label.x}
                    y={label.y}
                    textAnchor={label.anchor}
                    dominantBaseline="central"
                    className={cn(
                      'transition-opacity',
                      active !== null && active !== model.id && 'opacity-40',
                    )}
                  >
                    {model.name}
                  </text>
                );
              })}
            </g>
          </svg>
        )}
        {layout && width !== null && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 overflow-visible"
            aria-label={chart.quadrantCaption}
            onClick={(event) => {
              if (event.target === event.currentTarget) setActive(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setActive(null);
            }}
          >
            {layout.points.map(({ model, x, y, hit }) => {
              const isActive = active === model.id;
              return (
                <a
                  key={model.id}
                  href={model.href}
                  aria-label={ratingSummary(model, strings)}
                  className="group/dot outline-none"
                  onPointerDown={(event) => {
                    lastPointer.current = event.pointerType;
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'touch') setActive(model.id);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType !== 'touch') {
                      setActive((current) => (current === model.id ? null : current));
                    }
                  }}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(':focus-visible')) setActive(model.id);
                  }}
                  onBlur={() => setActive((current) => (current === model.id ? null : current))}
                  onClick={(event) => {
                    if (lastPointer.current === 'touch' && active !== model.id) {
                      event.preventDefault();
                      setActive(model.id);
                    }
                  }}
                >
                  <circle cx={x} cy={y} r={hit} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? DOT + 1.5 : DOT}
                    className="fill-quality stroke-card group-focus-visible/dot:stroke-ring transition-[r]"
                    strokeWidth="2"
                  />
                </a>
              );
            })}
          </svg>
        )}
        {activePoint && width !== null && (
          <ChartTooltip x={activePoint.x} y={activePoint.y} width={width}>
            <RatingTooltipBody model={activePoint.model} strings={strings} />
          </ChartTooltip>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-center text-xs">{chart.priceAxis}</p>
      <div className="text-muted-foreground mt-3 space-y-1 border-t border-dashed pt-2.5 text-xs">
        <p>
          {fmt(chart.dividers, {
            score: SPLIT_SCORE,
            price: formatPrice(SPLIT_PRICE),
          })}
        </p>
        {skipped.length > 0 && (
          <p>{fmt(chart.notPlotted, { names: skipped.map((model) => model.name).join(', ') })}</p>
        )}
      </div>
    </figure>
  );
}

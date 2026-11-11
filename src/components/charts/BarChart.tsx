import { useMemo } from 'react';
import { fmt } from '@/i18n/fmt';
import { linearTicks, zeroBasedAxis, type ChartMetric } from '@/lib/charts';
import { formatPrice } from '@/lib/format';
import { COST_TIERS, scoringConfig } from '@/lib/scoring.config';
import { cn } from '@/lib/utils';
import type { ModelRow } from '../ModelTable';
import {
  ChartCaption,
  ChartFigure,
  ChartFooter,
  ExportButton,
  formatMetric,
  metricLabel,
  metricOf,
  ratingSummary,
  textWidth,
  useWidth,
  type ChartStrings,
} from './shared';

const FIGURE_ROOM = 60;
const at = (fraction: number) => `calc((100% - ${FIGURE_ROOM}px) * ${fraction})`;

function tierStarts(metric: ChartMetric, strings: ChartStrings) {
  if (metric === 'cost') {
    const bounds = scoringConfig.cost.tiers;
    return [
      { value: 0, label: strings.tier.cost.very_low },
      ...COST_TIERS.slice(0, -1).map((key, index) => ({
        value: bounds[key as keyof typeof bounds],
        label: strings.tier.cost[COST_TIERS[index + 1]!],
      })),
    ];
  }
  const kind = metric === 'int' ? 'intelligence' : 'value';
  const tiers = scoringConfig[kind].tiers;
  return [
    { value: 0, label: strings.tier[kind].very_low },
    ...(['low', 'mid', 'high', 'top'] as const).map((key) => ({
      value: tiers[key],
      label: strings.tier[kind][key],
    })),
  ];
}

export function BarChart({
  models,
  metric,
  strings,
}: {
  models: ModelRow[];
  metric: ChartMetric;
  strings: ChartStrings;
}) {
  const { chart, empty } = strings;
  const label = metricLabel(metric, strings);
  const [trackRef, trackWidth] = useWidth<HTMLSpanElement>();
  const fill = metric === 'cost' ? 'bg-expense' : 'bg-quality';

  const { ranked, missing, hi, ticks, tiers } = useMemo(() => {
    const withFigure = models.filter((model) => metricOf(model, metric) !== null);
    const ranked = [...withFigure].sort((a, b) => metricOf(b, metric)! - metricOf(a, metric)!);
    const missing = models.filter((model) => metricOf(model, metric) === null);
    const axis =
      metric === 'cost'
        ? zeroBasedAxis(Math.max(0, ...ranked.map((model) => metricOf(model, metric)!)))
        : { hi: 100, ticks: linearTicks(0, 100, 25) };
    const tiers = tierStarts(metric, strings).filter((tier) => tier.value < axis.hi);
    return { ranked, missing, hi: axis.hi, ticks: axis.ticks, tiers };
  }, [models, metric, strings]);

  const showTiers = useMemo(() => {
    if (trackWidth === null) return false;
    const span = trackWidth - FIGURE_ROOM;
    return tiers.every((tier, index) => {
      const next = tiers[index + 1];
      const end = next ? span * (next.value / hi) - 6 : trackWidth;
      return span * (tier.value / hi) + 4 + textWidth(tier.label, 11) <= end;
    });
  }, [tiers, hi, trackWidth]);

  const grid =
    'grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 @xl:grid-cols-[11rem_minmax(0,1fr)]';
  const hairlines = showTiers && (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {tiers.slice(1).map((tier) => (
        <span
          key={tier.value}
          className="bg-border absolute inset-y-0 w-px"
          style={{ left: at(tier.value / hi) }}
        />
      ))}
    </span>
  );

  return (
    <ChartFigure>
      <figcaption className="mb-2 flex items-start justify-between gap-3">
        <ChartCaption text={fmt(chart.barCaption, { metric: label })} />
        <ExportButton
          name={['bar', metric]}
          strings={chart}
          render={() => <BarChart models={models} metric={metric} strings={strings} />}
        />
      </figcaption>

      <div className={grid} aria-hidden="true">
        <span />
        <span ref={trackRef} className={cn('relative', showTiers && 'h-4')}>
          {(showTiers ? tiers : []).map((tier) => (
            <span
              key={tier.value}
              className="text-muted-foreground absolute top-0 pl-1 text-[0.6875rem] leading-none whitespace-nowrap"
              style={{ left: at(tier.value / hi) }}
            >
              {tier.label}
            </span>
          ))}
        </span>
      </div>

      <ol>
        {ranked.map((model) => {
          const value = metricOf(model, metric)!;
          const fraction = Math.min(1, value / hi);
          const figure =
            metric === 'cost' && model.cost.free ? empty.free : formatMetric(metric, value);
          return (
            <li key={model.id} className={cn(grid, 'group hover:bg-muted/50 relative rounded-md')}>
              <a
                href={model.href}
                title={ratingSummary(model, strings)}
                className="truncate py-1.5 pl-1 text-sm outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-ring"
              >
                {model.name}
              </a>
              <span className="relative flex items-center" aria-hidden="true">
                {hairlines}
                <span
                  className={cn('relative h-4 rounded-r-[4px]', fill)}
                  style={{ width: at(fraction) }}
                />
                <span className="num relative ml-1.5 text-xs font-medium">{figure}</span>
              </span>
              <span className="sr-only">{figure}</span>
            </li>
          );
        })}
        {missing.map((model) => (
          <li key={model.id} className={cn(grid, 'group hover:bg-muted/50 relative rounded-md')}>
            <a
              href={model.href}
              title={ratingSummary(model, strings)}
              className="truncate py-1.5 pl-1 text-sm outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-ring"
            >
              {model.name}
            </a>
            <span className="text-muted-foreground relative flex items-center text-xs">
              {hairlines}
              <span className="relative">{metric === 'cost' ? empty.noPrice : empty.unrated}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className={cn(grid, 'mt-1')} aria-hidden="true">
        <span />
        <span className="relative h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="text-muted-foreground num absolute top-0 -translate-x-1/2 text-[0.6875rem] leading-none"
              style={{ left: at(tick / hi) }}
            >
              {metric === 'cost' ? formatPrice(tick) : tick}
            </span>
          ))}
        </span>
      </div>
      <ChartFooter />
    </ChartFigure>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  Activity,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  ChartBarDecreasing,
  ChartLine,
  ChartScatter,
  ChevronsUpDown,
  GitCompareArrows,
  History,
  RotateCcw,
  Rows3,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Dictionary } from '@/i18n';
import { fmt } from '@/i18n/fmt';
import { CHART_METRICS, type ChartMetric } from '@/lib/charts';
import { compareQuery } from '@/lib/compare';
import { ALL, BEST, filterModels, NO_FILTERS, type Filters } from '@/lib/filters';
import { formatPrice, formatScore } from '@/lib/format';
import {
  COST_TIERS,
  INTELLIGENCE_TIERS,
  VALUE_TIERS,
  type CostTier,
  type IntelligenceTier,
  type ValueTier,
} from '@/lib/scoring.config';
import { COMPARE_MAX } from '@/lib/share';
import { cn } from '@/lib/utils';
import { BarChart } from './charts/BarChart';
import { QuadrantChart } from './charts/QuadrantChart';
import { metricLabel } from './charts/shared';
import { TrendChart, type TrendData } from './charts/TrendChart';
import { TierMeter, type RatingKind } from './TierMeter';

export interface ModelRow {
  id: string;
  name: string;
  vendor: string;
  legacy: boolean;
  href: string;
  intelligence: { score: number | null; tier: IntelligenceTier | null };
  cost: {
    tier: CostTier | null;
    blended: number | null;
    input: number | null;
    output: number | null;
    free: boolean;
  };
  value: {
    score: number | null;
    tier: ValueTier | null;
    measuredPrice: number | null;
  };
  openWeights: boolean | null;
  usage: { rank: number; title: string } | null;
}

export type ModelTableStrings = Pick<
  Dictionary,
  'table' | 'tier' | 'empty' | 'badge' | 'chart' | 'rating' | 'usage'
> & {
  compare: Pick<Dictionary['compare'], 'select' | 'selected' | 'action' | 'clear' | 'limit'>;
};

interface ModelTableProps {
  models: ModelRow[];
  strings: ModelTableStrings;
  lang: string;
  compareHref: string;
  trend: TrendData;
  usageAvailable: boolean;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, ModelRow>();

const COLUMN_IDS = [
  'model',
  'vendor',
  'intelligence',
  'cost',
  'measured',
  'value',
  'price',
] as const;

const DEFAULT_SORT: SortingState = [{ id: 'intelligence', desc: true }];

const VIEWS = ['table', 'quadrant', 'line', 'bar'] as const;
type View = (typeof VIEWS)[number];
const VIEW_ICONS: Record<View, LucideIcon> = {
  table: Rows3,
  quadrant: ChartScatter,
  line: ChartLine,
  bar: ChartBarDecreasing,
};

interface Display {
  view: View;
  metric: ChartMetric;
  usage: boolean;
}
const DEFAULT_DISPLAY: Display = { view: 'table', metric: 'int', usage: false };

function readUrl(
  vendors: string[],
  usageAvailable: boolean,
): {
  filters: Filters;
  sorting: SortingState;
  display: Display;
} {
  const params = new URLSearchParams(window.location.search);
  const pick = (key: string, allowed: readonly string[]) => {
    const value = params.get(key);
    return value !== null && allowed.includes(value) ? value : ALL;
  };
  const usage = usageAvailable && params.get('usage') === '1';
  const sort = params.get('sort');
  const sorting =
    sort !== null && (COLUMN_IDS as readonly string[]).includes(sort)
      ? [{ id: sort, desc: params.get('dir') !== 'asc' }]
      : DEFAULT_SORT;
  return {
    filters: {
      q: params.get('q') ?? '',
      vendor: pick('vendor', [BEST, ...vendors]),
      int: pick('int', INTELLIGENCE_TIERS),
      cost: pick('cost', COST_TIERS),
      val: pick('val', VALUE_TIERS),
      open: pick('open', ['open', 'closed']),
      legacy: params.get('legacy') === '1',
    },
    sorting,
    display: {
      view: (VIEWS as readonly string[]).includes(params.get('view') ?? '')
        ? (params.get('view') as View)
        : DEFAULT_DISPLAY.view,
      metric: (CHART_METRICS as readonly string[]).includes(params.get('metric') ?? '')
        ? (params.get('metric') as ChartMetric)
        : DEFAULT_DISPLAY.metric,
      usage,
    },
  };
}

function writeUrl(filters: Filters, sorting: SortingState, display: Display) {
  const params = new URLSearchParams();
  if (display.view !== DEFAULT_DISPLAY.view) params.set('view', display.view);
  if (display.metric !== DEFAULT_DISPLAY.metric) params.set('metric', display.metric);
  if (display.usage) params.set('usage', '1');
  if (filters.q.trim()) params.set('q', filters.q.trim());
  for (const key of ['vendor', 'int', 'cost', 'val', 'open'] as const) {
    if (filters[key] !== ALL) params.set(key, filters[key]);
  }
  if (filters.legacy) params.set('legacy', '1');
  const sort = sorting[0];
  if (sort && !(sort.id === DEFAULT_SORT[0]!.id && sort.desc === DEFAULT_SORT[0]!.desc)) {
    params.set('sort', sort.id);
    params.set('dir', sort.desc ? 'desc' : 'asc');
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}

const PickContext = createContext<{ picked: string[]; toggle: (id: string) => void }>({
  picked: [],
  toggle: () => {},
});

function PickBox({
  id,
  name,
  strings,
  inputId,
  className,
}: {
  id: string;
  name: string;
  strings: ModelTableStrings['compare'];
  inputId?: string;
  className?: string;
}) {
  const { picked, toggle } = useContext(PickContext);
  const isPicked = picked.includes(id);
  const full = !isPicked && picked.length >= COMPARE_MAX;
  return (
    <input
      type="checkbox"
      id={inputId}
      checked={isPicked}
      disabled={full}
      onChange={() => toggle(id)}
      aria-label={fmt(strings.select, { name })}
      title={full ? fmt(strings.limit, { n: COMPARE_MAX }) : fmt(strings.select, { name })}
      className={cn(
        'accent-primary size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    />
  );
}

function SortArrow({ direction }: { direction: 'asc' | 'desc' | false }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'size-3.5 shrink-0',
        direction
          ? 'text-foreground'
          : 'text-muted-foreground/50 group-hover/sort:text-muted-foreground',
      )}
    />
  );
}

function meterProps(model: ModelRow, { tier, empty }: Pick<ModelTableStrings, 'tier' | 'empty'>) {
  const { intelligence, cost, value } = model;
  return {
    intelligence: {
      kind: 'intelligence' as RatingKind,
      tier: intelligence.tier,
      label: intelligence.tier ? tier.intelligence[intelligence.tier] : empty.unrated,
      figure: intelligence.score === null ? null : formatScore(intelligence.score),
    },
    cost: {
      kind: 'cost' as RatingKind,
      tier: cost.tier,
      label: cost.tier ? tier.cost[cost.tier] : empty.noPrice,
      figure: cost.free ? empty.free : cost.blended === null ? null : formatPrice(cost.blended),
    },
    value: {
      kind: 'value' as RatingKind,
      tier: value.tier,
      label: value.tier ? tier.value[value.tier] : empty.unrated,
      figure: value.score === null ? null : formatScore(value.score),
    },
  };
}

function ModelBadges({
  model,
  badge,
  className,
}: {
  model: ModelRow;
  badge: ModelTableStrings['badge'];
  className?: string;
}) {
  if (!model.legacy && model.openWeights !== true) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {model.legacy && (
        <Badge variant="outline" className="text-muted-foreground font-normal">
          {badge.legacy}
        </Badge>
      )}
      {model.openWeights === true && (
        <Badge variant="outline" className="text-muted-foreground font-normal">
          {badge.openWeights}
        </Badge>
      )}
    </span>
  );
}

function Price({ model, empty }: { model: ModelRow; empty: ModelTableStrings['empty'] }) {
  const { input, output, free } = model.cost;
  if (input === null || output === null) {
    return <span className="text-muted-foreground">{empty.noPrice}</span>;
  }
  if (free) return <span>{empty.free}</span>;
  return (
    <span className="num">
      {formatPrice(input)}
      <span className="text-muted-foreground"> / </span>
      {formatPrice(output)}
    </span>
  );
}

function MeasuredPrice({
  price,
  strings,
}: {
  price: number | null;
  strings: ModelTableStrings['table'];
}) {
  if (price === null) return <span className="text-muted-foreground">{strings.notMeasured}</span>;
  return (
    <span className="num" title={fmt(strings.measuredPriceNote, { price: formatPrice(price) })}>
      {formatPrice(price)}
    </span>
  );
}

interface FilterOption {
  value: string;
  label: string;
  short?: string;
  title?: string;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  leading = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel?: string;
  leading?: FilterOption[];
}) {
  const [open, setOpen] = useState(false);
  const [byPointer, setByPointer] = useState(false);
  const current = [...leading, ...options].find((option) => option.value === value);
  const selected = value === ALL ? allLabel : (current?.short ?? current?.label);

  return (
    <Select value={value} onValueChange={onChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger
        aria-label={label}
        data-pointer={byPointer ? '' : undefined}
        onPointerDown={() => setByPointer(true)}
        onKeyDown={() => setByPointer(false)}
        onBlur={() => {
          if (!open) setByPointer(false);
        }}
        className="w-full min-w-0 gap-1 data-[size=default]:h-9 data-[pointer]:focus-visible:border-input data-[pointer]:focus-visible:ring-0 sm:w-fit sm:data-[size=default]:h-8"
      >
        <span className="flex min-w-0 items-center gap-1 *:data-[slot=select-value]:truncate">
          <span className="text-muted-foreground shrink-0">{label}</span>
          <SelectValue>{selected}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {allLabel !== undefined && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {leading.map((option) => (
          <SelectItem key={option.value} value={option.value} title={option.title}>
            {option.label}
          </SelectItem>
        ))}
        {leading.length > 0 && <SelectSeparator />}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ViewSwitch({
  view,
  onChange,
  strings,
}: {
  view: View;
  onChange: (view: View) => void;
  strings: ModelTableStrings['chart'];
}) {
  return (
    <fieldset className="bg-muted inline-flex min-w-0 shrink-0 rounded-lg p-0.5">
      <legend className="sr-only">{strings.view}</legend>
      {VIEWS.map((item) => {
        const Icon = VIEW_ICONS[item];
        const selected = item === view;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={selected}
            title={strings.views[item]}
            onClick={() => onChange(item)}
            className={cn(
              'focus-visible:ring-ring/50 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] sm:h-7',
              selected
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-4 sm:size-3.5" />
            <span className="sr-only sm:not-sr-only">{strings.views[item]}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function UsageRank({ model, strings }: { model: ModelRow; strings: ModelTableStrings['usage'] }) {
  if (!model.usage) return <span className="text-muted-foreground">{strings.notRanked}</span>;
  return (
    <span className="num" title={model.usage.title}>
      #{model.usage.rank}
    </span>
  );
}

export function ModelTable({
  models,
  strings,
  lang,
  compareHref,
  trend,
  usageAvailable,
}: ModelTableProps) {
  const { table: t, tier, empty, badge, compare, chart, usage: u } = strings;

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  const [display, setDisplay] = useState<Display>(DEFAULT_DISPLAY);
  const [urlRead, setUrlRead] = useState(false);

  const vendors = useMemo(
    () =>
      [...new Set(models.map((model) => model.vendor))].sort((a, b) => a.localeCompare(b, lang)),
    [models, lang],
  );

  useEffect(() => {
    const fromUrl = readUrl(vendors, usageAvailable);
    setFilters(fromUrl.filters);
    setSorting(fromUrl.sorting);
    setDisplay(fromUrl.display);
    setUrlRead(true);
  }, [vendors, usageAvailable]);

  useEffect(() => {
    if (urlRead) writeUrl(filters, sorting, display);
  }, [urlRead, filters, sorting, display]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const [picked, setPicked] = useState<string[]>([]);
  const toggle = useCallback(
    (id: string) =>
      setPicked((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : current.length < COMPARE_MAX
            ? [...current, id]
            : current,
      ),
    [],
  );
  const pickValue = useMemo(() => ({ picked, toggle }), [picked, toggle]);

  const filtered = useMemo(() => filterModels(models, filters), [models, filters]);

  const columns = useMemo(() => {
    const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
    const text = {
      sortFn: (
        a: { getValue: (id: string) => unknown },
        b: { getValue: (id: string) => unknown },
        id: string,
      ) => collator.compare(String(a.getValue(id)), String(b.getValue(id))),
      sortUndefined: 'last' as const,
    };
    const figure = {
      sortFn: sortFn_basic,
      sortUndefined: 'last' as const,
      sortDescFirst: true,
    };

    return helper.columns([
      helper.accessor((row) => row.name, {
        id: 'model',
        header: t.columns.model,
        ...text,
        cell: ({ row }) => {
          const model = row.original;
          return (
            <span className="flex items-start gap-2.5">
              <span className="flex h-[1.5em] items-center">
                <PickBox id={model.id} name={model.name} strings={compare} />
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:flex-nowrap">
                <a
                  href={model.href}
                  className="font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                >
                  {model.name}
                </a>
                <ModelBadges model={model} badge={badge} className="lg:flex-nowrap" />
                {model.usage && (
                  <span
                    className={cn(
                      'text-muted-foreground num text-xs',
                      !display.usage && 'invisible',
                    )}
                    title={display.usage ? model.usage.title : undefined}
                    aria-hidden={!display.usage}
                  >
                    #{model.usage.rank}
                  </span>
                )}
              </span>
            </span>
          );
        },
      }),
      helper.accessor((row) => row.vendor, {
        id: 'vendor',
        header: t.columns.vendor,
        ...text,
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.vendor}</span>,
      }),
      helper.accessor((row) => row.intelligence.score ?? undefined, {
        id: 'intelligence',
        header: t.columns.intelligence,
        ...figure,
        cell: ({ row }) => (
          <TierMeter {...meterProps(row.original, { tier, empty }).intelligence} />
        ),
      }),
      helper.accessor((row) => row.cost.blended ?? undefined, {
        id: 'cost',
        header: t.columns.cost,
        ...figure,
        cell: ({ row }) => <TierMeter {...meterProps(row.original, { tier, empty }).cost} />,
      }),
      helper.accessor((row) => row.value.measuredPrice ?? undefined, {
        id: 'measured',
        header: t.columns.measured,
        ...figure,
        cell: ({ row }) => <MeasuredPrice price={row.original.value.measuredPrice} strings={t} />,
      }),
      helper.accessor((row) => row.value.score ?? undefined, {
        id: 'value',
        header: t.columns.value,
        ...figure,
        cell: ({ row }) => <TierMeter {...meterProps(row.original, { tier, empty }).value} />,
      }),
      helper.accessor((row) => row.cost.input ?? undefined, {
        id: 'price',
        header: t.columns.price,
        ...figure,
        cell: ({ row }) => <Price model={row.original} empty={empty} />,
      }),
    ]);
  }, [t, tier, empty, badge, compare, lang, display.usage]);

  const table = useTable({
    features,
    columns,
    data: filtered.rows,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    enableMultiSort: false,
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;
  const shown = useMemo(() => rows.map((row) => row.original), [rows]);
  const chartStrings = useMemo(
    () => ({ chart, tier, empty, rating: strings.rating }),
    [chart, tier, empty, strings.rating],
  );
  const filtersActive =
    filters.q.trim() !== '' ||
    filters.vendor !== ALL ||
    filters.int !== ALL ||
    filters.cost !== ALL ||
    filters.val !== ALL ||
    filters.open !== ALL;

  const tierOptions = <T extends string>(keys: readonly T[], labels: Record<T, string>) =>
    keys.map((key) => ({ value: key, label: labels[key] }));

  const sort = sorting[0] ?? DEFAULT_SORT[0]!;
  const sortOptions = COLUMN_IDS.map((id) => ({ value: id, label: t.columns[id] }));
  const setUsage = (on: boolean) => setDisplay((current) => ({ ...current, usage: on }));
  const SortIcon = sort.desc ? ArrowDownWideNarrow : ArrowUpNarrowWide;

  return (
    <div className={cn(picked.length > 0 && 'pb-20')}>
      <search
        aria-label={t.filters}
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <div className="relative sm:w-60">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={filters.q}
            onChange={(event) => setFilter('q', event.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="h-9 pl-8 sm:h-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <FilterSelect
            label={t.vendor}
            value={filters.vendor}
            onChange={(value) => setFilter('vendor', value)}
            options={vendors.map((vendor) => ({ value: vendor, label: vendor }))}
            allLabel={t.all}
            leading={[
              {
                value: BEST,
                label: t.bestOfEach,
                short: t.bestOfEachShort,
                title: t.bestOfEachNote,
              },
            ]}
          />
          <FilterSelect
            label={t.columns.intelligence}
            value={filters.int}
            onChange={(value) => setFilter('int', value)}
            options={tierOptions(INTELLIGENCE_TIERS, tier.intelligence)}
            allLabel={t.all}
          />
          <FilterSelect
            label={t.columns.cost}
            value={filters.cost}
            onChange={(value) => setFilter('cost', value)}
            options={tierOptions(COST_TIERS, tier.cost)}
            allLabel={t.all}
          />
          <FilterSelect
            label={t.columns.value}
            value={filters.val}
            onChange={(value) => setFilter('val', value)}
            options={tierOptions(VALUE_TIERS, tier.value)}
            allLabel={t.all}
          />
          <FilterSelect
            label={t.weights}
            value={filters.open}
            onChange={(value) => setFilter('open', value)}
            options={[
              { value: 'open', label: t.open },
              { value: 'closed', label: t.closed },
            ]}
            allLabel={t.all}
          />
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-9 sm:h-8"
              onClick={() => setFilters({ ...NO_FILTERS, legacy: filters.legacy })}
            >
              <RotateCcw aria-hidden="true" />
              {t.reset}
            </Button>
          )}
        </div>
      </search>

      <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <ViewSwitch
            view={display.view}
            onChange={(view) => setDisplay((current) => ({ ...current, view }))}
            strings={chart}
          />
          <p className="text-muted-foreground num text-sm" aria-live="polite">
            {fmt(t.count, { shown: rows.length, total: filtered.total })}
          </p>
          {usageAvailable && display.view === 'table' && (
            <Button
              variant="outline"
              size="sm"
              className={cn('h-9 sm:h-7', display.usage && 'bg-muted text-foreground')}
              aria-pressed={display.usage}
              onClick={() => setUsage(!display.usage)}
            >
              <Activity aria-hidden="true" />
              {u.toggle}
            </Button>
          )}
        </div>
        {(display.view === 'line' || display.view === 'bar') && (
          <FilterSelect
            label={chart.metric}
            value={display.metric}
            onChange={(metric) =>
              setDisplay((current) => ({ ...current, metric: metric as ChartMetric }))
            }
            options={CHART_METRICS.map((metric) => ({
              value: metric,
              label: metricLabel(metric, chartStrings),
            }))}
          />
        )}
        <div
          className={cn('flex items-center gap-1 md:hidden', display.view !== 'table' && 'hidden')}
        >
          <FilterSelect
            label={t.sort}
            value={sort.id}
            onChange={(id) =>
              setSorting([{ id, desc: id !== 'model' && id !== 'vendor' }] satisfies SortingState)
            }
            options={sortOptions}
          />
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            title={t.reverse}
            aria-label={`${t.reverse} (${sort.desc ? t.sortedDesc : t.sortedAsc})`}
            onClick={() => setSorting([{ id: sort.id, desc: !sort.desc }])}
          >
            <SortIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      {display.view !== 'table' && shown.length === 0 && (
        <p className="bg-card text-muted-foreground rounded-xl border px-4 py-10 text-center text-sm">
          {t.noResults}
        </p>
      )}
      {display.view === 'quadrant' && shown.length > 0 && (
        <QuadrantChart models={shown} strings={chartStrings} />
      )}
      {display.view === 'bar' && shown.length > 0 && (
        <BarChart models={shown} metric={display.metric} strings={chartStrings} />
      )}
      {display.view === 'line' && shown.length > 0 && (
        <TrendChart models={shown} metric={display.metric} data={trend} strings={chartStrings} />
      )}

      <PickContext.Provider value={pickValue}>
        <ul
          className={cn(
            'bg-card divide-y overflow-hidden rounded-xl border md:hidden',
            display.view !== 'table' && 'hidden',
          )}
        >
          {rows.map((row) => {
            const model = row.original;
            const meters = meterProps(model, { tier, empty });
            return (
              <li key={row.id} className="hover:bg-muted/50 relative px-4 py-3.5 transition-colors">
                <div className="flex items-start gap-3">
                  <label
                    htmlFor={`pick-card-${model.id}`}
                    className="relative z-10 -m-2.5 flex h-[calc(1.5em+1.25rem)] items-center p-2.5"
                  >
                    <PickBox
                      id={model.id}
                      name={model.name}
                      strings={compare}
                      inputId={`pick-card-${model.id}`}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <a
                      href={model.href}
                      className="font-medium outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                    >
                      {model.name}
                    </a>
                    <p className="text-muted-foreground text-xs">{model.vendor}</p>
                  </div>
                  <ModelBadges model={model} badge={badge} className="mt-0.5 justify-end" />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  {(['intelligence', 'cost', 'value'] as const).map((kind) => (
                    <div key={kind} className="min-w-0">
                      <dt className="text-muted-foreground mb-1 text-xs">{t.columns[kind]}</dt>
                      <dd>
                        <TierMeter {...meters[kind]} stacked />
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className="text-muted-foreground mt-3 space-y-1 border-t border-dashed pt-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>{t.columns.price}</dt>
                    <dd className="text-foreground">
                      <Price model={model} empty={empty} />
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>{t.columns.measured}</dt>
                    <dd className="text-foreground">
                      <MeasuredPrice price={model.value.measuredPrice} strings={t} />
                    </dd>
                  </div>
                  {display.usage && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt>{u.column}</dt>
                      <dd className="text-foreground">
                        <UsageRank model={model} strings={u} />
                      </dd>
                    </div>
                  )}
                </dl>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="text-muted-foreground px-4 py-10 text-center text-sm">{t.noResults}</li>
          )}
        </ul>

        <div
          className={cn(
            'bg-card hidden overflow-hidden rounded-xl border',
            display.view === 'table' && 'md:block',
          )}
        >
          <Table className="text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header, index) => {
                    const sorted = header.column.getIsSorted();
                    const label = header.column.columnDef.header as string;
                    return (
                      <TableHead
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                        }
                        className={cn('bg-muted h-10 px-0', index === 0 && 'sticky left-0 z-10')}
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          title={fmt(t.sortBy, { column: label })}
                          className={cn(
                            'group/sort hover:text-foreground flex h-10 w-full items-center gap-1.5 px-3 text-xs font-medium whitespace-nowrap transition-colors',
                            sorted ? 'text-foreground' : 'text-muted-foreground',
                            index === 0 && 'pl-4',
                          )}
                        >
                          {label}
                          <SortArrow direction={sorted} />
                          {sorted && (
                            <span className="sr-only">
                              {sorted === 'asc' ? t.sortedAsc : t.sortedDesc}
                            </span>
                          )}
                        </button>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="group">
                  {row.getAllCells().map((cell, index) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'px-3 py-2.5 align-middle',
                        index === 0 &&
                          'bg-card sticky left-0 z-10 max-w-[13rem] min-w-[10rem] pl-4 whitespace-normal transition-colors group-hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] lg:max-w-none lg:whitespace-nowrap',
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={COLUMN_IDS.length}
                    className="text-muted-foreground px-4 py-10 text-center"
                  >
                    {t.noResults}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PickContext.Provider>

      {picked.length > 0 && (
        <section
          aria-label={compare.action}
          className="bg-popover text-popover-foreground fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-md items-center gap-2 rounded-xl border py-2 pr-2 pl-4 text-sm shadow-lg"
        >
          <span className="num" aria-live="polite">
            {fmt(compare.selected, { n: picked.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground ml-auto h-9 sm:h-8"
            onClick={() => setPicked([])}
          >
            {compare.clear}
          </Button>
          <Button asChild size="sm" className="h-9 sm:h-8">
            <a href={`${compareHref}${compareQuery(picked)}`}>
              <GitCompareArrows aria-hidden="true" />
              {compare.action}
            </a>
          </Button>
        </section>
      )}

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>{t.priceNote}</p>
        {(filters.legacy || filtered.legacy > 0) && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 sm:h-7"
            aria-pressed={filters.legacy}
            onClick={() => setFilter('legacy', !filters.legacy)}
          >
            <History aria-hidden="true" />
            {filters.legacy ? t.hideLegacy : fmt(t.showLegacy, { n: filtered.legacy })}
          </Button>
        )}
      </div>
    </div>
  );
}

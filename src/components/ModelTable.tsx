import { useEffect, useMemo, useState } from 'react';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
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
import { formatPrice, formatScore } from '@/lib/format';
import {
  COST_TIERS,
  INTELLIGENCE_TIERS,
  VALUE_TIERS,
  type CostTier,
  type IntelligenceTier,
  type ValueTier,
} from '@/lib/scoring.config';
import { cn } from '@/lib/utils';
import { TierMeter } from './TierMeter';

/** What the table needs to know about a model; a slimmed-down ModelRecord. */
export interface ModelRow {
  id: string;
  name: string;
  vendor: string;
  legacy: boolean;
  /** Link to the detail page, already localised. */
  href: string;
  intelligence: { score: number | null; tier: IntelligenceTier | null };
  cost: {
    tier: CostTier | null;
    blended: number | null;
    input: number | null;
    output: number | null;
    free: boolean;
  };
  value: { score: number | null; tier: ValueTier | null };
  verdict: string | null;
  reviewedAt: string | null;
  stale: boolean;
  openWeights: boolean | null;
}

/** The UI strings the table uses, picked from the page's dictionary. */
export type ModelTableStrings = Pick<Dictionary, 'table' | 'tier' | 'empty' | 'badge'>;

interface ModelTableProps {
  models: ModelRow[];
  strings: ModelTableStrings;
  /** BCP 47 tag, for locale-aware text sorting. */
  lang: string;
}

const features = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, ModelRow>();

const COLUMN_IDS = [
  'model',
  'vendor',
  'intelligence',
  'cost',
  'value',
  'price',
  'verdict',
  'reviewed',
] as const;
type ColumnId = (typeof COLUMN_IDS)[number];

const DEFAULT_SORT: SortingState = [{ id: 'intelligence', desc: true }];
const ALL = 'all';

/** Filter state. Keys double as the (locale-independent) URL query parameters. */
interface Filters {
  q: string;
  vendor: string;
  int: string;
  cost: string;
  val: string;
  open: string;
  legacy: boolean;
}

const NO_FILTERS: Filters = {
  q: '',
  vendor: ALL,
  int: ALL,
  cost: ALL,
  val: ALL,
  open: ALL,
  legacy: false,
};

function readUrl(vendors: string[]): { filters: Filters; sorting: SortingState } {
  const params = new URLSearchParams(window.location.search);
  const pick = (key: string, allowed: readonly string[]) => {
    const value = params.get(key);
    return value !== null && allowed.includes(value) ? value : ALL;
  };
  const sort = params.get('sort');
  const sorting =
    sort !== null && (COLUMN_IDS as readonly string[]).includes(sort)
      ? [{ id: sort, desc: params.get('dir') !== 'asc' }]
      : DEFAULT_SORT;
  return {
    filters: {
      q: params.get('q') ?? '',
      vendor: pick('vendor', vendors),
      int: pick('int', INTELLIGENCE_TIERS),
      cost: pick('cost', COST_TIERS),
      val: pick('val', VALUE_TIERS),
      open: pick('open', ['open', 'closed']),
      legacy: params.get('legacy') === '1',
    },
    sorting,
  };
}

function writeUrl(filters: Filters, sorting: SortingState) {
  const params = new URLSearchParams();
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

function SortArrow({ direction }: { direction: 'asc' | 'desc' | false }) {
  return (
    <svg
      viewBox="0 0 8 12"
      aria-hidden="true"
      className={cn('h-3 w-2 shrink-0', direction ? 'text-foreground' : 'text-pip')}
    >
      <path d="M4 1 7 5H1z" fill="currentColor" opacity={direction === 'desc' ? 0.25 : 1} />
      <path d="M4 11 1 7h6z" fill="currentColor" opacity={direction === 'asc' ? 0.25 : 1} />
    </svg>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-0 gap-1">
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      {/* Drop down below the trigger. The default ("item-aligned") lays the
          list over the trigger, which hides the filter's label. */}
      <SelectContent position="popper" align="start">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ModelTable({ models, strings, lang }: ModelTableProps) {
  const { table: t, tier, empty, badge } = strings;

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  // The page is prerendered with the default view; the view in the URL is
  // applied right after hydration, then every change is written back.
  const [urlRead, setUrlRead] = useState(false);

  const vendors = useMemo(
    () => [...new Set(models.map((model) => model.vendor))].sort((a, b) => a.localeCompare(b, lang)),
    [models, lang],
  );
  const legacyCount = useMemo(() => models.filter((model) => model.legacy).length, [models]);

  useEffect(() => {
    const fromUrl = readUrl(vendors);
    setFilters(fromUrl.filters);
    setSorting(fromUrl.sorting);
    setUrlRead(true);
  }, [vendors]);

  useEffect(() => {
    if (urlRead) writeUrl(filters, sorting);
  }, [urlRead, filters, sorting]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  // Legacy and open-weights have no column of their own, so they narrow the
  // data before it reaches the table.
  const data = useMemo(
    () =>
      models.filter((model) => {
        if (model.legacy && !filters.legacy) return false;
        if (filters.open === 'open') return model.openWeights === true;
        if (filters.open === 'closed') return model.openWeights === false;
        return true;
      }),
    [models, filters.legacy, filters.open],
  );

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const active: ColumnFiltersState = [];
    if (filters.q.trim()) active.push({ id: 'model', value: filters.q.trim().toLowerCase() });
    if (filters.vendor !== ALL) active.push({ id: 'vendor', value: filters.vendor });
    if (filters.int !== ALL) active.push({ id: 'intelligence', value: filters.int });
    if (filters.cost !== ALL) active.push({ id: 'cost', value: filters.cost });
    if (filters.val !== ALL) active.push({ id: 'value', value: filters.val });
    return active;
  }, [filters]);

  const columns = useMemo(() => {
    const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
    // Empty cells are returned as undefined and `sortUndefined: 'last'`
    // keeps them at the bottom in both directions.
    const text = {
      sortFn: (a: { getValue: (id: string) => unknown }, b: { getValue: (id: string) => unknown }, id: string) =>
        collator.compare(String(a.getValue(id)), String(b.getValue(id))),
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
        filterFn: (row, _id, query: string) =>
          row.original.name.toLowerCase().includes(query) ||
          row.original.id.toLowerCase().includes(query),
        cell: ({ row }) => {
          const model = row.original;
          return (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
              <a
                href={model.href}
                className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
              >
                {model.name}
              </a>
              {model.legacy && (
                <span className="text-muted-foreground rounded border px-1 text-xs leading-[1.4] whitespace-nowrap">
                  {badge.legacy}
                </span>
              )}
              {model.openWeights === true && (
                <span className="text-muted-foreground rounded border px-1 text-xs leading-[1.4] whitespace-nowrap">
                  {badge.openWeights}
                </span>
              )}
            </span>
          );
        },
      }),
      helper.accessor((row) => row.vendor, {
        id: 'vendor',
        header: t.columns.vendor,
        ...text,
        filterFn: (row, _id, vendor: string) => row.original.vendor === vendor,
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.vendor}</span>,
      }),
      helper.accessor((row) => row.intelligence.score ?? undefined, {
        id: 'intelligence',
        header: t.columns.intelligence,
        ...figure,
        filterFn: (row, _id, wanted: string) => row.original.intelligence.tier === wanted,
        cell: ({ row }) => {
          const { score, tier: key } = row.original.intelligence;
          return (
            <TierMeter
              kind="intelligence"
              tier={key}
              label={key ? tier.intelligence[key] : empty.unrated}
              figure={score === null ? null : formatScore(score)}
            />
          );
        },
      }),
      helper.accessor((row) => row.cost.blended ?? undefined, {
        id: 'cost',
        header: t.columns.cost,
        ...figure,
        filterFn: (row, _id, wanted: string) => row.original.cost.tier === wanted,
        cell: ({ row }) => {
          const { tier: key, blended, free } = row.original.cost;
          return (
            <TierMeter
              kind="cost"
              tier={key}
              label={key ? tier.cost[key] : empty.noPrice}
              figure={free ? empty.free : blended === null ? null : formatPrice(blended)}
            />
          );
        },
      }),
      helper.accessor((row) => row.value.score ?? undefined, {
        id: 'value',
        header: t.columns.value,
        ...figure,
        filterFn: (row, _id, wanted: string) => row.original.value.tier === wanted,
        cell: ({ row }) => {
          const { score, tier: key } = row.original.value;
          return (
            <TierMeter
              kind="value"
              tier={key}
              label={key ? tier.value[key] : empty.unrated}
              figure={score === null ? null : formatScore(score)}
            />
          );
        },
      }),
      helper.accessor((row) => row.cost.input ?? undefined, {
        id: 'price',
        header: t.columns.price,
        ...figure,
        cell: ({ row }) => {
          const { input, output, free } = row.original.cost;
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
        },
      }),
      helper.accessor((row) => row.verdict ?? undefined, {
        id: 'verdict',
        header: t.columns.verdict,
        ...text,
        cell: ({ row }) =>
          row.original.verdict ?? <span className="text-muted-foreground">{empty.unrated}</span>,
      }),
      helper.accessor((row) => row.reviewedAt ?? undefined, {
        id: 'reviewed',
        header: t.columns.reviewed,
        ...figure,
        cell: ({ row }) => {
          const { reviewedAt, stale } = row.original;
          if (reviewedAt === null) {
            return <span className="text-muted-foreground">{empty.unrated}</span>;
          }
          return (
            <span className="flex flex-wrap items-center gap-x-2">
              <time dateTime={reviewedAt} className="num">
                {reviewedAt}
              </time>
              {stale && <span className="text-expense text-xs">{badge.stale}</span>}
            </span>
          );
        },
      }),
    ]);
  }, [t, tier, empty, badge, lang]);

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    enableMultiSort: false,
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;
  const filtersActive =
    filters.q.trim() !== '' ||
    filters.vendor !== ALL ||
    filters.int !== ALL ||
    filters.cost !== ALL ||
    filters.val !== ALL ||
    filters.open !== ALL;

  const tierOptions = <T extends string>(keys: readonly T[], labels: Record<T, string>) =>
    keys.map((key) => ({ value: key, label: labels[key] }));

  const wide: Partial<Record<ColumnId, string>> = {
    verdict: 'min-w-[14rem]',
  };

  return (
    <div>
      <div
        role="search"
        aria-label={t.filters}
        className="mb-3 flex flex-wrap items-center gap-2"
      >
        <Input
          type="search"
          value={filters.q}
          onChange={(event) => setFilter('q', event.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="h-7 w-full sm:w-56"
        />
        <FilterSelect
          label={t.vendor}
          value={filters.vendor}
          onChange={(value) => setFilter('vendor', value)}
          options={vendors.map((vendor) => ({ value: vendor, label: vendor }))}
          allLabel={t.all}
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
            onClick={() => setFilters({ ...NO_FILTERS, legacy: filters.legacy })}
          >
            {t.reset}
          </Button>
        )}
        <p className="text-muted-foreground num ml-auto text-sm" aria-live="polite">
          {fmt(t.count, { shown: rows.length, total: data.length })}
        </p>
      </div>

      <div className="-mx-4 border-y sm:mx-0 sm:rounded-md sm:border-x">
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
                      className={cn(
                        'bg-muted/60 h-9 px-0',
                        index === 0 && 'bg-muted sticky left-0 z-10',
                        wide[header.column.id as ColumnId],
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        title={fmt(t.sortBy, { column: label })}
                        className={cn(
                          'hover:text-foreground flex h-9 w-full items-center gap-1.5 px-3 text-xs font-medium whitespace-nowrap',
                          sorted ? 'text-foreground' : 'text-muted-foreground',
                          index === 0 && 'pl-4 sm:pl-3',
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
                      'px-3 py-2 align-middle',
                      index === 0 &&
                        'bg-background group-hover:bg-muted sticky left-0 z-10 max-w-[10.5rem] min-w-[8.5rem] pl-4 whitespace-normal sm:max-w-none sm:pl-3 sm:whitespace-nowrap',
                      cell.column.id === 'verdict' && 'whitespace-normal',
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMN_IDS.length} className="text-muted-foreground px-4 py-8">
                  {t.noResults}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>{t.priceNote}</p>
        {legacyCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={filters.legacy}
            onClick={() => setFilter('legacy', !filters.legacy)}
          >
            {filters.legacy ? t.hideLegacy : fmt(t.showLegacy, { n: legacyCount })}
          </Button>
        )}
      </div>
    </div>
  );
}

import { Plus, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Dictionary } from '@/i18n';
import { fmt } from '@/i18n/fmt';
import { COMPARE_PARAM, type CompareModel, compareQuery, parseCompareIds } from '@/lib/compare';
import { formatPrice, formatScore, formatTokens } from '@/lib/format';
import { METRIC_KEYS } from '@/lib/scoring.config';
import { COMPARE_MAX } from '@/lib/share';
import { cn } from '@/lib/utils';
import { TierMeter } from './TierMeter';

/** The UI strings the compare table uses, picked from the page's dictionary. */
export type CompareStrings = Pick<
  Dictionary,
  'compare' | 'rating' | 'tier' | 'empty' | 'metric' | 'badge'
> & {
  detail: Pick<
    Dictionary['detail'],
    | 'input'
    | 'output'
    | 'cacheRead'
    | 'blended'
    | 'context'
    | 'tokens'
    | 'releaseDate'
    | 'weights'
    | 'open'
    | 'closed'
  >;
};

interface CompareTableProps {
  /** Every model, in the order the "add" menu lists them. */
  models: CompareModel[];
  /** Selection rendered before the address is read. */
  initial: string[];
  strings: CompareStrings;
}

interface Row {
  label: string;
  cell: (model: CompareModel) => ReactNode;
  /** The figure compared across models; null when the model has none. */
  figure?: (model: CompareModel) => number | null;
  /** Which end of the figure is best. */
  best?: 'high' | 'low';
}

interface Group {
  label: string;
  rows: Row[];
}

/** IDs whose figure is the best in the row; empty unless at least two figures differ. */
function bestIds(models: CompareModel[], row: Row): Set<string> {
  if (!row.figure || !row.best) return new Set();
  const figures = models
    .map((model) => ({ id: model.id, value: row.figure!(model) }))
    .filter((item): item is { id: string; value: number } => item.value !== null);
  if (figures.length < 2) return new Set();
  const values = figures.map((item) => item.value);
  const target = row.best === 'high' ? Math.max(...values) : Math.min(...values);
  if (values.every((value) => value === target)) return new Set();
  return new Set(figures.filter((item) => item.value === target).map((item) => item.id));
}

export function CompareTable({ models, initial, strings: s }: CompareTableProps) {
  const [ids, setIds] = useState<string[]>(initial);
  // The page is prerendered with the default selection; the one in the
  // address is applied after hydration, and every change is written back.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = parseCompareIds(
      params.get(COMPARE_PARAM),
      models.map((model) => model.id),
    );
    if (fromUrl !== null) setIds(fromUrl);
  }, [models]);

  useEffect(() => {
    if (!touched) return;
    const { pathname, hash } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${compareQuery(ids)}${hash}`);
  }, [ids, touched]);

  const update = (next: string[]) => {
    setTouched(true);
    setIds(next);
  };

  const byId = new Map(models.map((model) => [model.id, model]));
  const selected = ids.map((id) => byId.get(id)).filter((model) => model !== undefined);
  const available = models.filter((model) => !ids.includes(model.id));
  const full = ids.length >= COMPARE_MAX;

  const none = <span className="text-muted-foreground">{s.empty.noData}</span>;
  const price = (value: number | null, free: boolean) =>
    value === null ? none : free ? s.empty.free : formatPrice(value);

  const groups: Group[] = [
    {
      label: s.compare.ratings,
      rows: [
        {
          label: s.rating.intelligence,
          figure: (model) => model.intelligence.score,
          best: 'high',
          cell: ({ intelligence: { tier, score } }) => (
            <TierMeter
              kind="intelligence"
              tier={tier}
              label={tier ? s.tier.intelligence[tier] : s.empty.unrated}
              figure={score === null ? null : formatScore(score)}
            />
          ),
        },
        {
          label: s.rating.cost,
          figure: (model) => model.cost.blended,
          best: 'low',
          cell: ({ cost: { tier, blended, free } }) => (
            <TierMeter
              kind="cost"
              tier={tier}
              label={tier ? s.tier.cost[tier] : s.empty.noPrice}
              figure={free ? s.empty.free : blended === null ? null : formatPrice(blended)}
            />
          ),
        },
        {
          label: s.rating.value,
          figure: (model) => model.value.score,
          best: 'high',
          cell: ({ value: { tier, score } }) => (
            <TierMeter
              kind="value"
              tier={tier}
              label={tier ? s.tier.value[tier] : s.empty.unrated}
              figure={score === null ? null : formatScore(score)}
            />
          ),
        },
      ],
    },
    {
      label: s.compare.leaderboards,
      rows: METRIC_KEYS.map((key) => ({
        label: s.metric[key],
        figure: (model: CompareModel) => model.metrics[key],
        best: 'high' as const,
        cell: (model: CompareModel) => model.metrics[key] ?? none,
      })),
    },
    {
      label: s.compare.prices,
      rows: [
        {
          label: s.detail.input,
          figure: (model) => model.cost.input,
          best: 'low',
          cell: (model) => price(model.cost.input, model.cost.free),
        },
        {
          label: s.detail.output,
          figure: (model) => model.cost.output,
          best: 'low',
          cell: (model) => price(model.cost.output, model.cost.free),
        },
        {
          label: s.detail.cacheRead,
          figure: (model) => model.cost.cache_read,
          best: 'low',
          cell: (model) => price(model.cost.cache_read, model.cost.free),
        },
        {
          label: s.detail.blended,
          figure: (model) => model.cost.blended,
          best: 'low',
          cell: (model) => price(model.cost.blended, model.cost.free),
        },
      ],
    },
    {
      label: s.compare.facts,
      rows: [
        {
          label: s.detail.context,
          figure: (model) => model.context,
          best: 'high',
          cell: (model) =>
            model.context === null
              ? none
              : fmt(s.detail.tokens, { n: formatTokens(model.context) }),
        },
        {
          label: s.detail.releaseDate,
          cell: (model) => model.releaseDate ?? none,
        },
        {
          label: s.detail.weights,
          cell: (model) =>
            model.openWeights === null ? none : model.openWeights ? s.detail.open : s.detail.closed,
        },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          value=""
          disabled={full || available.length === 0}
          onValueChange={(id) => {
            if (id) update([...ids, id]);
          }}
        >
          <SelectTrigger
            aria-label={s.compare.add}
            className="min-w-48 data-[size=default]:h-9 sm:data-[size=default]:h-8"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="text-muted-foreground size-4" aria-hidden="true" />
              <SelectValue placeholder={s.compare.add} />
            </span>
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {available.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
                <span className="text-muted-foreground">{model.vendor}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {full
            ? fmt(s.compare.full, { n: COMPARE_MAX })
            : fmt(s.compare.limit, { n: COMPARE_MAX })}
        </p>
      </div>

      {selected.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          {s.compare.empty}
        </p>
      ) : (
        <>
          <div className="bg-card relative overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{s.compare.title}</caption>
              <thead>
                <tr className="border-b">
                  <td className="bg-muted sticky left-0 z-10 w-40 min-w-32" />
                  {selected.map((model) => (
                    <th
                      key={model.id}
                      scope="col"
                      className="bg-muted min-w-44 px-3 py-2.5 text-start align-top font-normal"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <a
                            href={model.href}
                            className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
                          >
                            {model.name}
                          </a>
                          <span className="text-muted-foreground block text-xs">
                            {model.vendor}
                            {model.legacy && ` · ${s.badge.legacy}`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => update(ids.filter((id) => id !== model.id))}
                          aria-label={fmt(s.compare.remove, { name: model.name })}
                          title={fmt(s.compare.remove, { name: model.name })}
                          className="text-muted-foreground hover:text-foreground hover:bg-accent -mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-md transition-colors sm:-mt-0.5 sm:-mr-1.5 sm:size-6"
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.label}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={selected.length + 1}
                      className="text-muted-foreground px-3 pt-4 pb-1 text-start text-xs font-medium sm:pl-3"
                    >
                      {/* Sticky so the group name stays in view when the table scrolls sideways. */}
                      <span className="sticky left-3">{group.label}</span>
                    </th>
                  </tr>
                  {group.rows.map((row) => {
                    const best = bestIds(selected, row);
                    return (
                      <tr
                        key={row.label}
                        className="hover:bg-muted/50 group border-b last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="bg-card sticky left-0 z-10 px-3 py-2 text-start align-middle font-normal transition-colors group-hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]"
                        >
                          {row.label}
                        </th>
                        {selected.map((model) => (
                          <td
                            key={model.id}
                            className={cn(
                              'num px-3 py-2 align-middle',
                              best.has(model.id) &&
                                'font-semibold [&_.num]:text-foreground [&_.num]:font-semibold',
                            )}
                          >
                            {row.cell(model)}
                            {best.has(model.id) && (
                              <span className="sr-only"> ({s.compare.best})</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          {selected.length > 1 && (
            <p className="text-muted-foreground mt-3 text-xs">{s.compare.bestNote}</p>
          )}
        </>
      )}
    </div>
  );
}

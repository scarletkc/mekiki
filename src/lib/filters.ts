import type { CostTier, IntelligenceTier, ValueTier } from '@/lib/scoring.config';

/** The value of a select filter that lets every model through. */
export const ALL = 'all';

/** Filter state. Keys double as the (locale-independent) URL query parameters. */
export interface Filters {
  q: string;
  vendor: string;
  int: string;
  cost: string;
  val: string;
  open: string;
  legacy: boolean;
}

export const NO_FILTERS: Filters = {
  q: '',
  vendor: ALL,
  int: ALL,
  cost: ALL,
  val: ALL,
  open: ALL,
  legacy: false,
};

/** The fields of a model that the filters read. */
export interface Filterable {
  id: string;
  name: string;
  vendor: string;
  legacy: boolean;
  intelligence: { tier: IntelligenceTier | null };
  cost: { tier: CostTier | null };
  value: { tier: ValueTier | null };
  openWeights: boolean | null;
}

/**
 * Whether a model passes the search and every select filter. The legacy toggle
 * is not one of them: it decides which models are in the list, not which match.
 */
export function matchesFilters(model: Filterable, filters: Filters): boolean {
  const query = filters.q.trim().toLowerCase();
  if (
    query &&
    !model.name.toLowerCase().includes(query) &&
    !model.id.toLowerCase().includes(query)
  ) {
    return false;
  }
  if (filters.vendor !== ALL && model.vendor !== filters.vendor) return false;
  if (filters.int !== ALL && model.intelligence.tier !== filters.int) return false;
  if (filters.cost !== ALL && model.cost.tier !== filters.cost) return false;
  if (filters.val !== ALL && model.value.tier !== filters.val) return false;
  if (filters.open === 'open' && model.openWeights !== true) return false;
  if (filters.open === 'closed' && model.openWeights !== false) return false;
  return true;
}

export interface FilteredModels<T> {
  /** The models that pass the filters, in their original order. */
  rows: T[];
  /** Models in the list before any filter: active ones, plus legacy ones when shown. */
  total: number;
  /** Legacy models that pass the filters, whether or not they are shown. */
  legacy: number;
}

/**
 * Applies the filters, and counts what the page shows around the list: "rows of
 * total", and how many models the legacy toggle would add.
 */
export function filterModels<T extends Filterable>(
  models: readonly T[],
  filters: Filters,
): FilteredModels<T> {
  const rows: T[] = [];
  let total = 0;
  let legacy = 0;
  for (const model of models) {
    const listed = filters.legacy || !model.legacy;
    const matches = matchesFilters(model, filters);
    if (listed) total += 1;
    if (listed && matches) rows.push(model);
    if (model.legacy && matches) legacy += 1;
  }
  return { rows, total, legacy };
}

import type { CostTier, IntelligenceTier, ValueTier } from '@/lib/scoring.config';

export const ALL = 'all';

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
  rows: T[];
  total: number;
  legacy: number;
}

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

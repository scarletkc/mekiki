import type { CostTier, IntelligenceTier, ValueTier } from '@/lib/scoring.config';

export const ALL = 'all';
export const BEST = 'best';

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
  intelligence: { score: number | null; tier: IntelligenceTier | null };
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
  if (filters.vendor !== ALL && filters.vendor !== BEST && model.vendor !== filters.vendor) {
    return false;
  }
  if (filters.int !== ALL && model.intelligence.tier !== filters.int) return false;
  if (filters.cost !== ALL && model.cost.tier !== filters.cost) return false;
  if (filters.val !== ALL && model.value.tier !== filters.val) return false;
  if (filters.open === 'open' && model.openWeights !== true) return false;
  if (filters.open === 'closed' && model.openWeights !== false) return false;
  return true;
}

function beats(challenger: Filterable, holder: Filterable): boolean {
  const a = challenger.intelligence.score!;
  const b = holder.intelligence.score!;
  if (a !== b) return a > b;
  return holder.legacy && !challenger.legacy;
}

export function bestOfEachVendor<T extends Filterable>(models: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const model of models) {
    if (model.intelligence.score === null) continue;
    const holder = best.get(model.vendor);
    if (!holder || beats(model, holder)) best.set(model.vendor, model);
  }
  const winners = new Set(best.values());
  return models.filter((model) => winners.has(model));
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
  const matching: T[] = [];
  let total = 0;
  for (const model of models) {
    const listed = filters.legacy || !model.legacy;
    const matches = matchesFilters(model, filters);
    if (listed) total += 1;
    if (listed && matches) rows.push(model);
    if (matches) matching.push(model);
  }
  const best = filters.vendor === BEST;
  const withLegacy = best ? bestOfEachVendor(matching) : matching;
  return {
    rows: best ? bestOfEachVendor(rows) : rows,
    total,
    legacy: withLegacy.filter((model) => model.legacy).length,
  };
}

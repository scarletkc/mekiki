import type { ModelRecord } from './dataset';
import {
  METRIC_KEYS,
  type CostTier,
  type IntelligenceTier,
  type MetricKey,
  type ValueTier,
} from './scoring.config';
import { COMPARE_MAX } from './share';

export interface CompareModel {
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
    cache_read: number | null;
    free: boolean;
  };
  value: { score: number | null; tier: ValueTier | null };
  metrics: Record<MetricKey, number | null>;
  context: number | null;
  releaseDate: string | null;
  openWeights: boolean | null;
}

export function toCompareModel(model: ModelRecord, href: string): CompareModel {
  const { intelligence, cost, value } = model.rating;
  const metrics = {} as Record<MetricKey, number | null>;
  for (const key of METRIC_KEYS) metrics[key] = intelligence.breakdown[key]?.raw ?? null;
  return {
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    legacy: model.status === 'legacy',
    href,
    intelligence: { score: intelligence.score, tier: intelligence.tier },
    cost: {
      tier: cost.tier,
      blended: cost.blended,
      input: cost.input,
      output: cost.output,
      cache_read: cost.cache_read,
      free: cost.free,
    },
    value: { score: value.score, tier: value.tier },
    metrics,
    context: model.facts.context,
    releaseDate: model.facts.release_date,
    openWeights: model.facts.open_weights,
  };
}

export const COMPARE_PARAM = 'm';

export function defaultCompareIds(models: readonly ModelRecord[]): string[] {
  return models
    .filter((model) => model.status === 'active' && model.rating.intelligence.score !== null)
    .sort((a, b) => (b.rating.intelligence.score ?? 0) - (a.rating.intelligence.score ?? 0))
    .slice(0, 3)
    .map((model) => model.id);
}

export function parseCompareIds(value: string | null, known: readonly string[]): string[] | null {
  if (value === null) return null;
  const ids: string[] = [];
  for (const raw of value.split(',')) {
    const id = raw.trim();
    if (known.includes(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === COMPARE_MAX) break;
  }
  return ids;
}

export function compareQuery(ids: readonly string[]): string {
  return `?${COMPARE_PARAM}=${ids.map((id) => encodeURIComponent(id).replace(/%2F/gi, '/')).join(',')}`;
}

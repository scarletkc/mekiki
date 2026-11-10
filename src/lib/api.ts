/**
 * Shapes of the public JSON API (docs/SPEC.md §7), derived from the same
 * dataset the pages use.
 *
 * Contract: fields are only ever added. A breaking change bumps
 * API_VERSION. Missing values are `null`; fields are never omitted.
 */
import { useTranslations, tierLabels } from '../i18n';
import type { ValueCostBasis } from './scoring';
import {
  METRIC_KEYS,
  type CostTier,
  type IntelligenceTier,
  type MetricKey,
  type ValueTier,
} from './scoring.config';
import type { Dataset, ModelRecord } from './dataset';
import { SOURCE_IDS, type SourceId } from './snapshots';

export const API_VERSION = 1;

interface TierFields<T extends string> {
  tier: T | null;
  /** English label of the tier. */
  label: string | null;
  /** The label in every UI language, keyed by BCP 47 tag. */
  labels: Record<string, string> | null;
}

export interface ApiModel {
  id: string;
  name: string;
  vendor: string;
  status: 'active' | 'legacy';
  intelligence: TierFields<IntelligenceTier> & {
    score: number | null;
    breakdown: Record<MetricKey, { raw: number | null; normalized: number | null; weight: number }>;
  };
  cost: TierFields<CostTier> & {
    index: number | null;
    blended: number | null;
    input: number | null;
    output: number | null;
    cache_read: number | null;
  };
  value: TierFields<ValueTier> & {
    score: number | null;
    /** `run_cost` when the price comes from a measured run cost, `list_price` otherwise. */
    cost_basis: ValueCostBasis | null;
    /** USD Artificial Analysis spent running its Intelligence Index on the model. */
    run_cost: number | null;
    /** The price the score is computed from, USD per 1M tokens. */
    effective_price: number | null;
    /** 0–100 index of `effective_price`. */
    cost_index: number | null;
  };
  url: string;
}

export interface ApiIndexEntry {
  id: string;
  name: string;
  vendor: string;
  status: 'active' | 'legacy';
}

export interface ApiFull {
  version: number;
  generated_at: string;
  sources: Record<SourceId, { name: string; url: string; fetched_at: string | null }>;
  models: ApiModel[];
}

// `label` is English by contract (docs/SPEC.md §7), whatever the site's default
// locale is. `labels` carries every language.
const defaultLabels = useTranslations('en').tier;

/** Trim floating-point noise from a price without changing its value. */
function tidy(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6));
}

export function toApiModel(model: ModelRecord): ApiModel {
  const { intelligence, cost, value } = model.rating;

  const breakdown = {} as ApiModel['intelligence']['breakdown'];
  for (const key of METRIC_KEYS) {
    const item = intelligence.breakdown[key];
    breakdown[key] = {
      raw: item?.raw ?? null,
      normalized: item?.normalized ?? null,
      weight: item?.weight ?? 0,
    };
  }

  return {
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    status: model.status,
    intelligence: {
      score: intelligence.score,
      tier: intelligence.tier,
      label: intelligence.tier ? defaultLabels.intelligence[intelligence.tier] : null,
      labels: intelligence.tier ? tierLabels('intelligence', intelligence.tier) : null,
      breakdown,
    },
    cost: {
      tier: cost.tier,
      label: cost.tier ? defaultLabels.cost[cost.tier] : null,
      labels: cost.tier ? tierLabels('cost', cost.tier) : null,
      index: cost.index,
      blended: tidy(cost.blended),
      input: cost.input,
      output: cost.output,
      cache_read: cost.cache_read,
    },
    value: {
      score: value.score,
      tier: value.tier,
      label: value.tier ? defaultLabels.value[value.tier] : null,
      labels: value.tier ? tierLabels('value', value.tier) : null,
      cost_basis: value.cost_basis,
      run_cost: model.facts.index_cost_usd,
      effective_price: tidy(value.effective_price),
      cost_index: value.cost_index,
    },
    url: model.url,
  };
}

export function toApiIndex(dataset: Dataset): ApiIndexEntry[] {
  return dataset.models.map(({ id, name, vendor, status }) => ({ id, name, vendor, status }));
}

export function toApiFull(dataset: Dataset): ApiFull {
  const sources = {} as ApiFull['sources'];
  for (const id of SOURCE_IDS) {
    const { name, url, fetched_at } = dataset.sources[id];
    sources[id] = { name, url, fetched_at };
  }
  return {
    version: API_VERSION,
    generated_at: dataset.generated_at,
    sources,
    models: dataset.models.map(toApiModel),
  };
}

/** A JSON response for a static endpoint. */
export function jsonResponse(body: unknown): Response {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Shapes of the public JSON API (docs/SPEC.md §7), derived from the same
 * dataset the pages use.
 *
 * Contract: fields are only ever added. A breaking change bumps
 * API_VERSION. Missing values are `null`; fields are never omitted.
 */
import { useTranslations, tierLabels } from '../i18n';
import { round1, type Basis } from './scoring';
import type { CostTier, IntelligenceTier, MetricKey, ValueTier } from './scoring.config';
import type { Dataset, ModelRecord } from './dataset';
import { SOURCE_IDS, type SourceId } from './snapshots';

export const API_VERSION = 1;

interface TierFields<T extends string> {
  tier: T | null;
  /** Simplified Chinese label of the tier. */
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
    basis: Basis;
    benchmark: number | null;
    subjective: number | null;
    breakdown: Record<
      MetricKey,
      { raw: number | null; normalized: number | null; weight: number }
    >;
  };
  cost: TierFields<CostTier> & {
    index: number | null;
    blended: number | null;
    input: number | null;
    output: number | null;
    cache_read: number | null;
  };
  value: TierFields<ValueTier> & { score: number | null };
  verdict: string | null;
  best_for: string[];
  reviewed_at: string | null;
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

// `label` is Simplified Chinese by contract (docs/SPEC.md §7), independent of
// the site's default locale. `labels` carries every language.
const defaultLabels = useTranslations('zh-cn').tier;

/** Trim floating-point noise from a price without changing its value. */
function tidy(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6));
}

export function toApiModel(model: ModelRecord): ApiModel {
  const { intelligence, cost, value } = model.rating;

  const breakdown = {} as ApiModel['intelligence']['breakdown'];
  for (const [key, item] of Object.entries(intelligence.breakdown) as [
    MetricKey,
    (typeof intelligence.breakdown)[MetricKey],
  ][]) {
    breakdown[key] = { raw: item.raw, normalized: item.normalized, weight: item.weight };
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
      basis: intelligence.basis,
      benchmark: intelligence.benchmark,
      subjective: intelligence.subjective === null ? null : round1(intelligence.subjective),
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
    },
    verdict: model.verdict,
    best_for: model.best_for,
    reviewed_at: model.reviewed_at,
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

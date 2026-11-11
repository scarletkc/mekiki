import { useTranslations, tierLabels, type Dictionary } from '../i18n';
import type { ValueCostBasis } from './scoring';
import {
  METRIC_KEYS,
  type CostTier,
  type IntelligenceTier,
  type MetricKey,
  type ValueTier,
} from './scoring.config';
import type { Dataset, ModelRecord } from './dataset';
import type { HistoryEntry } from './history';
import { SOURCE_IDS, type SourceId } from './snapshots';

export const API_VERSION = 1;

interface TierFields<T extends string> {
  tier: T | null;
  label: string | null;
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
    cost_basis: ValueCostBasis | null;
    run_cost: number | null;
    effective_price: number | null;
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

const defaultLabels = useTranslations('en').tier;

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

export function apiDoc(dataset: Dataset, t: Dictionary) {
  const a = t.api;
  const sample =
    dataset.models.find((model) => model.rating.value.score !== null) ?? dataset.models[0];
  const samplePath = sample
    ? `/api/models/${sample.id}.json`
    : '/api/models/<provider>/<model>.json';
  const endpoints = [
    { path: '/api.json', href: '/api.json', content: a.endpointFull },
    { path: '/api/models.json', href: '/api/models.json', content: a.endpointList },
    {
      path: '/api/models/<provider>/<model>.json',
      href: sample ? samplePath : null,
      content: a.endpointOne,
    },
    { path: '/api/history.json', href: '/api/history.json', content: a.endpointHistory },
  ];
  const fields = [a.fieldScores, a.fieldTier, a.fieldPrice, a.fieldValue, a.fieldHistory];
  return { sample, samplePath, endpoints, fields };
}

export interface ApiHistory {
  version: number;
  generated_at: string;
  entries: HistoryEntry[];
}

export function toApiHistory(dataset: Dataset, entries: HistoryEntry[]): ApiHistory {
  return { version: API_VERSION, generated_at: dataset.generated_at, entries };
}

export function jsonResponse(body: unknown): Response {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

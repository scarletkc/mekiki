import type { Dataset, ModelRecord } from '@/lib/dataset';
import type { HistoryEntry, HistoryModel } from '@/lib/history';
import { intelligenceTier, valueTier } from '@/lib/scoring';
import { getDataset } from '@/lib/site-data';

export interface RecordSpec {
  name?: string;
  vendor?: string;
  status?: 'active' | 'legacy';
  intelligence?: number | null;
  value?: number | null;
  price?: number | null;
  blended?: number | null;
  free?: boolean;
}

export function record(id: string, spec: RecordSpec = {}): ModelRecord {
  const intelligence = spec.intelligence === undefined ? 80 : spec.intelligence;
  const value = spec.value === undefined ? 50 : spec.value;
  const price = spec.price === undefined ? 1 : spec.price;
  const blended = spec.blended === undefined ? price : spec.blended;
  return {
    id,
    name: spec.name ?? id,
    vendor: spec.vendor ?? 'Vendor',
    status: spec.status ?? 'active',
    rating: {
      intelligence: {
        score: intelligence,
        tier: intelligence === null ? null : intelligenceTier(intelligence),
        breakdown: {},
      },
      cost: {
        tier: blended === null ? null : 'mid',
        index: blended === null ? null : 50,
        blended,
        input: blended,
        output: blended,
        cache_read: blended,
        free: spec.free ?? false,
      },
      value: {
        score: value,
        tier: value === null ? null : valueTier(value),
        cost_basis: price === null ? null : 'run_cost',
        effective_price: price,
        cost_index: price === null ? null : 50,
      },
    },
    price_source: 'modelsdev',
    facts: {
      context: null,
      release_date: null,
      open_weights: null,
      modalities: null,
      index_cost_usd: null,
    },
    source_ids: {
      modelsdev: id,
      aa: null,
      arena_text: null,
      arena_webdev: null,
      arena_agent: null,
      livebench: null,
    },
    matched: { modelsdev: true, aa: false, arena: false, livebench: false },
    openrouter: null,
    url: `https://mekiki.fog.moe/m/${id}`,
  };
}

export async function datasetOf(models: ModelRecord[]): Promise<Dataset> {
  return { ...(await getDataset()), generated_at: '2026-11-20T06:00:00.000Z', models };
}

export function recorded(
  date: string,
  scores: Record<string, { name?: string; intelligence?: number | null; value?: number | null }>,
): HistoryEntry {
  const models: Record<string, HistoryModel> = {};
  for (const [id, spec] of Object.entries(scores)) {
    models[id] = {
      name: spec.name ?? id,
      status: 'active',
      intelligence: { score: spec.intelligence ?? null, tier: null },
      cost: { tier: null, blended: null, input: null, output: null, cache_read: null },
      value: { score: spec.value ?? null, tier: null },
    };
  }
  return { date, models };
}

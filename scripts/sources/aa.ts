import { z } from 'astro/zod';
import type { AaModel } from '../../src/lib/snapshots';
import { suggest } from '../lib/candidates';
import { getJson } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

const ENDPOINT = 'https://artificialanalysis.ai/api/v2/language/models/free';
const MAX_PAGES = 20;

const pageSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z
    .object({ has_more: z.boolean().nullish(), total_pages: z.number().nullish() })
    .nullish(),
});

const optionalNumber = z.number().nullish();

const modelSchema = z.object({
  slug: z.string().min(1),
  name: z.string().nullish(),
  evaluations: z.object({ artificial_analysis_intelligence_index: optionalNumber }).nullish(),
  artificial_analysis_intelligence_index_cost: z.object({ total_cost: optionalNumber }).nullish(),
});

export const aaAdapter: SourceAdapter<'aa'> = {
  id: 'aa',
  minTotal: 50,

  async fetch({ env }) {
    const key = env.AA_API_KEY?.trim();
    if (!key) return { skip: 'AA_API_KEY is not set.' };

    const items: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const parsed = pageSchema.safeParse(
        await getJson(`${ENDPOINT}?page=${page}`, { 'x-api-key': key }),
      );
      if (!parsed.success) {
        throw new SourceDataError(`Unexpected response shape: ${parsed.error.issues[0]?.message}`);
      }
      items.push(...parsed.data.data);
      const { has_more: hasMore, total_pages: totalPages } = parsed.data.pagination ?? {};
      const more = hasMore ?? (totalPages != null && page < totalPages);
      if (!more || parsed.data.data.length === 0) return { raw: items };
    }
    throw new SourceDataError(`Still more pages after ${MAX_PAGES}; refusing to continue.`);
  },

  transform(raw, tracked) {
    if (!Array.isArray(raw)) throw new SourceDataError('Expected a list of models.');

    const warnings: string[] = [];
    const bySlug = new Map<string, AaModel>();
    let invalid = 0;
    for (const item of raw) {
      const parsed = modelSchema.safeParse(item);
      if (!parsed.success) {
        invalid += 1;
        continue;
      }
      const {
        slug,
        name,
        evaluations,
        artificial_analysis_intelligence_index_cost: cost,
      } = parsed.data;
      if (bySlug.has(slug)) {
        warnings.push(`Slug "${slug}" is listed more than once; kept the first entry.`);
        continue;
      }
      bySlug.set(slug, {
        name: name ?? null,
        aa_intelligence: evaluations?.artificial_analysis_intelligence_index ?? null,
        index_cost_usd: cost?.total_cost ?? null,
      });
    }
    if (invalid > raw.length * 0.2) {
      throw new SourceDataError(`${invalid} of ${raw.length} models failed validation.`);
    }
    if (invalid > 0) warnings.push(`${invalid} models failed validation and were ignored.`);

    let top: number | null = null;
    for (const { aa_intelligence: value } of bySlug.values()) {
      if (value !== null) top = top === null ? value : Math.max(top, value);
    }
    if (top === null) throw new SourceDataError('No model has an Intelligence Index.');
    const frontier = { aa_intelligence: top };

    const pool = [...bySlug.entries()].map(([id, model]) => ({ id, text: model.name ?? '' }));
    const models: Record<string, AaModel> = {};
    const unmatched: Unmatched[] = [];
    for (const model of tracked) {
      const slug = model.sources.aa ?? null;
      const entry = slug === null ? undefined : bySlug.get(slug);
      if (slug !== null && entry) {
        models[slug] = entry;
      } else {
        unmatched.push({
          model,
          field: 'sources.aa',
          value: slug,
          candidates: suggest(model, pool),
        });
      }
    }

    return {
      snapshot: { source: 'aa', total: bySlug.size, frontier, models },
      unmatched,
      warnings,
    };
  },
};

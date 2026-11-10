/**
 * Artificial Analysis: Intelligence Index and the cost of running the full
 * Intelligence Index. Free API, key in the `x-api-key` header (env
 * `AA_API_KEY`). Attribution is required on every tier.
 *
 * Endpoint: GET /api/v2/language/models/free?page=N (the one the free tier
 * may call; /language/models is Pro only). 100 requests per 24 hours.
 *
 * Response shape, per https://artificialanalysis.ai/data-api/docs/reference
 * as read on 2026-11-11:
 *   { tier, intelligence_index_version,
 *     pagination: { page, page_size, total_pages, has_more },
 *     data: [{ id, name, slug, release_date, model_creator: { id, name },
 *       evaluations: { artificial_analysis_intelligence_index,
 *         artificial_analysis_coding_index, … },
 *       artificial_analysis_intelligence_index_cost:
 *         { total_cost, cost_per_task: { total_cost } },
 *       pricing: { price_1m_input_tokens, price_1m_output_tokens, … }, … }] }
 *
 * Checked against the live API on 2026-11-11 through a CI run: 734 models
 * parsed without a validation failure. The free tier returns null for the
 * Coding Index on every model, so that index is not read; coding ability
 * comes from Arena's WebDev board instead (see ./arena.ts).
 *
 * Token use. The run cost is price × tokens, so dividing it by the model's
 * price leaves how many tokens the run burned. The value rating compares
 * that with the typical figure among the leading models, which is taken
 * from the full leaderboard here and stored as `reference.index_token_use`.
 */
import { z } from 'astro/zod';
import { scoringConfig } from '../../src/lib/scoring.config';
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
  artificial_analysis_intelligence_index_cost: z
    .object({
      total_cost: optionalNumber,
      cost_per_task: z.object({ total_cost: optionalNumber }).nullish(),
    })
    .nullish(),
  pricing: z
    .object({ price_1m_input_tokens: optionalNumber, price_1m_output_tokens: optionalNumber })
    .nullish(),
});

/** Artificial Analysis blends prices at three parts input to one part output. */
const BLEND = { input: 3, output: 1 };

/**
 * Token use of an index run, in millions of tokens: the run's cost divided
 * by the model's blended list price. It is not a real token count (the free
 * API has none), but it separates how many tokens a model burns from what
 * it charges for each, and models are only ever compared with each other.
 */
export function tokenUse(
  cost: number | null | undefined,
  input: number | null | undefined,
  output: number | null | undefined,
): number | null {
  if (cost == null || input == null || output == null || !(cost > 0)) return null;
  const blended = (BLEND.input * input + BLEND.output * output) / (BLEND.input + BLEND.output);
  return blended > 0 ? cost / blended : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const significant = (value: number, digits: number) => Number(value.toPrecision(digits));

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
    const notes: string[] = [];
    const bySlug = new Map<string, AaModel>();
    /** Every model that has both a score and a token use, for the reference figure. */
    const scored: { intelligence: number; use: number }[] = [];
    /** Tasks per index run (total cost ÷ cost per task), to see whether runs are the same size. */
    const runSizes: number[] = [];
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
        pricing,
      } = parsed.data;
      if (bySlug.has(slug)) {
        warnings.push(`Slug "${slug}" is listed more than once; kept the first entry.`);
        continue;
      }
      const intelligence = evaluations?.artificial_analysis_intelligence_index ?? null;
      const total = cost?.total_cost ?? null;
      const use = tokenUse(total, pricing?.price_1m_input_tokens, pricing?.price_1m_output_tokens);
      if (intelligence !== null && use !== null) scored.push({ intelligence, use });
      const perTask = cost?.cost_per_task?.total_cost;
      if (total !== null && total > 0 && perTask != null && perTask > 0) {
        runSizes.push(total / perTask);
      }
      bySlug.set(slug, {
        name: name ?? null,
        aa_intelligence: intelligence,
        index_cost_usd: total,
        index_token_use: use === null ? null : significant(use, 4),
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

    // Typical token use: the median among the leaders. The whole board is
    // the wrong yardstick, because it is mostly small models that do not
    // reason and burn far fewer tokens than anything tracked here.
    const leaders = [...scored]
      .sort((a, b) => b.intelligence - a.intelligence)
      .slice(0, scoringConfig.value.tokenUseReferenceSize);
    const typical = median(leaders.map((item) => item.use));
    // Three significant digits, so a newcomer among the leaders that barely
    // moves the median does not cause a commit.
    const reference = {
      index_token_use: typical === null ? null : significant(typical, 3),
      index_token_use_models: leaders.length,
    };
    if (typical === null) {
      warnings.push('No model has both a run cost and a price; value cannot count token use.');
    } else {
      const overall = median(scored.map((item) => item.use)) ?? typical;
      notes.push(
        `Typical token use is ${reference.index_token_use} M tokens: the median of the top ${leaders.length} models by Intelligence Index (${significant(overall, 3)} across all ${scored.length} models with a run cost and a price).`,
      );
    }
    if (runSizes.length > 0) {
      const smallest = Math.min(...runSizes);
      const largest = Math.max(...runSizes);
      notes.push(
        `Index runs span ${Math.round(smallest)} to ${Math.round(largest)} tasks (median ${Math.round(median(runSizes) ?? 0)}), going by total cost over cost per task for ${runSizes.length} models.`,
      );
    }

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
      snapshot: { source: 'aa', total: bySlug.size, frontier, reference, models },
      unmatched,
      warnings,
      notes,
    };
  },
};

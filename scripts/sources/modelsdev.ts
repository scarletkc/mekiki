/**
 * models.dev: prices, context window, release date, open weights and
 * modalities. No key needed.
 *
 * Response shape (checked against the live API on 2026-11-11):
 *   { [provider]: { id, name, models: { [model]: {
 *       name, release_date, open_weights, modalities: { input[], output[] },
 *       limit: { context, output }, cost: { input, output, cache_read, … }, …
 *   } } } }
 * Prices are per provider, which is why the mapping carries a provider
 * prefix: `anthropic/claude-opus-5-5`.
 */
import { z } from 'astro/zod';
import type { ModelsdevModel } from '../../src/lib/snapshots';
import { suggest, type Candidate } from '../lib/candidates';
import { getJson } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

export const MODELSDEV_URL = 'https://models.dev/api.json';

// Only the outer structure is validated for the whole payload; individual
// models are parsed one by one, so a malformed entry for a model nobody
// tracks cannot break the sync.
const payloadSchema = z.record(
  z.string(),
  z.object({ models: z.record(z.string(), z.unknown()) }).loose(),
);

const optionalNumber = z.number().nullish();

const modelSchema = z.object({
  name: z.string().nullish(),
  release_date: z.string().nullish(),
  open_weights: z.boolean().nullish(),
  modalities: z
    .object({
      input: z.array(z.string()).nullish(),
      output: z.array(z.string()).nullish(),
    })
    .nullish(),
  limit: z.object({ context: optionalNumber }).nullish(),
  cost: z
    .object({ input: optionalNumber, output: optionalNumber, cache_read: optionalNumber })
    .nullish(),
});

export const modelsdevAdapter: SourceAdapter<'modelsdev'> = {
  id: 'modelsdev',
  minTotal: 500,

  async fetch() {
    return { raw: await getJson(MODELSDEV_URL) };
  },

  transform(raw, tracked) {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SourceDataError(`Unexpected response shape: ${parsed.error.issues[0]?.message}`);
    }
    const providers = parsed.data;

    let total = 0;
    const pool: Candidate[] = [];
    for (const [provider, { models }] of Object.entries(providers)) {
      for (const model of Object.keys(models)) {
        total += 1;
        pool.push({ id: `${provider}/${model}` });
      }
    }

    const models: Record<string, ModelsdevModel> = {};
    const unmatched: Unmatched[] = [];
    const warnings: string[] = [];

    for (const model of tracked) {
      const sourceId = model.sources.modelsdev ?? model.id;
      const slash = sourceId.indexOf('/');
      const provider = sourceId.slice(0, slash);
      const name = sourceId.slice(slash + 1);
      const rawModel = slash > 0 ? providers[provider]?.models[name] : undefined;
      if (rawModel === undefined) {
        unmatched.push({
          model,
          field: 'sources.modelsdev',
          value: sourceId,
          candidates: suggest(model, pool),
        });
        continue;
      }
      const item = modelSchema.safeParse(rawModel);
      if (!item.success) {
        warnings.push(
          `${sourceId}: unexpected fields (${item.error.issues[0]?.message}); skipped.`,
        );
        continue;
      }
      const { data } = item;
      if (data.cost?.input == null || data.cost?.output == null) {
        warnings.push(`${sourceId}: no input/output price on models.dev.`);
      }
      models[sourceId] = {
        name: data.name ?? null,
        input: data.cost?.input ?? null,
        output: data.cost?.output ?? null,
        cache_read: data.cost?.cache_read ?? null,
        context: data.limit?.context ?? null,
        release_date: data.release_date ?? null,
        open_weights: data.open_weights ?? null,
        modalities: data.modalities
          ? { input: data.modalities.input ?? [], output: data.modalities.output ?? [] }
          : null,
      };
    }

    return {
      snapshot: { source: 'modelsdev', total, frontier: {}, models },
      unmatched,
      warnings,
    };
  },
};

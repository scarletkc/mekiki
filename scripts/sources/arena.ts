/**
 * Arena (formerly LMArena) text leaderboard, from the Hugging Face dataset
 * `lmarena-ai/leaderboard-dataset` (CC BY 4.0), config `text`, split
 * `latest`. No key needed.
 *
 * The split is read as its auto-converted Parquet file (one ~0.6 MB
 * download) rather than through the Datasets Server's JSON endpoints:
 * when this was written, /filter intermittently answered 500 ("the dataset
 * index is loading") or timed out, and /rows would need 100+ requests.
 *
 * Columns (checked against the live file on 2026-11-11): model_name,
 * organization, license, rating, rating_lower, rating_upper, variance,
 * vote_count, rank, category, leaderboard_publish_date.
 * There is one row per model per category; only `overall` is used.
 * The same model appears once per reasoning level, e.g.
 * "Claude Opus 5 (High)" and "Claude Opus 5 (Max)", so a mapping must name
 * the exact entry.
 */
import { parquetReadObjects } from 'hyparquet';
import { z } from 'astro/zod';
import type { ArenaModel } from '../../src/lib/snapshots';
import { suggest } from '../lib/candidates';
import { getBytes } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

export const ARENA_PARQUET_URL =
  'https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/text/latest/0.parquet';
const CATEGORY = 'overall';
const COLUMNS = ['model_name', 'rating', 'category', 'leaderboard_publish_date'];

const rowSchema = z.object({
  model_name: z.string().min(1),
  rating: z.number(),
  category: z.string(),
  leaderboard_publish_date: z.string().nullish(),
});

const round2 = (value: number) => Math.round(value * 100) / 100;

export const arenaAdapter: SourceAdapter<'arena'> = {
  id: 'arena',
  minTotal: 50,

  async fetch() {
    const file = await getBytes(ARENA_PARQUET_URL);
    return { raw: await parquetReadObjects({ file, columns: COLUMNS }) };
  },

  transform(raw, tracked) {
    if (!Array.isArray(raw)) throw new SourceDataError('Expected a list of rows.');

    const warnings: string[] = [];
    const ratings = new Map<string, { rating: number; published: string | null }>();
    let invalid = 0;
    for (const row of raw) {
      const parsed = rowSchema.safeParse(row);
      if (!parsed.success) {
        invalid += 1;
        continue;
      }
      const { model_name: name, rating, category, leaderboard_publish_date: published } =
        parsed.data;
      if (category !== CATEGORY) continue;
      const existing = ratings.get(name);
      if (existing) warnings.push(`"${name}" is listed more than once; kept the higher rating.`);
      if (!existing || rating > existing.rating) {
        ratings.set(name, { rating, published: published ?? null });
      }
    }
    if (invalid > raw.length * 0.2) {
      throw new SourceDataError(`${invalid} of ${raw.length} rows failed validation.`);
    }
    if (invalid > 0) warnings.push(`${invalid} rows failed validation and were ignored.`);

    let top: number | null = null;
    for (const { rating } of ratings.values()) top = top === null ? rating : Math.max(top, rating);

    const pool = [...ratings.keys()].map((id) => ({ id }));
    const models: Record<string, ArenaModel> = {};
    const unmatched: Unmatched[] = [];
    for (const model of tracked) {
      const entry = model.sourceId === null ? undefined : ratings.get(model.sourceId);
      if (entry && model.sourceId !== null) {
        models[model.sourceId] = { arena_text: round2(entry.rating), published: entry.published };
      } else {
        unmatched.push({
          model,
          reason: model.sourceId === null ? 'unmapped' : 'not_found',
          candidates: suggest(model, pool),
        });
      }
    }

    return {
      snapshot: {
        source: 'arena',
        total: ratings.size,
        frontier: { arena_text: top === null ? null : round2(top) },
        models,
      },
      unmatched,
      warnings,
    };
  },
};

/**
 * Arena (formerly LMArena) leaderboards, from the Hugging Face dataset
 * `lmarena-ai/leaderboard-dataset` (CC BY 4.0). No key needed. Two boards
 * are used: `text` and `webdev`, each from its `latest` split.
 *
 * A split is read as its auto-converted Parquet file (one small download)
 * rather than through the Datasets Server's JSON endpoints: when this was
 * written, /filter intermittently answered 500 ("the dataset index is
 * loading") or timed out, and /rows would need 100+ requests.
 *
 * Columns, identical on both boards (checked against the live files on
 * 2026-11-11): model_name, organization, license, rating, rating_lower,
 * rating_upper, variance, vote_count, rank, category,
 * leaderboard_publish_date.
 * There is one row per model per category; only `overall` is used.
 *
 * The same model appears once per reasoning level ("Claude Opus 5 (High)",
 * "Claude Opus 5 (Max)"), and the levels listed differ between boards, so
 * each board has its own mapping field and a mapping must name the exact
 * entry.
 */
import { parquetReadObjects } from 'hyparquet';
import { z } from 'astro/zod';
import type { ArenaModel } from '../../src/lib/snapshots';
import { suggest } from '../lib/candidates';
import { getBytes } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

/** The boards in use: metric key (also the `sources.<key>` mapping field) → dataset config. */
export const ARENA_BOARDS = { arena_text: 'text', arena_webdev: 'webdev' } as const;
export type ArenaBoard = keyof typeof ARENA_BOARDS;
const BOARDS = Object.keys(ARENA_BOARDS) as ArenaBoard[];

/** The board whose size is checked to tell an outage from real data. */
const MAIN_BOARD: ArenaBoard = 'arena_text';
const CATEGORY = 'overall';
const COLUMNS = ['model_name', 'rating', 'category', 'leaderboard_publish_date'];

export const arenaParquetUrl = (config: string) =>
  `https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/${config}/latest/0.parquet`;

const rowSchema = z.object({
  model_name: z.string().min(1),
  rating: z.number(),
  category: z.string(),
  leaderboard_publish_date: z.string().nullish(),
});

export type ArenaRaw = Record<ArenaBoard, unknown>;

const round2 = (value: number) => Math.round(value * 100) / 100;

interface Rating {
  rating: number;
  published: string | null;
}

/** The `overall` ratings of one board, by model name. */
function readBoard(board: ArenaBoard, rows: unknown, warnings: string[]): Map<string, Rating> {
  if (!Array.isArray(rows)) throw new SourceDataError(`${board}: expected a list of rows.`);
  const ratings = new Map<string, Rating>();
  let invalid = 0;
  for (const row of rows) {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      invalid += 1;
      continue;
    }
    const { model_name: name, rating, category, leaderboard_publish_date: published } = parsed.data;
    if (category !== CATEGORY) continue;
    const existing = ratings.get(name);
    if (existing) {
      warnings.push(`${board}: "${name}" is listed more than once; kept the higher rating.`);
    }
    if (!existing || rating > existing.rating) {
      ratings.set(name, { rating, published: published ?? null });
    }
  }
  if (invalid > rows.length * 0.2) {
    throw new SourceDataError(`${board}: ${invalid} of ${rows.length} rows failed validation.`);
  }
  if (invalid > 0) warnings.push(`${board}: ${invalid} rows failed validation and were ignored.`);
  return ratings;
}

export const arenaAdapter: SourceAdapter<'arena'> = {
  id: 'arena',
  minTotal: 50,

  async fetch() {
    const raw = {} as ArenaRaw;
    for (const board of BOARDS) {
      const file = await getBytes(arenaParquetUrl(ARENA_BOARDS[board]));
      raw[board] = await parquetReadObjects({ file, columns: COLUMNS });
    }
    return { raw };
  },

  transform(raw, tracked) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SourceDataError('Expected one list of rows per board.');
    }

    const warnings: string[] = [];
    const frontier: Record<string, number | null> = {};
    const models: Record<string, ArenaModel> = {};
    const unmatched: Unmatched[] = [];
    let total = 0;

    for (const board of BOARDS) {
      const ratings = readBoard(board, (raw as ArenaRaw)[board], warnings);
      if (board === MAIN_BOARD) total = ratings.size;
      if (ratings.size === 0) throw new SourceDataError(`${board}: no ratings found.`);

      let top = -Infinity;
      for (const { rating } of ratings.values()) top = Math.max(top, rating);
      frontier[board] = round2(top);

      const pool = [...ratings.keys()].map((id) => ({ id }));
      for (const model of tracked) {
        const name = model.sources[board] ?? null;
        const entry = name === null ? undefined : ratings.get(name);
        if (name === null || !entry) {
          unmatched.push({
            model,
            field: `sources.${board}`,
            value: name,
            candidates: suggest(model, pool),
          });
          continue;
        }
        const existing = models[name] ?? { arena_text: null, arena_webdev: null, published: null };
        models[name] = {
          ...existing,
          [board]: round2(entry.rating),
          published: existing.published ?? entry.published,
        };
      }
    }

    return { snapshot: { source: 'arena', total, frontier, models }, unmatched, warnings };
  },
};

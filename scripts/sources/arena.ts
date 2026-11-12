import { parquetReadObjects } from 'hyparquet';
import { z } from 'astro/zod';
import { measuredFloor } from '../../src/lib/scoring';
import type { ArenaModel } from '../../src/lib/snapshots';
import { suggest } from '../lib/candidates';
import { getBytes } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

export const ARENA_BOARDS = {
  arena_text: { config: 'text', column: 'rating', decimals: 2 },
  arena_webdev: { config: 'webdev', column: 'rating', decimals: 2 },
  arena_agent: { config: 'agent', column: 'score', decimals: 4 },
} as const;
export type ArenaBoard = keyof typeof ARENA_BOARDS;
const BOARDS = Object.keys(ARENA_BOARDS) as ArenaBoard[];

const MAIN_BOARD: ArenaBoard = 'arena_text';
const CATEGORY = 'overall';

export const arenaParquetUrl = (config: string) =>
  `https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/${config}/latest/0.parquet`;

const rowSchema = z.object({
  model_name: z.string().min(1),
  rating: z.number(),
  category: z.string(),
  leaderboard_publish_date: z.string().nullish(),
});

export type ArenaRaw = Record<ArenaBoard, unknown>;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

interface Rating {
  rating: number;
  published: string | null;
}

function readBoard(board: ArenaBoard, rows: unknown, warnings: string[]): Map<string, Rating> {
  if (!Array.isArray(rows)) throw new SourceDataError(`${board}: expected a list of rows.`);
  const ratings = new Map<string, Rating>();
  const { column } = ARENA_BOARDS[board];
  let invalid = 0;
  for (const row of rows) {
    const score =
      row !== null && typeof row === 'object'
        ? (row as Record<string, unknown>)[column]
        : undefined;
    const parsed = rowSchema.safeParse({ ...row, rating: score });
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
      const { config, column } = ARENA_BOARDS[board];
      const file = await getBytes(arenaParquetUrl(config));
      raw[board] = await parquetReadObjects({
        file,
        columns: ['model_name', 'organization', column, 'category', 'leaderboard_publish_date'],
      });
    }
    return { raw };
  },

  transform(raw, tracked) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SourceDataError('Expected one list of rows per board.');
    }

    const warnings: string[] = [];
    const frontier: Record<string, number | null> = {};
    const floor: Record<string, number | null> = {};
    const models: Record<string, ArenaModel> = {};
    const unmatched: Unmatched[] = [];
    let total = 0;

    for (const board of BOARDS) {
      const ratings = readBoard(board, (raw as ArenaRaw)[board], warnings);
      if (board === MAIN_BOARD) total = ratings.size;
      if (ratings.size === 0) throw new SourceDataError(`${board}: no ratings found.`);

      const { decimals } = ARENA_BOARDS[board];
      let top = -Infinity;
      for (const { rating } of ratings.values()) top = Math.max(top, rating);
      frontier[board] = round(top, decimals);
      const measured = measuredFloor(
        board,
        [...ratings.values()].map(({ rating }) => rating),
      );
      if (measured !== null) floor[board] = round(measured, decimals);

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
        const existing = models[name] ?? {
          arena_text: null,
          arena_webdev: null,
          arena_agent: null,
          published: null,
        };
        models[name] = {
          ...existing,
          [board]: round(entry.rating, decimals),
          published: existing.published ?? entry.published,
        };
      }
    }

    return {
      snapshot: {
        source: 'arena',
        total,
        frontier,
        ...(Object.keys(floor).length > 0 ? { floor } : {}),
        models,
      },
      unmatched,
      warnings,
    };
  },
};

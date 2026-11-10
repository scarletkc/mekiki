/**
 * Terminal-Bench, the official leaderboard at https://www.tbench.ai/. No
 * key. There is no documented API or data file, so the board is read from
 * the home page: Next.js streams the page's data to the browser as
 * `self.__next_f.push([1,"…"])` calls, and the default board is in there as
 * one JSON object, `{"leaderboard":{…},"rows":[…]}`. Checked against the
 * live page on 2026-11-11 (Terminal-Bench 4.1, 35 rows).
 *
 * The page always shows the newest board, so the snapshot records the
 * board's title as its edition. Scores of different editions do not
 * compare, and a new edition starts with few rows.
 *
 * A row is an agent tool, a model and a reasoning effort, and most vendors'
 * models are only listed inside that vendor's own tool. The mapping
 * therefore names the whole row: "<agent> / <model> / <effort>".
 *
 * The site states no licence for the scores (the benchmark's code and
 * tasks are Apache-2.0), so they are republished with attribution only.
 */
import { z } from 'astro/zod';
import type { TerminalBenchModel } from '../../src/lib/snapshots';
import { suggest } from '../lib/candidates';
import { getText } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

const PAGE = 'https://www.tbench.ai/';
const MARKER = '{"leaderboard":{';
const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

/** The JSON object or array that starts at `start`, found by matching brackets outside strings. */
function balanced(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/** Pure: the board embedded in the home page's HTML. Throws when it is not there. */
export function parseBoardPage(html: string): unknown {
  let stream = '';
  for (const match of html.matchAll(CHUNK)) {
    try {
      stream += JSON.parse(match[1]!) as string;
    } catch {
      // Not a string chunk; nothing to read from it.
    }
  }
  const at = stream.indexOf(MARKER);
  const json = at < 0 ? null : balanced(stream, at);
  if (json === null) throw new SourceDataError('No leaderboard found in the page.');
  try {
    return JSON.parse(json);
  } catch {
    throw new SourceDataError('The leaderboard in the page is not valid JSON.');
  }
}

const labelled = z.object({ label: z.string().trim().min(1) });

const boardSchema = z.object({
  leaderboard: z.object({ title: z.string().trim().min(1) }),
  rows: z.array(z.unknown()),
});

const rowSchema = z.object({
  /** Rows the site hides carry another status. */
  status: z.string().nullish(),
  metadata: z.object({
    agent_display: labelled,
    model_display: labelled,
    reasoning_effort: z.string().nullish(),
    date: z.string().nullish(),
  }),
  metrics: z.object({ accuracy: z.number() }),
});

/** The name a model file uses for a row. */
export const terminalBenchRow = (agent: string, model: string, effort: string | null) =>
  `${agent} / ${model} / ${effort ?? 'default'}`;

const round2 = (value: number) => Math.round(value * 100) / 100;

export const terminalBenchAdapter: SourceAdapter<'terminal_bench'> = {
  id: 'terminal_bench',
  // A board that has just rolled over to a new edition is short.
  minTotal: 5,

  async fetch() {
    return { raw: parseBoardPage(await getText(PAGE)) };
  },

  transform(raw, tracked) {
    const board = boardSchema.safeParse(raw);
    if (!board.success) throw new SourceDataError('Expected a leaderboard with rows.');

    const warnings: string[] = [];
    const rows = new Map<string, TerminalBenchModel & { terminal_bench: number }>();
    let invalid = 0;
    for (const item of board.data.rows) {
      const parsed = rowSchema.safeParse(item);
      if (!parsed.success) {
        invalid += 1;
        continue;
      }
      const { status, metadata, metrics } = parsed.data;
      if (status != null && status !== 'display') continue;
      const agent = metadata.agent_display.label;
      const model = metadata.model_display.label;
      const effort = metadata.reasoning_effort?.trim() || null;
      const name = terminalBenchRow(agent, model, effort);
      const existing = rows.get(name);
      if (existing) warnings.push(`"${name}" is listed more than once; kept the higher score.`);
      if (!existing || metrics.accuracy > existing.terminal_bench) {
        rows.set(name, {
          terminal_bench: round2(metrics.accuracy),
          agent,
          model,
          effort,
          date: metadata.date ?? null,
        });
      }
    }
    if (invalid > board.data.rows.length * 0.2) {
      throw new SourceDataError(`${invalid} of ${board.data.rows.length} rows failed validation.`);
    }
    if (invalid > 0) warnings.push(`${invalid} rows failed validation and were ignored.`);
    if (rows.size === 0) throw new SourceDataError('The leaderboard has no rows.');

    let top = -Infinity;
    for (const { terminal_bench: score } of rows.values()) top = Math.max(top, score);

    const pool = [...rows.entries()].map(([id, row]) => ({ id, text: row.model ?? '' }));
    const models: Record<string, TerminalBenchModel> = {};
    const unmatched: Unmatched[] = [];
    for (const model of tracked) {
      const name = model.sources.terminal_bench ?? null;
      const row = name === null ? undefined : rows.get(name);
      if (name !== null && row) {
        models[name] = row;
      } else {
        unmatched.push({
          model,
          field: 'sources.terminal_bench',
          value: name,
          candidates: suggest(model, pool),
        });
      }
    }

    return {
      snapshot: {
        source: 'terminal_bench',
        total: rows.size,
        edition: board.data.leaderboard.title,
        frontier: { terminal_bench: top },
        models,
      },
      unmatched,
      warnings,
    };
  },
};

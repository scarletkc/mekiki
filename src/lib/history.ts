/**
 * Rating history (docs/SPEC.md §4.5).
 *
 * Once per UTC day, `pnpm sync` (or `pnpm history`) records what the site
 * shows for every model: scores, tiers and prices. Each day is one JSON line
 * in data/history.jsonl, and a day is only written when something changed
 * since the line before it. The changelog, the RSS feeds and the trend
 * charts are all derived from this file when the site is built.
 *
 * The history keeps what the site showed at the time, not a recomputation:
 * a change to the scoring config shows up as changes on the next recording.
 *
 * Must not import `astro:*` modules (the Node scripts use this too).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';
import type { Dataset } from './dataset';

export const HISTORY_FILE = 'data/history.jsonl';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nullableNumber = z.number().nullable();

// Tiers are plain strings rather than enums so that renaming a tier in the
// config later never invalidates the lines recorded before it.
export const historyModelSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'legacy']),
  intelligence: z.object({ score: nullableNumber, tier: z.string().nullable() }),
  cost: z.object({
    tier: z.string().nullable(),
    /** Blended price, USD per 1M tokens. */
    blended: nullableNumber,
    input: nullableNumber,
    output: nullableNumber,
    cache_read: nullableNumber,
  }),
  value: z.object({ score: nullableNumber, tier: z.string().nullable() }),
});

export const historyEntrySchema = z.object({
  /** UTC day the entry describes, `YYYY-MM-DD`. */
  date: z.string().regex(DATE),
  /** Every listed model on that day, keyed by canonical ID. */
  models: z.record(z.string(), historyModelSchema),
});

export type HistoryModel = z.infer<typeof historyModelSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** `YYYY-MM-DD` of a moment, in UTC. */
export function utcDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** Trim floating-point noise from a computed price without changing its value. */
const tidy = (value: number | null): number | null =>
  value === null ? null : Number(value.toFixed(6));

/** What the site shows for each model on `date`, in the shape the history stores. */
export function historyEntry(dataset: Dataset, date: string): HistoryEntry {
  const models: Record<string, HistoryModel> = {};
  const sorted = [...dataset.models].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  for (const model of sorted) {
    const { intelligence, cost, value } = model.rating;
    models[model.id] = {
      name: model.name,
      status: model.status,
      intelligence: { score: intelligence.score, tier: intelligence.tier },
      cost: {
        tier: cost.tier,
        blended: tidy(cost.blended),
        input: cost.input,
        output: cost.output,
        cache_read: cost.cache_read,
      },
      value: { score: value.score, tier: value.tier },
    };
  }
  return { date, models };
}

/** JSON with object keys sorted, so two entries compare by content alone. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : item,
  );
}

/** True when two entries describe the same models, whatever their dates. */
export function sameModels(a: HistoryEntry, b: HistoryEntry): boolean {
  return canonical(a.models) === canonical(b.models);
}

export type AddOutcome =
  /** A new day was appended. */
  | 'added'
  /** Today's entry was replaced, or removed because today matches the day before again. */
  | 'updated'
  /** Nothing changed. */
  | 'unchanged'
  /** The history already has a later day (a clock went backwards); nothing was touched. */
  | 'skipped';

/**
 * Add the entry for one day. A re-run on the same day replaces that day's
 * entry, so the latest state wins, and a day that looks exactly like the
 * day before is not stored at all: a missing day means "same as before".
 */
export function addEntry(
  history: HistoryEntry[],
  entry: HistoryEntry,
): { history: HistoryEntry[]; outcome: AddOutcome } {
  if (history.some((item) => item.date > entry.date)) return { history, outcome: 'skipped' };

  const before = history.filter((item) => item.date < entry.date);
  const sameDay = history.find((item) => item.date === entry.date);
  const previous = before.at(-1);

  if (previous && sameModels(previous, entry)) {
    return { history: before, outcome: sameDay ? 'updated' : 'unchanged' };
  }
  if (sameDay && sameModels(sameDay, entry)) return { history, outcome: 'unchanged' };
  return { history: [...before, entry], outcome: sameDay ? 'updated' : 'added' };
}

/**
 * Parse the history file. Lines that are not valid JSON or do not match the
 * schema are counted and left out; entries come back sorted by date, and a
 * repeated date keeps its last line.
 */
export function parseHistory(text: string): { entries: HistoryEntry[]; invalid: number } {
  const byDate = new Map<string, HistoryEntry>();
  let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      invalid += 1;
      continue;
    }
    const parsed = historyEntrySchema.safeParse(raw);
    if (!parsed.success) {
      invalid += 1;
      continue;
    }
    byDate.set(parsed.data.date, parsed.data);
  }
  const entries = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { entries, invalid };
}

/** One line per day, oldest first. */
export function serializeHistory(entries: HistoryEntry[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');
}

export function historyPath(root: string = process.cwd()): string {
  return join(root, HISTORY_FILE);
}

/**
 * Read the history file. A missing file is an empty history; broken lines
 * are skipped with a warning, so the site build never fails on it.
 */
export function readHistory(root: string = process.cwd()): {
  entries: HistoryEntry[];
  invalid: number;
} {
  let text: string;
  try {
    text = readFileSync(historyPath(root), 'utf8');
  } catch {
    return { entries: [], invalid: 0 };
  }
  const result = parseHistory(text);
  if (result.invalid > 0) {
    console.warn(`[history] ${result.invalid} invalid line(s) in ${HISTORY_FILE} were ignored.`);
  }
  return result;
}

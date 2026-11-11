import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';
import type { Dataset } from './dataset';

export const HISTORY_FILE = 'data/history.jsonl';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nullableNumber = z.number().nullable();

export const historyModelSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'legacy']),
  intelligence: z.object({ score: nullableNumber, tier: z.string().nullable() }),
  cost: z.object({
    tier: z.string().nullable(),
    blended: nullableNumber,
    input: nullableNumber,
    output: nullableNumber,
    cache_read: nullableNumber,
  }),
  value: z.object({ score: nullableNumber, tier: z.string().nullable() }),
});

export const historyEntrySchema = z.object({
  date: z.string().regex(DATE),
  models: z.record(z.string(), historyModelSchema),
});

export type HistoryModel = z.infer<typeof historyModelSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export function utcDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

const tidy = (value: number | null): number | null =>
  value === null ? null : Number(value.toFixed(6));

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

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : item,
  );
}

export function sameModels(a: HistoryEntry, b: HistoryEntry): boolean {
  return canonical(a.models) === canonical(b.models);
}

export type AddOutcome = 'added' | 'updated' | 'unchanged' | 'skipped';

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

export function serializeHistory(entries: HistoryEntry[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');
}

export function historyPath(root: string = process.cwd()): string {
  return join(root, HISTORY_FILE);
}

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

/**
 * Records today's ratings in data/history.jsonl. Shared by `pnpm sync`,
 * which records after refreshing the snapshots, and `pnpm history`, which
 * records from the files as they are, without going online.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildDataset } from '../../src/lib/dataset';
import {
  HISTORY_FILE,
  addEntry,
  historyEntry,
  historyPath,
  readHistory,
  serializeHistory,
  utcDate,
  type AddOutcome,
} from '../../src/lib/history';
import { changelogConfig } from '../../src/lib/scoring.config';
import { loadSnapshots } from '../../src/lib/snapshots';
import { readModelEntries } from './content';

export interface RecordResult {
  date: string;
  outcome: AddOutcome | 'invalid' | 'off';
  /** Human-readable summary for the console and the job summary. */
  message: string;
}

export function recordHistory(
  options: { now?: Date; dryRun?: boolean; root?: string; enabled?: boolean } = {},
): RecordResult {
  const now = options.now ?? new Date();
  const root = options.root ?? process.cwd();
  const date = utcDate(now);

  if (!(options.enabled ?? changelogConfig.recordHistory)) {
    return {
      date,
      outcome: 'off',
      message:
        'off until the site is published (changelogConfig.recordHistory); nothing was recorded.',
    };
  }

  const { entries, invalid } = readHistory(root);
  if (invalid > 0) {
    // Rewriting the file would silently drop the broken lines.
    return {
      date,
      outcome: 'invalid',
      message: `${HISTORY_FILE} has ${invalid} invalid line(s); fix or remove them, then run \`pnpm history\`. Nothing was recorded.`,
    };
  }

  const dataset = buildDataset(readModelEntries(root), loadSnapshots(root), { now });
  const { history, outcome } = addEntry(entries, historyEntry(dataset, date));
  if (outcome !== 'unchanged' && outcome !== 'skipped' && !options.dryRun) {
    const path = historyPath(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeHistory(history));
  }

  const verb = options.dryRun ? 'would be ' : '';
  const total = `${history.length} ${history.length === 1 ? 'day' : 'days'} in total`;
  const messages: Record<AddOutcome, string> = {
    added: `${date} ${verb}recorded (${total}).`,
    updated: `${date} ${verb}updated (${total}).`,
    unchanged: `no change since the last recorded day (${entries.at(-1)?.date ?? 'none'}).`,
    skipped: `${HISTORY_FILE} already has days after ${date}; nothing was recorded. Check the system clock.`,
  };
  return { date, outcome, message: messages[outcome] };
}

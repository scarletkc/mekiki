/**
 * Astro-side entry point to the dataset. Pages and API endpoints all call
 * `getDataset()`, which is computed once per build so every page and every
 * JSON file carries the same numbers and the same `generated_at`.
 */
import { buildChangelog, type Changelog } from './changelog';
import { buildDataset, type Dataset } from './dataset';
import { readHistory, type HistoryEntry } from './history';
import { readModelList } from './model-list';
import { loadSnapshots } from './snapshots';

let cached: Promise<Dataset> | undefined;

async function load(): Promise<Dataset> {
  return buildDataset(readModelList(), loadSnapshots());
}

export function getDataset(): Promise<Dataset> {
  cached ??= load();
  return cached;
}

let history: { entries: HistoryEntry[]; changelog: Changelog } | undefined;

/** The recorded history and the changelog derived from it, read once per build. */
export function getHistory(): { entries: HistoryEntry[]; changelog: Changelog } {
  if (!history) {
    const { entries } = readHistory();
    history = { entries, changelog: buildChangelog(entries) };
  }
  return history;
}

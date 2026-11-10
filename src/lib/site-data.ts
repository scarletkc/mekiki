/**
 * Astro-side entry point to the dataset. Pages and API endpoints all call
 * `getDataset()`, which is computed once per build so every page and every
 * JSON file carries the same numbers and the same `generated_at`.
 */
import { getCollection } from 'astro:content';
import { buildDataset, type Dataset } from './dataset';
import { loadSnapshots } from './snapshots';

let cached: Promise<Dataset> | undefined;

async function load(): Promise<Dataset> {
  const collection = await getCollection('models');
  const entries = collection.map((entry) => ({ id: entry.id, data: entry.data }));
  return buildDataset(entries, loadSnapshots());
}

export function getDataset(): Promise<Dataset> {
  cached ??= load();
  return cached;
}

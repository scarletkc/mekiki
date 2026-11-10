/**
 * Astro-side entry point to the dataset. Pages and API endpoints all call
 * `getDataset()`, which is computed once per build so every page and every
 * JSON file carries the same numbers and the same `generated_at`.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { buildDataset, type Dataset, type ModelRecord } from './dataset';
import type { ModelEntry } from './model-schema';
import { loadSnapshots } from './snapshots';

type ModelCollectionEntry = CollectionEntry<'models'>;

let cached: Promise<{ dataset: Dataset; entries: Map<string, ModelCollectionEntry> }> | undefined;

async function load() {
  const collection = await getCollection('models');
  const entries: ModelEntry[] = collection.map((entry) => ({
    id: entry.id,
    data: entry.data,
    hasReview: (entry.body ?? '').trim().length > 0,
  }));
  return {
    dataset: buildDataset(entries, loadSnapshots()),
    entries: new Map(collection.map((entry) => [entry.id, entry])),
  };
}

export async function getDataset(): Promise<Dataset> {
  cached ??= load();
  return (await cached).dataset;
}

/** A model together with its content entry (needed to render the long review). */
export async function getModelPages(): Promise<
  { model: ModelRecord; entry: ModelCollectionEntry }[]
> {
  cached ??= load();
  const { dataset, entries } = await cached;
  return dataset.models.map((model) => ({ model, entry: entries.get(model.id)! }));
}

import type { ModelEntry } from '../../src/lib/model-schema';
import type { SourceId } from '../../src/lib/snapshots';
import { aaAdapter } from './aa';
import { arenaAdapter } from './arena';
import { livebenchAdapter } from './livebench';
import { modelsdevAdapter } from './modelsdev';
import type { SourceAdapter, TrackedModel } from './types';

/** Every data source. To add one, write an adapter and list it here. */
export const adapters: { [S in SourceId]: SourceAdapter<S> } = {
  modelsdev: modelsdevAdapter,
  aa: aaAdapter,
  arena: arenaAdapter,
  livebench: livebenchAdapter,
};

/** The listed models as the adapters see them. */
export function trackedModels(entries: ModelEntry[]): TrackedModel[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.data.name,
    sources: entry.data.sources,
  }));
}

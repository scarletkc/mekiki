import type { ModelEntry } from '../../src/lib/model-schema';
import type { SourceId } from '../../src/lib/snapshots';
import { aaAdapter } from './aa';
import { arenaAdapter } from './arena';
import { modelsdevAdapter } from './modelsdev';
import type { SourceAdapter, TrackedModel } from './types';

/** Every data source. To add one, write an adapter and list it here. */
export const adapters: { [S in SourceId]: SourceAdapter<S> } = {
  modelsdev: modelsdevAdapter,
  aa: aaAdapter,
  arena: arenaAdapter,
};

/** The frontmatter field that maps a model to each source. */
export const MAPPING_FIELD: Record<SourceId, string> = {
  modelsdev: 'sources.modelsdev',
  aa: 'sources.aa',
  arena: 'sources.arena_text',
};

/** The model files as one source sees them. */
export function trackedFor(source: SourceId, entries: ModelEntry[]): TrackedModel[] {
  return entries.map((entry) => {
    const { modelsdev, aa, arena_text: arenaText } = entry.data.sources;
    const sourceId =
      source === 'modelsdev' ? (modelsdev ?? entry.id) : source === 'aa' ? (aa ?? null) : (arenaText ?? null);
    return { id: entry.id, name: entry.data.name, sourceId };
  });
}

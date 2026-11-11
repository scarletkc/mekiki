import type { ModelFrontmatter } from '../../src/lib/model-schema';
import type { SnapshotOf, SourceId } from '../../src/lib/snapshots';

export interface TrackedModel {
  id: string;
  name: string;
  sources: ModelFrontmatter['sources'];
}

export interface Unmatched {
  model: TrackedModel;
  field: string;
  value: string | null;
  candidates: string[];
}

export interface TransformResult<S extends SourceId> {
  snapshot: Omit<SnapshotOf<S>, 'fetched_at'>;
  unmatched: Unmatched[];
  warnings: string[];
}

export interface FetchContext {
  env: NodeJS.ProcessEnv;
}

export interface SourceAdapter<S extends SourceId> {
  id: S;
  minTotal: number;
  fetch(context: FetchContext): Promise<{ raw: unknown } | { skip: string }>;
  transform(raw: unknown, tracked: TrackedModel[]): TransformResult<S>;
}

export class SourceDataError extends Error {
  override name = 'SourceDataError';
}

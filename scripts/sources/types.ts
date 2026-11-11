/**
 * Contract every data-source adapter implements (docs/SPEC.md §4.2):
 * fetch → validate (Zod) → trim to the tracked models → snapshot.
 *
 * To add a leaderboard: make an adapter write the new metric (a new adapter
 * registered in ./index.ts, or another board in an existing one), add the
 * field to the snapshot schema in src/lib/snapshots.ts and the metric to
 * src/lib/scoring.config.ts.
 */
import type { ModelFrontmatter } from '../../src/lib/model-schema';
import type { SnapshotOf, SourceId } from '../../src/lib/snapshots';

/** A listed model, as the adapters see it. */
export interface TrackedModel {
  /** Canonical mekiki ID, `<provider>/<model>`. */
  id: string;
  name: string;
  /** The model's ID in each source, from the model list. */
  sources: ModelFrontmatter['sources'];
}

export interface Unmatched {
  model: TrackedModel;
  /** The mapping field to fix, e.g. `sources.arena_text`. */
  field: string;
  /** The value that was looked up; null when the field is empty. */
  value: string | null;
  /** Closest entries in the source, for a human to pick from. Never applied automatically. */
  candidates: string[];
}

export interface TransformResult<S extends SourceId> {
  /** Snapshot without `fetched_at`, which the sync runner sets. */
  snapshot: Omit<SnapshotOf<S>, 'fetched_at'>;
  unmatched: Unmatched[];
  /** Non-fatal oddities worth showing in the job summary. */
  warnings: string[];
}

export interface FetchContext {
  env: NodeJS.ProcessEnv;
}

export interface SourceAdapter<S extends SourceId> {
  id: S;
  /**
   * Fewest models the full source must return to be believed. Fewer than
   * this is treated as an outage and the old snapshot is kept.
   */
  minTotal: number;
  /** Returns the raw payload, or `{ skip: reason }` when the source cannot be queried. */
  fetch(context: FetchContext): Promise<{ raw: unknown } | { skip: string }>;
  /** Pure: validates the payload and trims it to the tracked models. Throws on invalid data. */
  transform(raw: unknown, tracked: TrackedModel[]): TransformResult<S>;
}

/** Thrown when a source returns something that must not overwrite the old snapshot. */
export class SourceDataError extends Error {
  override name = 'SourceDataError';
}

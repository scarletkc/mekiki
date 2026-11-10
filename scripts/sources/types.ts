/**
 * Contract every data-source adapter implements (docs/SPEC.md §5.3):
 * fetch → validate (Zod) → trim to the tracked models → snapshot.
 *
 * To add a leaderboard: write an adapter, register it in ./index.ts, add
 * its snapshot schema to src/lib/snapshots.ts and a metric to
 * src/lib/scoring.config.ts.
 */
import type { SnapshotOf, SourceId } from '../../src/lib/snapshots';

/** A model file, seen from one source. */
export interface TrackedModel {
  /** Canonical mekiki ID, `<provider>/<model>`. */
  id: string;
  name: string;
  /** The model's ID in this source, from its frontmatter; null when not mapped. */
  sourceId: string | null;
}

export interface Unmatched {
  model: TrackedModel;
  /** `unmapped`: no ID in the frontmatter. `not_found`: the ID is not in the source. */
  reason: 'unmapped' | 'not_found';
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

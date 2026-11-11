/**
 * Snapshot files written by `pnpm sync` and read by the site build
 * (docs/SPEC.md §4.3). The build never touches the network: it only reads
 * these files, and a missing or broken file simply means "no data".
 *
 * Must not import `astro:*` modules (the Node scripts use this too).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';

export const SNAPSHOT_DIR = 'data/snapshots';

export const SOURCE_IDS = ['modelsdev', 'aa', 'arena', 'livebench'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** Static facts about each source, used for attribution and links. */
export const SOURCE_INFO: Record<SourceId, { name: string; url: string; license: string | null }> =
  {
    modelsdev: { name: 'models.dev', url: 'https://models.dev/', license: 'MIT' },
    aa: { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/', license: null },
    arena: { name: 'Arena', url: 'https://arena.ai/leaderboard', license: 'CC BY 4.0' },
    livebench: { name: 'LiveBench', url: 'https://livebench.ai/', license: null },
  };

const frontier = z.record(z.string(), z.number().nullable());
const nullableNumber = z.number().nullable();

function snapshotOf<S extends string, M extends z.ZodType>(source: S, model: M) {
  return z.object({
    source: z.literal(source),
    /** When the data in this file was last fetched and found changed. */
    fetched_at: z.string(),
    /** How many models the full source listed; used to spot a broken sync. */
    total: z.number().int().nonnegative().optional(),
    /** Which release of the leaderboard the data is from, when the source has releases. */
    edition: z.string().optional(),
    /** Best raw score of each metric across the source's full leaderboard. */
    frontier,
    /** Tracked models only, keyed by the model's ID in that source. */
    models: z.record(z.string(), model),
  });
}

export const modelsdevModelSchema = z.object({
  name: z.string().nullable(),
  /** USD per 1M tokens. */
  input: nullableNumber,
  output: nullableNumber,
  cache_read: nullableNumber,
  /** Context window in tokens. */
  context: nullableNumber,
  release_date: z.string().nullable(),
  open_weights: z.boolean().nullable(),
  modalities: z.object({ input: z.array(z.string()), output: z.array(z.string()) }).nullable(),
});

export const aaModelSchema = z.object({
  name: z.string().nullable(),
  aa_intelligence: nullableNumber,
  /** Total USD spent running the full Intelligence Index on this model. */
  index_cost_usd: nullableNumber,
});

// One entry per model name. The same name can appear on several boards, and
// a name may exist on one board only, so each rating is nullable.
export const arenaModelSchema = z.object({
  /** Rating on the text board. */
  arena_text: nullableNumber.default(null),
  /** Rating on the WebDev board. */
  arena_webdev: nullableNumber.default(null),
  /** IPS score on the agent board (Agent Arena). */
  arena_agent: nullableNumber.default(null),
  /** Date of the leaderboard release these ratings come from. */
  published: z.string().nullable(),
});

export const livebenchModelSchema = z.object({
  /**
   * Score, 0–100: the weighted mean of the categories the AA Intelligence
   * Index does not already test (`livebenchCategories` in scoring.config.ts).
   */
  livebench: nullableNumber,
});

export const snapshotSchemas = {
  modelsdev: snapshotOf('modelsdev', modelsdevModelSchema),
  aa: snapshotOf('aa', aaModelSchema),
  arena: snapshotOf('arena', arenaModelSchema),
  livebench: snapshotOf('livebench', livebenchModelSchema),
};

export type ModelsdevSnapshot = z.infer<typeof snapshotSchemas.modelsdev>;
export type AaSnapshot = z.infer<typeof snapshotSchemas.aa>;
export type ArenaSnapshot = z.infer<typeof snapshotSchemas.arena>;
export type LivebenchSnapshot = z.infer<typeof snapshotSchemas.livebench>;
export type ModelsdevModel = z.infer<typeof modelsdevModelSchema>;
export type AaModel = z.infer<typeof aaModelSchema>;
export type ArenaModel = z.infer<typeof arenaModelSchema>;
export type LivebenchModel = z.infer<typeof livebenchModelSchema>;

export interface Snapshots {
  modelsdev: ModelsdevSnapshot | null;
  aa: AaSnapshot | null;
  arena: ArenaSnapshot | null;
  livebench: LivebenchSnapshot | null;
}

export type SnapshotOf<S extends SourceId> = NonNullable<Snapshots[S]>;

export function snapshotPath(source: SourceId, root: string = process.cwd()): string {
  return join(root, SNAPSHOT_DIR, `${source}.json`);
}

/** Read one snapshot. Returns null when the file is missing, unreadable or invalid. */
export function readSnapshot<S extends SourceId>(
  source: S,
  root: string = process.cwd(),
): SnapshotOf<S> | null {
  let text: string;
  try {
    text = readFileSync(snapshotPath(source, root), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = snapshotSchemas[source].safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.warn(`[snapshots] ${source}.json is invalid and will be ignored.`);
      return null;
    }
    return parsed.data as SnapshotOf<S>;
  } catch {
    console.warn(`[snapshots] ${source}.json is not valid JSON and will be ignored.`);
    return null;
  }
}

export function loadSnapshots(root: string = process.cwd()): Snapshots {
  return {
    modelsdev: readSnapshot('modelsdev', root),
    aa: readSnapshot('aa', root),
    arena: readSnapshot('arena', root),
    livebench: readSnapshot('livebench', root),
  };
}

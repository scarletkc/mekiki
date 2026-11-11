import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';

export const SNAPSHOT_DIR = 'data/snapshots';

export const SOURCE_IDS = ['modelsdev', 'aa', 'arena', 'livebench'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

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
    fetched_at: z.string(),
    total: z.number().int().nonnegative().optional(),
    edition: z.string().optional(),
    frontier,
    models: z.record(z.string(), model),
  });
}

export const modelsdevModelSchema = z.object({
  name: z.string().nullable(),
  input: nullableNumber,
  output: nullableNumber,
  cache_read: nullableNumber,
  context: nullableNumber,
  release_date: z.string().nullable(),
  open_weights: z.boolean().nullable(),
  modalities: z.object({ input: z.array(z.string()), output: z.array(z.string()) }).nullable(),
});

export const aaModelSchema = z.object({
  name: z.string().nullable(),
  aa_intelligence: nullableNumber,
  index_cost_usd: nullableNumber,
});

export const arenaModelSchema = z.object({
  arena_text: nullableNumber.default(null),
  arena_webdev: nullableNumber.default(null),
  arena_agent: nullableNumber.default(null),
  published: z.string().nullable(),
});

export const livebenchModelSchema = z.object({
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

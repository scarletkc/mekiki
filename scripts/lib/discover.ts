/**
 * Model discovery: builds the list of models the site shows from the sources
 * themselves. `pnpm sync` writes the result to data/models.json; hand-written
 * corrections live in data/model-overrides.yaml (src/lib/model-list.ts).
 *
 * A model is listed when it has an Artificial Analysis Intelligence Index,
 * is on at least one Arena board, and has an official price on models.dev,
 * that is a price from the provider that makes the model. One row per model:
 * where a source lists a model once per reasoning level, the highest level
 * is used.
 *
 * Names are matched by exact normalised key, never by similarity. The key
 * drops anything in parentheses (reasoning level, build date, harness), any
 * dated build suffix (`-20261017`), and everything that is not a letter or
 * a digit: "GPT-6.1 Sol (Max)", `gpt-6-1-sol` and `gpt-6.1-sol` all become
 * `gpt-6-1-sol`. Artificial Analysis is keyed by its slug, because its names
 * carry extras ("DeepSeek V4 Pro 0813 (Max)").
 */
import { z } from 'astro/zod';
import type { GeneratedModel } from '../../src/lib/model-list';
import type { ModelEntry } from '../../src/lib/model-schema';

/** The mapping fields discovery fills, in the order they are reported. */
export const DISCOVERED_FIELDS = [
  'modelsdev',
  'aa',
  'arena_text',
  'arena_webdev',
  'arena_agent',
  'livebench',
] as const;
export type DiscoveredField = (typeof DISCOVERED_FIELDS)[number];

export const ARENA_FIELDS = ['arena_text', 'arena_webdev', 'arena_agent'] as const;
export type ArenaField = (typeof ARENA_FIELDS)[number];

/** Exact normalised key of a model name or ID. */
export function modelKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b20\d{6}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Rank of a reasoning level; higher is more reasoning. */
const EFFORT_RANK: Record<string, number> = {
  max: 7,
  xhigh: 6,
  high: 5,
  thinking: 5,
  reasoning: 5,
  medium: 3,
  low: 2,
  minimal: 1,
  none: 0,
  'non-thinking': 0,
  'non-reasoning': 0,
};
/** A name that names no level sits between medium and high. */
const DEFAULT_EFFORT = 4;
/** Build dates and versions, in the forms the boards use. */
const BUILD =
  /^(\d{8}|\d{6}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{2}|\d{2}-\d{4}|\d{4}|\d{2}-\d{2}|\d{3})$/;
/** Number formats a model was served in; the same model either way. */
const PRECISION = /^(bf16|fp16|fp8|fp4|nvfp4|int8|int4)$/;

export interface Variant {
  /** Highest reasoning level named, or null when none is. */
  effort: number | null;
  /** A build date or version (`20261017`, `2025-09-23`, `0919`, `02-24`, `001`), or null. */
  date: string | null;
  /** Anything else in parentheses, such as a harness. */
  other: string[];
}

/** What the parentheses of a name say: reasoning level, build date, or something else. */
export function variantOf(name: string): Variant {
  const variant: Variant = { effort: null, date: null, other: [] };
  for (const [, inside] of name.matchAll(/\(([^)]*)\)/g)) {
    for (const part of (inside ?? '').split(',')) {
      const token = part.trim().toLowerCase().replace(/\s+/g, '-');
      if (token === '') continue;
      const rank = EFFORT_RANK[token];
      if (rank !== undefined) variant.effort = Math.max(variant.effort ?? 0, rank);
      else if (BUILD.test(token)) variant.date = token;
      else if (!PRECISION.test(token)) variant.other.push(token);
    }
  }
  return variant;
}

export interface BoardEntry {
  name: string;
  /** The model's maker as the board names it, when it does. */
  org: string | null;
  score: number;
}

/**
 * The entry to use among the entries of one model on one board: the highest
 * reasoning level, then the latest build, then the higher score. Entries
 * with something else in parentheses (a harness, say) are a different setup
 * and are only used when nothing else is listed; then the choice is left to
 * a human and null is returned.
 */
export function pickVariant<T extends { name: string; score: number }>(entries: T[]): T | null {
  const plain = entries.filter((entry) => variantOf(entry.name).other.length === 0);
  if (plain.length === 0) return null;
  return [...plain].sort((a, b) => {
    const va = variantOf(a.name);
    const vb = variantOf(b.name);
    const effort = (vb.effort ?? DEFAULT_EFFORT) - (va.effort ?? DEFAULT_EFFORT);
    if (effort !== 0) return effort;
    const date = (vb.date ?? '').localeCompare(va.date ?? '');
    if (date !== 0) return date;
    return b.score - a.score;
  })[0]!;
}

/** Artificial Analysis slug suffixes that name a reasoning level. */
const AA_LEVEL = /-(max|xhigh|high|medium|low|minimal|non-reasoning|reasoning)$/;

export interface AaEntry {
  slug: string;
  name: string | null;
  creator: string | null;
  index: number | null;
}

/** The slug without a reasoning-level suffix, and the rank of that suffix (8 for none). */
export function aaBase(slug: string): { base: string; rank: number } {
  const match = AA_LEVEL.exec(slug);
  if (!match) return { base: slug, rank: 8 };
  return { base: slug.slice(0, match.index), rank: EFFORT_RANK[match[1]!] ?? DEFAULT_EFFORT };
}

export interface ModelsdevEntry {
  provider: string;
  /** The provider's display name, such as "OpenAI". */
  providerName: string | null;
  /** The model's ID inside the provider. */
  id: string;
  name: string | null;
  priced: boolean;
  release: string | null;
}

export interface DiscoveryInput {
  aa: AaEntry[];
  arena: Record<ArenaField, BoardEntry[]>;
  livebench: string[];
  modelsdev: ModelsdevEntry[];
}

export interface DiscoveredModel {
  /** `<provider>/<model>` on models.dev, the same as the canonical ID. */
  id: string;
  name: string;
  vendor: string;
  release_date: string | null;
  sources: Record<DiscoveredField, string | null>;
}

export interface Reject {
  key: string;
  reason: string;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  /** Keys that came close (AA and Arena) but were left out, and why. */
  rejects: Reject[];
  /** Boards where a model's entries were all special setups, left to a human. */
  ambiguous: { field: ArenaField; names: string[] }[];
}

/** Lower-case letters and digits only, for comparing maker names with provider IDs. */
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Maker names that differ from their models.dev provider ID, compacted. */
export const PROVIDER_ALIASES: Record<string, string> = {
  moonshot: 'moonshotai',
  moonshotai: 'moonshotai',
  zhipu: 'zai',
  zhipuai: 'zai',
  mistralai: 'mistral',
};

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === '') continue;
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

export function discoverModels(
  input: DiscoveryInput,
  aliases: Record<string, string> = PROVIDER_ALIASES,
): DiscoveryResult {
  const rejects: Reject[] = [];
  const ambiguous: DiscoveryResult['ambiguous'] = [];
  const alias = new Map(Object.entries(aliases).map(([maker, id]) => [compact(maker), id]));
  const providerOf = (maker: string) => alias.get(compact(maker)) ?? compact(maker);

  // Every AA slug by key, with or without an index, to say why a name has no match.
  const aaAll = groupBy(input.aa, (entry) => modelKey(aaBase(entry.slug).base));

  // Artificial Analysis: the base slug, or else the highest level listed.
  const aa = new Map<string, AaEntry>();
  for (const [key, entries] of groupBy(
    input.aa.filter((entry) => entry.index !== null),
    (entry) => modelKey(aaBase(entry.slug).base),
  )) {
    const best = [...entries].sort((a, b) => aaBase(b.slug).rank - aaBase(a.slug).rank)[0]!;
    aa.set(key, best);
  }

  // Arena: per board, the entry picked among a model's levels.
  const arena = new Map<string, Partial<Record<ArenaField, BoardEntry>>>();
  for (const field of ARENA_FIELDS) {
    for (const [key, entries] of groupBy(input.arena[field], (entry) => modelKey(entry.name))) {
      const picked = pickVariant(entries);
      if (!picked) {
        ambiguous.push({ field, names: entries.map((entry) => entry.name) });
        continue;
      }
      arena.set(key, { ...arena.get(key), [field]: picked });
    }
  }

  // models.dev: only IDs directly under a provider (resellers nest the maker's ID).
  const modelsdev = groupBy(
    input.modelsdev.filter((entry) => !entry.id.includes('/')),
    (entry) => modelKey(entry.id),
  );
  const livebench = new Map<string, string>();
  for (const id of input.livebench) {
    const key = modelKey(id);
    if (key !== '' && !livebench.has(key)) livebench.set(key, id);
  }

  const models: DiscoveredModel[] = [];
  for (const [key, aaEntry] of aa) {
    const boards = arena.get(key);
    if (!boards || ARENA_FIELDS.every((field) => !boards[field])) continue;

    // The maker, as Artificial Analysis and then Arena name it.
    const makers = [aaEntry.creator, ...ARENA_FIELDS.map((field) => boards[field]?.org ?? null)]
      .filter((maker): maker is string => maker !== null && maker.trim() !== '')
      .map(providerOf);
    const offers = modelsdev.get(key) ?? [];
    const own = offers.filter((offer) => makers.includes(compact(offer.provider)) && offer.priced);
    if (own.length === 0) {
      const where = offers.map((offer) => offer.provider).join(', ') || 'nowhere';
      rejects.push({
        key,
        reason: `no official price (maker ${makers[0] ?? 'unknown'}; on models.dev at ${where})`,
      });
      continue;
    }
    // Prefer the plain ID over dated builds of the same model.
    const offer = [...own].sort(
      (a, b) =>
        Number(variantOf(a.id).date !== null || /\d{8}/.test(a.id)) -
          Number(variantOf(b.id).date !== null || /\d{8}/.test(b.id)) || a.id.length - b.id.length,
    )[0]!;

    models.push({
      id: `${offer.provider}/${offer.id}`,
      name: offer.name ?? aaEntry.name ?? key,
      // "MiniMax (minimax.io)" → "MiniMax".
      vendor: (offer.providerName ?? aaEntry.creator ?? offer.provider).replace(
        /\s*\([^)]*\)$/,
        '',
      ),
      release_date: offer.release,
      sources: {
        modelsdev: `${offer.provider}/${offer.id}`,
        aa: aaEntry.slug,
        arena_text: boards.arena_text?.name ?? null,
        arena_webdev: boards.arena_webdev?.name ?? null,
        arena_agent: boards.arena_agent?.name ?? null,
        livebench: livebench.get(key) ?? null,
      },
    });
  }

  // On an Arena board with an official price, but with no AA entry under the
  // same name: either AA has no index for it, or the names differ.
  for (const [key, boards] of arena) {
    if (aa.has(key)) continue;
    const makers = ARENA_FIELDS.map((field) => boards[field]?.org ?? null)
      .filter((maker): maker is string => maker !== null && maker.trim() !== '')
      .map(providerOf);
    const priced = (modelsdev.get(key) ?? []).some(
      (offer) => makers.includes(compact(offer.provider)) && offer.priced,
    );
    if (!priced) continue;
    const listed = aaAll.get(key);
    if (listed) {
      const slugs = listed.map((entry) => entry.slug).join(', ');
      rejects.push({ key, reason: `on AA (${slugs}) without an Intelligence Index` });
      continue;
    }
    // AA slugs that share the first two parts of the key, to spot a different spelling.
    const stem = key.split('-').slice(0, 2).join('-');
    const near = [...aaAll.keys()].filter((other) => other.startsWith(stem)).slice(0, 4);
    rejects.push({
      key,
      reason: `not on AA's list under this name${near.length > 0 ? ` (close: ${near.join(', ')})` : ''}`,
    });
  }

  models.sort((a, b) => a.id.localeCompare(b.id));
  rejects.sort((a, b) => a.key.localeCompare(b.key));
  return { models, rejects, ambiguous };
}

/** The discovered models as written to data/models.json: empty mappings left out. */
export function generatedList(result: DiscoveryResult): GeneratedModel[] {
  return result.models.map((model) => ({
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    sources: Object.fromEntries(
      Object.entries(model.sources).filter((entry): entry is [string, string] => entry[1] !== null),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Reading the raw payloads the adapters fetched.

const aaItem = z.object({
  slug: z.string().min(1),
  name: z.string().nullish(),
  model_creator: z.object({ name: z.string().nullish() }).nullish(),
  evaluations: z.object({ artificial_analysis_intelligence_index: z.number().nullish() }).nullish(),
});

export function aaEntries(raw: unknown): AaEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = aaItem.safeParse(item);
    if (!parsed.success) return [];
    const { slug, name, model_creator: creator, evaluations } = parsed.data;
    return [
      {
        slug,
        name: name ?? null,
        creator: creator?.name ?? null,
        index: evaluations?.artificial_analysis_intelligence_index ?? null,
      },
    ];
  });
}

const arenaRow = z.object({
  model_name: z.string().min(1),
  organization: z.string().nullish(),
  category: z.string(),
  rating: z.number().nullish(),
  score: z.number().nullish(),
});

export function arenaEntries(raw: unknown): Record<ArenaField, BoardEntry[]> {
  const boards = { arena_text: [], arena_webdev: [], arena_agent: [] } as Record<
    ArenaField,
    BoardEntry[]
  >;
  if (raw === null || typeof raw !== 'object') return boards;
  for (const field of ARENA_FIELDS) {
    const rows = (raw as Record<string, unknown>)[field];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const parsed = arenaRow.safeParse(row);
      if (!parsed.success || parsed.data.category !== 'overall') continue;
      const score = parsed.data.rating ?? parsed.data.score;
      if (score === null || score === undefined) continue;
      boards[field].push({
        name: parsed.data.model_name,
        org: parsed.data.organization ?? null,
        score,
      });
    }
  }
  return boards;
}

export function livebenchIds(raw: unknown): string[] {
  const table = (raw as { table?: unknown } | null)?.table;
  if (typeof table !== 'string') return [];
  return table
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(',')[0]?.trim() ?? '')
    .filter((id) => id !== '');
}

const modelsdevModel = z.object({
  name: z.string().nullish(),
  release_date: z.string().nullish(),
  cost: z.object({ input: z.number().nullish(), output: z.number().nullish() }).nullish(),
});

export function modelsdevEntries(raw: unknown): ModelsdevEntry[] {
  if (raw === null || typeof raw !== 'object') return [];
  const entries: ModelsdevEntry[] = [];
  for (const [provider, value] of Object.entries(raw as Record<string, unknown>)) {
    const models = (value as { models?: unknown } | null)?.models;
    const providerName = (value as { name?: unknown } | null)?.name;
    if (models === null || typeof models !== 'object') continue;
    for (const [id, model] of Object.entries(models as Record<string, unknown>)) {
      const parsed = modelsdevModel.safeParse(model);
      if (!parsed.success) continue;
      const { name, release_date: release, cost } = parsed.data;
      entries.push({
        provider,
        providerName: typeof providerName === 'string' ? providerName : null,
        id,
        name: name ?? null,
        priced: typeof cost?.input === 'number' && typeof cost?.output === 'number',
        release: release ?? null,
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Reporting.

/** How the discovered list differs from a previous list: added, dropped, and changed fields. */
export function compareWithList(found: DiscoveredModel[], files: ModelEntry[]) {
  const byId = new Map(found.map((model) => [model.id, model]));
  const fileIds = new Set(files.map((entry) => entry.id));
  const added = found.filter((model) => !fileIds.has(model.id)).map((model) => model.id);
  const dropped = files.filter((entry) => !byId.has(entry.id)).map((entry) => entry.id);
  const changed: { id: string; field: string; file: string | null; found: string | null }[] = [];
  for (const entry of files) {
    const model = byId.get(entry.id);
    if (!model) continue;
    for (const field of ['name', 'vendor'] as const) {
      if (entry.data[field] !== model[field]) {
        changed.push({ id: entry.id, field, file: entry.data[field], found: model[field] });
      }
    }
    for (const field of DISCOVERED_FIELDS) {
      const file =
        field === 'modelsdev'
          ? (entry.data.sources.modelsdev ?? entry.id)
          : (entry.data.sources[field] ?? null);
      if (file !== model.sources[field])
        changed.push({ id: entry.id, field, file, found: model.sources[field] });
    }
  }
  return { added, dropped, changed };
}

/**
 * The discovery report printed by `pnpm sync`, one line per finding, against
 * the previous generated list (overrides not applied).
 */
export function discoveryReport(result: DiscoveryResult, previous: ModelEntry[]): string[] {
  const { added, dropped, changed } = compareWithList(result.models, previous);
  const lines: string[] = [];
  const show = (value: string | null) => (value === null ? '(none)' : `"${value}"`);
  if (changed.length > 0) {
    lines.push('  Changed since the previous list:');
    for (const c of changed)
      lines.push(`    ${c.id} ${c.field}: was ${show(c.file)}, now ${show(c.found)}`);
  }
  if (dropped.length > 0) lines.push(`  Removed: ${dropped.join(', ')}`);
  if (added.length > 0) {
    lines.push('  Added:');
    for (const id of added) {
      const model = result.models.find((m) => m.id === id)!;
      const boards = ARENA_FIELDS.filter((field) => model.sources[field]).length;
      lines.push(
        `    ${id} (${model.vendor}, released ${model.release_date ?? 'unknown'}, ${boards} Arena board${boards === 1 ? '' : 's'}${model.sources.livebench ? ', LiveBench' : ''})`,
      );
    }
  }
  if (result.rejects.length > 0) {
    lines.push('  Left out:');
    for (const r of result.rejects) lines.push(`    ${r.key}: ${r.reason}`);
  }
  if (result.ambiguous.length > 0) {
    lines.push('  Left to a human (only special setups listed):');
    for (const a of result.ambiguous) lines.push(`    ${a.field}: ${a.names.join(' | ')}`);
  }
  return lines;
}

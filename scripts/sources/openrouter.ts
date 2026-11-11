import { z } from 'astro/zod';
import type { OpenrouterModel } from '../../src/lib/snapshots';
import { getJson } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

export const OPENROUTER_RANKINGS_URL = 'https://openrouter.ai/api/v1/datasets/rankings-daily';
export const WINDOW_DAYS = 7;
const OTHER = 'other';
const DAY_MS = 86_400_000;

const VENDOR_ALIASES: Record<string, string> = {
  xai: 'x-ai',
  zai: 'z-ai',
  mistral: 'mistralai',
};

export interface RankingWindow {
  start: string;
  end: string;
}

export interface OpenrouterRaw {
  window: RankingWindow;
  body: unknown;
}

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

export function rankingWindow(now: Date, days: number = WINDOW_DAYS): RankingWindow {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start: isoDay(today - days * DAY_MS), end: isoDay(today - DAY_MS) };
}

const windowLength = ({ start, end }: RankingWindow) =>
  Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;

export function matchKey(id: string): string {
  const [vendor = '', ...rest] = id.toLowerCase().split('/');
  const name = rest
    .join('/')
    .replace(/\./g, '-')
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, '');
  return `${VENDOR_ALIASES[vendor] ?? vendor}/${name}`;
}

const rawSchema = z.object({
  window: z.object({ start: z.string(), end: z.string() }),
  body: z.object({
    data: z.array(z.unknown()),
    meta: z.object({ as_of: z.string().min(1) }).loose(),
  }),
});

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model_permaslug: z.string().min(1),
  total_tokens: z.union([z.string().regex(/^\d+$/).transform(Number), z.number().nonnegative()]),
});

export const openrouterAdapter: SourceAdapter<'openrouter'> = {
  id: 'openrouter',
  minTotal: 40,

  async fetch({ env }) {
    const key = env.OPENROUTER_API_KEY?.trim();
    if (!key) return { skip: 'OPENROUTER_API_KEY is not set.' };
    const window = rankingWindow(new Date());
    const url = `${OPENROUTER_RANKINGS_URL}?start_date=${window.start}&end_date=${window.end}`;
    const body = await getJson(url, { Authorization: `Bearer ${key}` });
    return { raw: { window, body } satisfies OpenrouterRaw };
  },

  transform(raw, tracked) {
    const parsed = rawSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SourceDataError(`Unexpected response shape: ${parsed.error.issues[0]?.message}`);
    }
    const { window, body } = parsed.data;
    const days = windowLength(window);

    const totals = new Map<string, { tokens: number; dates: Set<string> }>();
    const dates = new Set<string>();
    let invalid = 0;
    for (const item of body.data) {
      const row = rowSchema.safeParse(item);
      if (!row.success) {
        invalid += 1;
        continue;
      }
      const { date, model_permaslug: permaslug, total_tokens: tokens } = row.data;
      if (date < window.start || date > window.end) continue;
      dates.add(date);
      if (permaslug === OTHER) continue;
      const entry = totals.get(permaslug) ?? { tokens: 0, dates: new Set<string>() };
      entry.tokens += tokens;
      entry.dates.add(date);
      totals.set(permaslug, entry);
    }
    if (invalid > body.data.length * 0.2) {
      throw new SourceDataError(`${invalid} of ${body.data.length} rows failed validation.`);
    }
    if (dates.size < days) {
      throw new SourceDataError(
        `Only ${dates.size} of the ${days} days from ${window.start} to ${window.end} were returned.`,
      );
    }

    const ranked = [...totals]
      .sort(([a, x], [b, y]) => y.tokens - x.tokens || a.localeCompare(b, 'en'))
      .map(([permaslug, { tokens, dates: present }], index): [string, OpenrouterModel] => [
        permaslug,
        {
          permaslug,
          tokens,
          days: present.size,
          rank: present.size === days ? index + 1 : null,
        },
      ]);
    const byPermaslug = new Map(ranked);
    const byKey = new Map<string, string[]>();
    for (const [permaslug] of ranked) {
      if (permaslug.includes(':')) continue;
      const key = matchKey(permaslug);
      byKey.set(key, [...(byKey.get(key) ?? []), permaslug]);
    }

    const models: Record<string, OpenrouterModel> = {};
    const unmatched: Unmatched[] = [];
    for (const model of tracked) {
      const pinned = model.sources.openrouter;
      if (pinned === null) continue;
      if (pinned !== undefined) {
        const row = byPermaslug.get(pinned);
        if (row) models[model.id] = row;
        continue;
      }
      const builds = byKey.get(matchKey(model.id)) ?? [];
      if (builds.length === 1) {
        models[model.id] = byPermaslug.get(builds[0]!)!;
      } else if (builds.length > 1) {
        unmatched.push({
          model,
          field: 'sources.openrouter',
          value: model.id,
          candidates: builds,
        });
      }
    }

    const warnings =
      invalid > 0 ? [`${invalid} rows failed validation and were ignored.`] : ([] as string[]);
    return {
      snapshot: {
        source: 'openrouter',
        total: totals.size,
        edition: `${window.start}/${window.end}`,
        as_of: body.meta.as_of,
        frontier: {},
        models,
      },
      unmatched,
      warnings,
    };
  },
};

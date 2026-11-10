/**
 * LiveBench 2.0, https://livebench.ai/. No key. The site is a static app
 * that loads one folder of data files per release:
 *   data/<release>/table.csv        one row per model, one column per suite
 *   data/<release>/categories.json  category → suite columns, plus
 *                                   `_overall_weights` (category → weight)
 * The release IDs (dates such as 20261106) are only listed in the site's
 * script, so fetching is three steps: the page, to find the script; the
 * script, to find the newest release; then the two files. Checked against
 * the live site on 2026-11-11 (release 20261106, 33 models).
 *
 * The table has no overall column. The site computes it as the weighted
 * mean of the categories a model has a score for, with weight 1 for a
 * category `_overall_weights` does not list; this adapter does the same.
 *
 * Rows are bare model IDs. Each model runs at its highest effort setting,
 * and where it does not, the ID says so.
 *
 * The site states no licence for the scores (its code is Apache-2.0), so
 * they are republished with attribution only.
 */
import { z } from 'astro/zod';
import type { LivebenchModel } from '../../src/lib/snapshots';
import { suggest } from '../lib/candidates';
import { getJson, getText } from '../lib/http';
import { SourceDataError, type SourceAdapter, type Unmatched } from './types';

const SITE = 'https://livebench.ai/';
const WEIGHTS_KEY = '_overall_weights';

/** Pure: the newest release ID in the site's script, which lists them as ["20261014","20261106"]. */
export function latestRelease(script: string): string {
  const ids: string[] = [];
  for (const list of script.matchAll(/\[\s*"20\d{6}"(?:\s*,\s*"20\d{6}")*\s*\]/g)) {
    for (const id of list[0].matchAll(/20\d{6}/g)) ids.push(id[0]);
  }
  const latest = ids.sort().at(-1);
  if (!latest) throw new SourceDataError('No release found in the site script.');
  return latest;
}

const rawSchema = z.object({
  release: z.string().regex(/^\d{8}$/),
  table: z.string().min(1),
  categories: z.record(z.string(), z.unknown()),
});

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A cell's score; blank and "n/a" cells have none. */
function score(cell: string | undefined): number | null {
  const text = cell?.trim() ?? '';
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export const livebenchAdapter: SourceAdapter<'livebench'> = {
  id: 'livebench',
  minTotal: 10,

  async fetch() {
    const page = await getText(SITE);
    const script = page.match(/static\/js\/main\.[0-9a-z]+\.js/)?.[0];
    if (!script) throw new SourceDataError('No script found in the page.');
    const release = latestRelease(await getText(new URL(script, SITE).href));
    const folder = `${SITE}data/${release}`;
    const table = await getText(`${folder}/table.csv`);
    const categories = await getJson(`${folder}/categories.json`);
    return { raw: { release, table, categories } };
  },

  transform(raw, tracked) {
    const parsed = rawSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SourceDataError('Expected a release ID, a table and a category list.');
    }
    const { release, table, categories } = parsed.data;

    const lines = table.split(/\r?\n/).filter((line) => line.trim() !== '');
    const header = (lines[0] ?? '').split(',').map((cell) => cell.trim());
    if (header[0] !== 'model' || header.length < 2) {
      throw new SourceDataError('The table does not start with a "model" column.');
    }

    // Category → its columns in the table and its weight in the overall score.
    const weights = z.record(z.string(), z.number()).safeParse(categories[WEIGHTS_KEY]);
    const groups: { columns: number[]; weight: number }[] = [];
    for (const [name, suites] of Object.entries(categories)) {
      if (name === WEIGHTS_KEY || !Array.isArray(suites)) continue;
      const columns = suites.map((suite) => header.indexOf(String(suite))).filter((at) => at > 0);
      const weight = weights.success ? (weights.data[name] ?? 1) : 1;
      if (columns.length > 0 && weight > 0) groups.push({ columns, weight });
    }
    if (groups.length === 0) {
      throw new SourceDataError('No category of the category list is a column of the table.');
    }

    const warnings: string[] = [];
    const overall = new Map<string, number>();
    let invalid = 0;
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      const id = cells[0]?.trim() ?? '';
      if (id === '' || cells.length !== header.length) {
        invalid += 1;
        continue;
      }
      let weighted = 0;
      let totalWeight = 0;
      for (const { columns, weight } of groups) {
        const scores = columns
          .map((at) => score(cells[at]))
          .filter((value): value is number => value !== null);
        if (scores.length === 0) continue;
        weighted += weight * mean(scores);
        totalWeight += weight;
      }
      if (totalWeight === 0) continue;
      if (overall.has(id)) {
        warnings.push(`"${id}" is listed more than once; kept the first entry.`);
        continue;
      }
      overall.set(id, round2(weighted / totalWeight));
    }
    if (invalid > (lines.length - 1) * 0.2) {
      throw new SourceDataError(`${invalid} of ${lines.length - 1} rows failed validation.`);
    }
    if (invalid > 0) warnings.push(`${invalid} rows failed validation and were ignored.`);
    if (overall.size === 0) throw new SourceDataError('No model has a score.');

    const pool = [...overall.keys()].map((id) => ({ id }));
    const models: Record<string, LivebenchModel> = {};
    const unmatched: Unmatched[] = [];
    for (const model of tracked) {
      const id = model.sources.livebench ?? null;
      const value = id === null ? undefined : overall.get(id);
      if (id !== null && value !== undefined) {
        models[id] = { livebench: value };
      } else {
        unmatched.push({
          model,
          field: 'sources.livebench',
          value: id,
          candidates: suggest(model, pool),
        });
      }
    }

    return {
      snapshot: {
        source: 'livebench',
        total: overall.size,
        edition: `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6)}`,
        frontier: { livebench: Math.max(...overall.values()) },
        models,
      },
      unmatched,
      warnings,
    };
  },
};

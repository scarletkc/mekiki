/**
 * Changes between consecutive history entries (src/lib/history.ts), for the
 * changelog page, the RSS feeds and the model pages (docs/SPEC.md §7).
 *
 * Only changes that matter are reported: tier changes, price changes, a new
 * leader, models added, removed or moved to legacy, and scores that drifted
 * far enough (changelogConfig.scoreDelta). Leaderboards move a little every
 * day, so reporting every score change would bury the rest.
 *
 * Pure: no I/O, no dates, no Astro imports.
 */
import type { HistoryEntry, HistoryModel } from './history';
import { changelogConfig, type ChangelogConfig } from './scoring.config';

export type RatingKey = 'intelligence' | 'cost' | 'value';
export type ScoredRating = 'intelligence' | 'value';

export interface ModelRef {
  id: string;
  name: string;
}

export interface PriceFields {
  input: number | null;
  output: number | null;
  cache_read: number | null;
}

export type Change =
  | { kind: 'leader'; rating: ScoredRating; model: ModelRef; previous: ModelRef | null }
  | { kind: 'added'; model: ModelRef }
  | { kind: 'removed'; model: ModelRef }
  | { kind: 'status'; model: ModelRef; from: 'active' | 'legacy'; to: 'active' | 'legacy' }
  | {
      kind: 'tier';
      rating: RatingKey;
      model: ModelRef;
      from: string | null;
      to: string | null;
      /** Score before and after; for cost, the blended price. */
      fromFigure: number | null;
      toFigure: number | null;
    }
  | {
      kind: 'price';
      model: ModelRef;
      /** Null when the model had no price on that side. */
      from: PriceFields | null;
      to: PriceFields | null;
      /** The cost tier, when it changed with the price. */
      tier: { from: string | null; to: string | null } | null;
    }
  | { kind: 'score'; rating: ScoredRating; model: ModelRef; from: number; to: number };

export interface ChangelogDay {
  date: string;
  changes: Change[];
}

export interface Changelog {
  /** First recorded day, null when nothing was recorded yet. */
  start: string | null;
  /** Last recorded day. */
  end: string | null;
  /** Days with at least one change, newest first. */
  days: ChangelogDay[];
}

const SCORED: ScoredRating[] = ['intelligence', 'value'];
const KIND_ORDER: Change['kind'][] = [
  'leader',
  'added',
  'removed',
  'status',
  'tier',
  'price',
  'score',
];
const RATING_ORDER: RatingKey[] = ['intelligence', 'cost', 'value'];

const ref = (id: string, model: HistoryModel): ModelRef => ({ id, name: model.name });
const round1 = (value: number) => Math.round(value * 10) / 10;

/** The model with the best score of one rating; ties go to the name first in order. */
export function leaderOf(entry: HistoryEntry, rating: ScoredRating): ModelRef | null {
  let best: { id: string; model: HistoryModel; score: number } | null = null;
  for (const [id, model] of Object.entries(entry.models)) {
    const score = model[rating].score;
    if (score === null) continue;
    if (
      best === null ||
      score > best.score ||
      (score === best.score && model.name.localeCompare(best.model.name, 'en') < 0)
    ) {
      best = { id, model, score };
    }
  }
  return best ? ref(best.id, best.model) : null;
}

function priceOf(model: HistoryModel): PriceFields | null {
  const { input, output, cache_read } = model.cost;
  return input === null || output === null ? null : { input, output, cache_read };
}

function samePrice(a: PriceFields | null, b: PriceFields | null): boolean {
  if (a === null || b === null) return a === b;
  return a.input === b.input && a.output === b.output && a.cache_read === b.cache_read;
}

function sortChanges(changes: Change[]): Change[] {
  const rank = (change: Change) => {
    const rating = 'rating' in change ? RATING_ORDER.indexOf(change.rating) : 0;
    return KIND_ORDER.indexOf(change.kind) * 10 + rating;
  };
  return changes.sort(
    (a, b) => rank(a) - rank(b) || a.model.name.localeCompare(b.model.name, 'en'),
  );
}

/**
 * Every change across the history, grouped by day, newest day first. The
 * first entry is the baseline and reports nothing.
 */
export function buildChangelog(
  entries: HistoryEntry[],
  config: Pick<ChangelogConfig, 'scoreDelta'> = changelogConfig,
): Changelog {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Last reported score per model and rating; a score is reported again
  // once it has drifted `scoreDelta` points from here.
  const baseline = new Map<string, number | null>();
  const key = (id: string, rating: ScoredRating) => `${rating}\u0000${id}`;
  const resetBaseline = (id: string, model: HistoryModel) => {
    for (const rating of SCORED) baseline.set(key(id, rating), model[rating].score);
  };

  const first = sorted[0];
  if (first) for (const [id, model] of Object.entries(first.models)) resetBaseline(id, model);

  const days: ChangelogDay[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1]!;
    const after = sorted[index]!;
    const changes: Change[] = [];

    for (const rating of SCORED) {
      const previous = leaderOf(before, rating);
      const current = leaderOf(after, rating);
      if (current && current.id !== previous?.id) {
        changes.push({ kind: 'leader', rating, model: current, previous });
      }
    }

    for (const [id, model] of Object.entries(after.models)) {
      const old = before.models[id];
      if (!old) {
        changes.push({ kind: 'added', model: ref(id, model) });
        resetBaseline(id, model);
        continue;
      }
      const name = ref(id, model);

      if (old.status !== model.status) {
        changes.push({ kind: 'status', model: name, from: old.status, to: model.status });
      }

      for (const rating of SCORED) {
        const from = old[rating];
        const to = model[rating];
        if (from.tier !== to.tier) {
          changes.push({
            kind: 'tier',
            rating,
            model: name,
            from: from.tier,
            to: to.tier,
            fromFigure: from.score,
            toFigure: to.score,
          });
          baseline.set(key(id, rating), to.score);
          continue;
        }
        const last = baseline.get(key(id, rating)) ?? null;
        if (
          last !== null &&
          to.score !== null &&
          Math.abs(round1(to.score - last)) >= config.scoreDelta
        ) {
          changes.push({ kind: 'score', rating, model: name, from: last, to: to.score });
          baseline.set(key(id, rating), to.score);
        }
      }

      const oldPrice = priceOf(old);
      const newPrice = priceOf(model);
      const costTierChanged = old.cost.tier !== model.cost.tier;
      if (!samePrice(oldPrice, newPrice)) {
        changes.push({
          kind: 'price',
          model: name,
          from: oldPrice,
          to: newPrice,
          tier: costTierChanged ? { from: old.cost.tier, to: model.cost.tier } : null,
        });
      } else if (costTierChanged) {
        // Same price, new tier: the thresholds or the blend weights changed.
        changes.push({
          kind: 'tier',
          rating: 'cost',
          model: name,
          from: old.cost.tier,
          to: model.cost.tier,
          fromFigure: old.cost.blended,
          toFigure: model.cost.blended,
        });
      }
    }

    for (const [id, model] of Object.entries(before.models)) {
      if (!after.models[id]) {
        changes.push({ kind: 'removed', model: ref(id, model) });
        for (const rating of SCORED) baseline.delete(key(id, rating));
      }
    }

    if (changes.length > 0) days.push({ date: after.date, changes: sortChanges(changes) });
  }

  return {
    start: sorted[0]?.date ?? null,
    end: sorted.at(-1)?.date ?? null,
    days: days.reverse(),
  };
}

/** The changes that concern one model, newest first. */
export function changesFor(changelog: Changelog, id: string): { date: string; change: Change }[] {
  return changelog.days.flatMap(({ date, changes }) =>
    changes.filter((change) => change.model.id === id).map((change) => ({ date, change })),
  );
}

export interface SeriesPoint {
  date: string;
  intelligence: number | null;
  value: number | null;
}

/**
 * One model's scores over time, oldest first, for the trend chart. Each
 * point holds until the next one. Days on which the model was not listed
 * after it first appeared become null points, which break the line.
 *
 * `current` is what the site shows now; it replaces any point on or after
 * its date, so the chart always ends on the numbers printed above it.
 */
export function modelSeries(
  entries: HistoryEntry[],
  id: string,
  current?: SeriesPoint,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const entry of entries) {
    if (current && entry.date >= current.date) break;
    const model = entry.models[id];
    if (model) {
      points.push({
        date: entry.date,
        intelligence: model.intelligence.score,
        value: model.value.score,
      });
    } else if (points.length > 0) {
      points.push({ date: entry.date, intelligence: null, value: null });
    }
  }
  if (current) points.push(current);
  return points;
}

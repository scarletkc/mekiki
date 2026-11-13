import { fmt, type Dictionary } from '../i18n';
import { fillSegments, type Segment } from './change-text';
import { leaderOf, type ModelRef, type ScoredRating } from './changelog';
import { compareByIntelligence, type Dataset, type ModelRecord } from './dataset';
import { formatSignedScore } from './format';
import type { HistoryEntry } from './history';
import { newestVersion } from './model-list';
import { leadersConfig, type LeadersConfig } from './scoring.config';

export const LEADER_RATINGS: ScoredRating[] = ['intelligence', 'value'];

const DAY = 86_400_000;

function daysBetween(from: string, to: string): number {
  const span = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(span / DAY));
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export interface LeaderPeriod {
  rating: ScoredRating;
  model: ModelRef;
  from: string;
  to: string | null;
  days: number;
  next: ModelRef | null;
}

export function leaderPeriods(
  entries: HistoryEntry[],
  rating: ScoredRating,
  today: string,
): LeaderPeriod[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const periods: LeaderPeriod[] = [];
  let open: LeaderPeriod | null = null;
  for (const entry of sorted) {
    const leader = leaderOf(entry, rating);
    if (open && leader?.id === open.model.id) {
      open.model = leader;
      continue;
    }
    if (open) {
      open.to = entry.date;
      open.days = daysBetween(open.from, entry.date);
      open.next = leader;
    }
    open = leader
      ? { rating, model: leader, from: entry.date, to: null, days: 0, next: null }
      : null;
    if (open) periods.push(open);
  }
  if (open) open.days = daysBetween(open.from, today);
  return periods;
}

export function recentLeaders(
  entries: HistoryEntry[],
  today: string,
  config: LeadersConfig = leadersConfig,
): LeaderPeriod[] {
  return LEADER_RATINGS.flatMap((rating) =>
    leaderPeriods(entries, rating, today).reverse().slice(0, config.periodsShown),
  );
}

export function dayCount(days: number, t: Dictionary): string {
  return days === 1 ? t.standing.dayOne : fmt(t.standing.dayOther, { n: days });
}

export function periodText(period: LeaderPeriod, t: Dictionary): string {
  return period.to === null
    ? fmt(t.standing.since, { from: period.from })
    : fmt(t.standing.range, { from: period.from, to: period.to });
}

export interface Rank {
  rating: ScoredRating;
  rank: number;
  total: number;
}

export interface Standing {
  ranks: Rank[];
  leader: { model: ModelRef; points: number } | null;
  newer: { model: ModelRef; points: number | null } | null;
  led: LeaderPeriod[];
}

const ref = (model: ModelRecord): ModelRef => ({ id: model.id, name: model.name });

export function modelStanding(
  model: ModelRecord,
  dataset: Dataset,
  entries: HistoryEntry[],
  today: string,
): Standing {
  const active = dataset.models.filter((item) => item.status === 'active');

  const ranks: Rank[] = [];
  for (const rating of LEADER_RATINGS) {
    const own = model.rating[rating].score;
    if (model.status !== 'active' || own === null) continue;
    const scores = active
      .map((item) => item.rating[rating].score)
      .filter((score): score is number => score !== null);
    ranks.push({
      rating,
      rank: 1 + scores.filter((score) => score > own).length,
      total: scores.length,
    });
  }

  const own = model.rating.intelligence.score;
  const newest = newestVersion(model, dataset.models);
  const newestScore = newest?.rating.intelligence.score ?? null;
  const newer = newest
    ? {
        model: ref(newest),
        points: own === null || newestScore === null ? null : round1(newestScore - own),
      }
    : null;

  const top = [...active].sort(compareByIntelligence)[0];
  const topScore = top?.rating.intelligence.score ?? null;
  const leader =
    top && topScore !== null && own !== null && topScore > own && top.id !== newest?.id
      ? { model: ref(top), points: round1(topScore - own) }
      : null;

  const led = LEADER_RATINGS.flatMap((rating) =>
    leaderPeriods(entries, rating, today)
      .filter((period) => period.model.id === model.id)
      .reverse(),
  );

  return { ranks, leader, newer, led };
}

export interface StandingRow {
  key: string;
  label: string;
  value: Segment[];
}

export function standingRows(standing: Standing, t: Dictionary): StandingRow[] {
  const s = t.standing;
  const ahead = (model: ModelRef, points: number | null): Segment[] =>
    points === null ? [model] : [model, ` ${formatSignedScore(points)}`];

  return [
    ...standing.ranks.map(({ rating, rank, total }) => ({
      key: `rank-${rating}`,
      label: s.rank[rating],
      value: [fmt(s.place, { rank, total })],
    })),
    ...(standing.leader
      ? [
          {
            key: 'leader',
            label: s.leader,
            value: ahead(standing.leader.model, standing.leader.points),
          },
        ]
      : []),
    ...(standing.newer
      ? [
          {
            key: 'newer',
            label: s.newer,
            value: ahead(standing.newer.model, standing.newer.points),
          },
        ]
      : []),
    ...standing.led.map((period) => {
      const values = {
        period: periodText(period, t),
        days: dayCount(period.days, t),
      };
      return {
        key: `led-${period.rating}-${period.from}`,
        label: s.led[period.rating],
        value: period.next
          ? fillSegments(s.ledThen, { ...values, model: period.next })
          : fillSegments(s.ledFor, values),
      };
    }),
  ];
}

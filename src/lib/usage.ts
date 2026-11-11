import { fmt, type Dictionary } from '../i18n';
import type { Dataset, ModelRecord } from './dataset';
import { formatDateTime, formatTokens } from './format';

export interface UsagePeriod {
  start: string;
  end: string;
  days: number;
  asOf: string;
}

export function usagePeriod(dataset: Dataset): UsagePeriod | null {
  const { edition, as_of: asOf } = dataset.sources.openrouter;
  const match = edition ? /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(edition) : null;
  if (!match || !asOf) return null;
  const [, start, end] = match as unknown as [string, string, string];
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return { start, end, days, asOf };
}

export function usageBadge(
  model: ModelRecord,
  period: UsagePeriod | null,
  t: Dictionary,
): { label: string; title: string } | null {
  const usage = model.openrouter;
  if (!period || usage?.rank == null) return null;
  return {
    label: fmt(t.usage.badge, { rank: usage.rank }),
    title: fmt(t.usage.badgeTitle, {
      rank: usage.rank,
      tokens: formatTokens(usage.tokens),
      start: period.start,
      end: period.end,
    }),
  };
}

export function usageCell(
  model: ModelRecord,
  period: UsagePeriod | null,
  t: Dictionary,
): { rank: number; title: string } | null {
  const badge = usageBadge(model, period, t);
  const rank = model.openrouter?.rank;
  return badge && rank != null ? { rank, title: badge.title } : null;
}

export function usageCitation(period: UsagePeriod, t: Dictionary): string {
  return fmt(t.usage.citation, { asOf: formatDateTime(period.asOf) });
}

export function usageDetail(model: ModelRecord, period: UsagePeriod, t: Dictionary) {
  const usage = model.openrouter;
  const rows = usage
    ? [
        { label: t.usage.rank, value: usage.rank === null ? null : `#${usage.rank}` },
        { label: t.usage.tokens, value: formatTokens(usage.tokens) },
        { label: t.usage.period, value: `${period.start} – ${period.end}` },
      ]
    : [];
  const notes = [
    usage && usage.rank === null
      ? fmt(t.usage.partial, { days: usage.days, total: period.days })
      : null,
    t.usage.note,
  ].filter((note) => note !== null);
  return {
    rows,
    notFound: usage ? null : t.usage.notFound,
    notes,
    citation: usageCitation(period, t),
  };
}

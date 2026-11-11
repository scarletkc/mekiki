import type { Dictionary } from '../i18n';
import type { Change, ModelRef, PriceFields, RatingKey } from './changelog';
import { formatPrice, formatScore } from './format';

export type Segment = string | ModelRef;

export function fillSegments(template: string, values: Record<string, Segment>): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const value = values[match[1]!];
    if (value === undefined) continue;
    segments.push(template.slice(last, match.index));
    segments.push(value);
    last = match.index! + match[0].length;
  }
  segments.push(template.slice(last));
  return segments.reduce<Segment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (typeof segment === 'string' && typeof previous === 'string') {
      merged[merged.length - 1] = previous + segment;
    } else if (segment !== '') {
      merged.push(segment);
    }
    return merged;
  }, []);
}

function tierLabel(t: Dictionary, rating: RatingKey, tier: string | null): string {
  if (tier === null) return rating === 'cost' ? t.empty.noPrice : t.empty.unrated;
  const labels = t.tier[rating] as Record<string, string>;
  return labels[tier] ?? tier;
}

const figure = (rating: RatingKey, value: number) =>
  rating === 'cost' ? formatPrice(value) : formatScore(value);

function priceText(t: Dictionary, price: PriceFields | null): string {
  return price === null
    ? t.empty.noPrice
    : `${formatPrice(price.input!)} / ${formatPrice(price.output!)}`;
}

const cachePrice = (t: Dictionary, value: number | null) =>
  value === null ? t.empty.noData : formatPrice(value);

export function describeChange(change: Change, t: Dictionary): Segment[] {
  const c = t.changelog;
  switch (change.kind) {
    case 'leader':
      return change.previous
        ? fillSegments(c.leader, {
            model: change.model,
            rating: c.rating[change.rating],
            previous: change.previous,
          })
        : fillSegments(c.leaderFirst, { model: change.model, rating: c.rating[change.rating] });
    case 'added':
      return fillSegments(c.added, { model: change.model });
    case 'removed':
      return fillSegments(c.removed, { model: change.model });
    case 'status':
      return fillSegments(change.to === 'legacy' ? c.legacy : c.active, { model: change.model });
    case 'tier': {
      const values = {
        model: change.model,
        rating: c.rating[change.rating],
        from: tierLabel(t, change.rating, change.from),
        to: tierLabel(t, change.rating, change.to),
      };
      return change.fromFigure !== null && change.toFigure !== null
        ? fillSegments(c.tierFigures, {
            ...values,
            fromFigure: figure(change.rating, change.fromFigure),
            toFigure: figure(change.rating, change.toFigure),
          })
        : fillSegments(c.tier, values);
    }
    case 'score':
      return fillSegments(c.score, {
        model: change.model,
        rating: c.rating[change.rating],
        from: formatScore(change.from),
        to: formatScore(change.to),
      });
    case 'price': {
      const { from, to, tier } = change;
      const parts: string[] = [];
      if (from === null || to === null) {
        parts.push(fillText(c.priceSet, { from: priceText(t, from), to: priceText(t, to) }));
      } else {
        if (from.input !== to.input) {
          parts.push(
            fillText(c.priceInput, {
              from: formatPrice(from.input!),
              to: formatPrice(to.input!),
            }),
          );
        }
        if (from.output !== to.output) {
          parts.push(
            fillText(c.priceOutput, {
              from: formatPrice(from.output!),
              to: formatPrice(to.output!),
            }),
          );
        }
        if (from.cache_read !== to.cache_read) {
          parts.push(
            fillText(c.priceCache, {
              from: cachePrice(t, from.cache_read),
              to: cachePrice(t, to.cache_read),
            }),
          );
        }
      }
      if (tier) {
        parts.push(
          fillText(c.priceTier, {
            from: tierLabel(t, 'cost', tier.from),
            to: tierLabel(t, 'cost', tier.to),
          }),
        );
      }
      return fillSegments(c.price, { model: change.model, details: parts.join(c.listSeparator) });
    }
  }
}

function fillText(template: string, values: Record<string, string>): string {
  return fillSegments(template, values).join('');
}

export function changeText(change: Change, t: Dictionary): string {
  return describeChange(change, t)
    .map((segment) => (typeof segment === 'string' ? segment : segment.name))
    .join('');
}

export function changeCount(n: number, t: Dictionary): string {
  return n === 1 ? t.changelog.countOne : t.changelog.countOther.replace('{n}', String(n));
}

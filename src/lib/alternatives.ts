import { fmt, type Dictionary } from '../i18n';
import type { ModelRef } from './changelog';
import type { Dataset, ModelRecord } from './dataset';
import {
  formatPrice,
  formatPriceChange,
  formatScore,
  formatSignedScore,
  switchCost,
} from './format';
import { modelPrice } from './highlights';
import { alternativesConfig, type AlternativesConfig } from './scoring.config';

export type AlternativeKind = 'value' | 'top';

export interface Alternative {
  kind: AlternativeKind;
  model: ModelRecord;
  intelligence: number;
  price: number;
  ratio: number;
}

export interface Alternatives {
  intelligence: number;
  price: number;
  options: Alternative[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function buildAlternatives(
  model: ModelRecord,
  dataset: Dataset,
  config: AlternativesConfig = alternativesConfig,
): Alternatives | null {
  const intelligence = model.rating.intelligence.score;
  const price = modelPrice(model);
  if (intelligence === null || price === null || price <= 0) return null;

  const pool = dataset.models.flatMap((item) => {
    const score = item.rating.intelligence.score;
    const cost = modelPrice(item);
    return item.id === model.id || item.status !== 'active' || score === null || cost === null
      ? []
      : [{ model: item, intelligence: score, price: cost, ratio: cost / price }];
  });
  const byName = (a: { model: ModelRecord }, b: { model: ModelRecord }) =>
    a.model.name.localeCompare(b.model.name, 'en');

  const ownValue = model.rating.value.score;
  const value = pool
    .filter((item) => {
      const score = item.model.rating.value.score;
      return (
        item.intelligence >= intelligence - config.intelligenceDelta &&
        item.ratio <= 1 - config.minSaving &&
        score !== null &&
        (ownValue === null || score > ownValue)
      );
    })
    .sort(
      (a, b) =>
        (b.model.rating.value.score ?? 0) - (a.model.rating.value.score ?? 0) ||
        a.price - b.price ||
        byName(a, b),
    )[0];

  const top =
    model.rating.intelligence.tier === 'top'
      ? undefined
      : pool
          .filter((item) => item.model.rating.intelligence.tier === 'top')
          .sort((a, b) => a.price - b.price || b.intelligence - a.intelligence || byName(a, b))[0];

  const options: Alternative[] = [];
  if (value) options.push({ kind: 'value', ...value });
  if (top && top.model.id !== value?.model.id) options.push({ kind: 'top', ...top });
  return options.length > 0 ? { intelligence, price, options } : null;
}

export interface AlternativeRow {
  kind: AlternativeKind | 'current';
  label: string;
  model: ModelRef;
  ratio: number;
  intelligence: string;
  intelligenceChange: string | null;
  price: string;
  priceChange: string | null;
  monthly: string;
  yearly: string | null;
}

export function alternativeRows(
  model: ModelRecord,
  alternatives: Alternatives,
  t: Dictionary,
  spend: number = alternativesConfig.monthlySpend,
): AlternativeRow[] {
  const a = t.alternatives;
  return [
    {
      kind: 'current',
      label: a.current,
      model: { id: model.id, name: model.name },
      ratio: 1,
      intelligence: formatScore(alternatives.intelligence),
      intelligenceChange: null,
      price: formatPrice(alternatives.price),
      priceChange: null,
      monthly: switchCost(spend, 1).monthly,
      yearly: null,
    },
    ...alternatives.options.map((option): AlternativeRow => {
      const cost = switchCost(spend, option.ratio);
      return {
        kind: option.kind,
        label: a[option.kind],
        model: { id: option.model.id, name: option.model.name },
        ratio: option.ratio,
        intelligence: formatScore(option.intelligence),
        intelligenceChange: formatSignedScore(
          round1(option.intelligence - alternatives.intelligence),
        ),
        price: option.price === 0 ? t.empty.free : formatPrice(option.price),
        priceChange: formatPriceChange(option.ratio),
        monthly: cost.monthly,
        yearly: fmt(a.yearly, { amount: cost.yearly }),
      };
    }),
  ];
}

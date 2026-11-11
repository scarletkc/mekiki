import { fmt, type Dictionary } from '../i18n';
import type { ModelRecord } from './dataset';
import { formatPrice, formatTokens } from './format';
import { METRIC_KEYS, scoringConfig } from './scoring.config';
import { SOURCE_INFO } from './snapshots';

export interface ModelFact {
  key: string;
  label: string;
  value: string | null;
  empty: string;
  numeric: boolean;
}

export interface FactGroup {
  key: 'price' | 'facts';
  title: string;
  method: 'cost' | null;
  facts: ModelFact[];
  notes: string[];
}

export function modelDetail(model: ModelRecord, t: Dictionary) {
  const { intelligence, cost, value } = model.rating;

  const metrics = METRIC_KEYS.map((key) => {
    const config = scoringConfig.intelligence.metrics[key];
    const item = intelligence.breakdown[key] ?? {
      raw: null,
      normalized: null,
      weight: config.weight,
      frontier: null,
    };
    const mapped = model.source_ids[config.mapping];
    const missing =
      mapped === null ? t.detail.notMapped : item.raw === null ? t.detail.notFound : t.empty.noData;
    return {
      key,
      label: t.metric[key],
      ...item,
      mapped,
      missing,
      url: 'url' in config ? config.url : null,
    };
  });
  const links = [
    model.source_ids.aa
      ? {
          href: `https://artificialanalysis.ai/models/${encodeURIComponent(model.source_ids.aa)}`,
          label: t.detail.linkAa,
          json: false,
        }
      : null,
    ...metrics.map((metric) =>
      metric.url && metric.mapped ? { href: metric.url, label: metric.label, json: false } : null,
    ),
    { href: SOURCE_INFO.modelsdev.url, label: t.detail.linkModelsdev, json: false },
    { href: `/api/models/${model.id}.json`, label: t.detail.linkJson, json: true },
  ].filter((link) => link !== null);

  const costNote = cost.blended === null || cost.free ? null : t.detail.blendedUnit;

  const listed = (price: number | null) =>
    price === null ? null : cost.free ? t.empty.free : formatPrice(price);
  const price = (amount: number | null) => (amount === null ? null : formatPrice(amount));
  const { facts: known } = model;
  const modalities = known.modalities
    ? [
        `${t.detail.modalityIn} ${known.modalities.input.join(', ') || t.empty.noData}`,
        `${t.detail.modalityOut} ${known.modalities.output.join(', ') || t.empty.noData}`,
      ].join('; ')
    : null;
  const fact = (
    key: string,
    label: string,
    text: string | null,
    empty: string = t.empty.noData,
    numeric = true,
  ): ModelFact => ({ key, label, value: text, empty, numeric });
  const prices: ModelFact[] = [
    fact('input', t.detail.input, listed(cost.input), t.empty.noPrice),
    fact('output', t.detail.output, listed(cost.output), t.empty.noPrice),
    fact('cache_read', t.detail.cacheRead, price(cost.cache_read)),
    fact('effective_price', t.detail.effectivePrice, price(value.effective_price), t.empty.noPrice),
  ];
  const facts: ModelFact[] = [
    fact(
      'context',
      t.detail.context,
      known.context === null ? null : fmt(t.detail.tokens, { n: formatTokens(known.context) }),
    ),
    fact('release_date', t.detail.releaseDate, known.release_date),
    fact(
      'weights',
      t.detail.weights,
      known.open_weights === null ? null : known.open_weights ? t.detail.open : t.detail.closed,
      t.empty.noData,
      false,
    ),
    fact('modalities', t.detail.modalities, modalities, t.empty.noData, false),
    fact('index_cost', t.detail.indexCost, price(known.index_cost_usd)),
  ];
  const groups: FactGroup[] = [
    {
      key: 'price',
      title: t.detail.price,
      method: 'cost',
      facts: prices,
      notes: model.price_source === 'override' ? [t.detail.priceOverride] : [],
    },
    { key: 'facts', title: t.detail.facts, method: null, facts, notes: [] },
  ];

  return { metrics, links, costNote, groups };
}

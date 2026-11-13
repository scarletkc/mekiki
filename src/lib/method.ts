import { fmt, LOCALE_INFO, useTranslations, type Locale } from '../i18n';
import type { Dataset } from './dataset';
import { formatCount, formatPercent, formatPrice } from './format';
import { cacheHitPercent, computeBenchmark } from './scoring';
import {
  COST_TIERS,
  INTELLIGENCE_TIERS,
  METRIC_KEYS,
  VALUE_TIERS,
  alternativesConfig,
  livebenchCategories,
  changelogConfig,
  livebenchKeptShare,
  scoringConfig,
  type FloorRule,
} from './scoring.config';
import { SOURCE_IDS, SOURCE_INFO } from './snapshots';
import { usageCitation, usagePeriod } from './usage';

export function methodContent(dataset: Dataset, locale: Locale) {
  const t = useTranslations(locale);
  const m = t.method;
  const { intelligence, cost, value } = scoringConfig;

  const gapFormat = new Intl.NumberFormat(LOCALE_INFO[locale].tag, {
    maximumSignificantDigits: 2,
  });
  const floorLabel = (rule: FloorRule, top: number | null, zero: number | null) => {
    if (rule.type === 'absolute') return fmt(m.floorAbsolute, { value: rule.value });
    if (rule.type === 'below_frontier') return fmt(m.floorBelowFrontier, { gap: rule.gap });
    if (top === null || zero === null) return '—';
    return fmt(m.floorBelowFrontier, { gap: gapFormat.format(top - zero) });
  };

  const shares = computeBenchmark({}, {}).breakdown;
  const metrics = METRIC_KEYS.map((key) => {
    const { source, floor } = intelligence.metrics[key];
    return {
      label: t.metric[key],
      source: SOURCE_INFO[source].name,
      weight: formatPercent(shares[key]?.weight ?? 0),
      floor: floorLabel(floor, dataset.frontier[key], dataset.floor[key]),
    };
  });

  const list = new Intl.ListFormat(LOCALE_INFO[locale].tag, { type: 'conjunction' });
  const measuredRanges = new Map<number, string[]>();
  for (const key of METRIC_KEYS) {
    const { floor } = intelligence.metrics[key];
    if (floor.type !== 'board_share') continue;
    measuredRanges.set(floor.above, [...(measuredRanges.get(floor.above) ?? []), t.metric[key]]);
  }
  const chinese = locale.startsWith('zh');
  const spaced = (text: string) =>
    chinese
      ? text.replace(/(\p{Script=Han})(?=[A-Za-z0-9])|([A-Za-z0-9])(?=\p{Script=Han})/gu, '$1$2 ')
      : text;
  const intelligenceBody = [
    m.intelligenceBody,
    ...[...measuredRanges].map(([above, labels]) =>
      spaced(
        fmt(m.intelligenceShareBody, { metrics: list.format(labels), share: formatPercent(above) }),
      ),
    ),
  ].join(chinese ? '' : ' ');
  const livebenchNote = fmt(m.livebenchBody, {
    kept: list.format(Object.keys(livebenchCategories.kept)),
    dropped: list.format(Object.keys(livebenchCategories.dropped)),
    share: formatPercent(livebenchKeptShare),
  });

  const tierRows = [
    {
      rating: t.rating.intelligence,
      tiers: INTELLIGENCE_TIERS.map((key) => ({
        key,
        label: t.tier.intelligence[key],
        rule: key === 'very_low' ? `< ${intelligence.tiers.low}` : `≥ ${intelligence.tiers[key]}`,
      })),
    },
    {
      rating: `${t.rating.cost} (${m.blendedShort})`,
      tiers: COST_TIERS.map((key) => ({
        key,
        label: t.tier.cost[key],
        rule: key === 'very_high' ? `≥ $${cost.tiers.high}` : `< $${cost.tiers[key]}`,
      })),
    },
    {
      rating: t.rating.value,
      tiers: VALUE_TIERS.map((key) => ({
        key,
        label: t.tier.value[key],
        rule: key === 'very_low' ? `< ${value.tiers.low}` : `≥ ${value.tiers[key]}`,
      })),
    },
  ];

  const typicalTokenUse = dataset.run_cost.typical_token_use;
  const measured = 'run_cost ÷ typical_token_use';
  const formulas = {
    normalize: 'n = clamp(100 × (x − floor) ÷ (frontier − floor), 0, 100)',
    costIndex: `cost_index(price) = clamp(100 × log10(price ÷ ${cost.indexFloorPrice}) ÷ log10(${cost.indexCeilPrice} ÷ ${cost.indexFloorPrice}), 0, 100)`,
    effectivePrice:
      value.runCostWeight >= 1
        ? `effective_price = ${measured}`
        : value.runCostWeight <= 0
          ? 'effective_price = blended'
          : `effective_price = blended^${Number((1 - value.runCostWeight).toFixed(2))} × (${measured})^${value.runCostWeight}`,
    value: `value = intelligence^${value.intelligenceExponent} × max(100 − cost_index(effective_price), ${value.minAffordability})^${value.affordabilityExponent}`,
  };

  const costBody = fmt(m.costBody, {
    cache: cost.cacheReadWeight,
    input: cost.inputWeight,
    output: cost.outputWeight,
    total: cost.cacheReadWeight + cost.inputWeight + cost.outputWeight,
    hit: cacheHitPercent(cost),
  });
  const costIndexBody = fmt(m.costIndexBody, {
    floor: cost.indexFloorPrice,
    ceil: cost.indexCeilPrice,
  });
  const valueRunCostBody =
    typicalTokenUse === null
      ? m.valueRunCostBody
      : `${m.valueRunCostBody} ${fmt(m.valueRunCostNow, { typical: formatCount(typicalTokenUse) })}`;
  const tiersCharts = fmt(m.tiersCharts, {
    score: intelligence.tiers.high,
    price: formatPrice(cost.tiers.mid),
  });
  const changesBody = fmt(m.changesBody, { delta: changelogConfig.scoreDelta });
  const alternativesBody = fmt(m.alternativesBody, {
    delta: alternativesConfig.intelligenceDelta,
    saving: formatPercent(alternativesConfig.minSaving),
  });
  const valueBody = fmt(m.valueBody, {
    a: value.intelligenceExponent,
    b: value.affordabilityExponent,
    min: value.minAffordability,
  });

  const sourceUse = {
    modelsdev: m.useModelsdev,
    aa: m.useAa,
    arena: m.useArena,
    livebench: m.useLivebench,
    openrouter: m.useOpenrouter,
  };
  const unlicensed = {
    modelsdev: m.licenseNone,
    aa: m.licenseAa,
    arena: m.licenseNone,
    livebench: m.licenseNone,
    openrouter: m.licenseNone,
  };
  const sources = SOURCE_IDS.map((id) => ({
    ...dataset.sources[id],
    use: sourceUse[id],
    licenseText: dataset.sources[id].license ?? unlicensed[id],
  }));

  const period = usagePeriod(dataset);
  const usage = {
    body: m.usageBody,
    citation: period ? `${usageCitation(period, t)} ${t.usage.license}` : null,
  };

  return {
    intelligenceBody,
    metrics,
    livebenchNote,
    tierRows,
    formulas,
    costBody,
    costIndexBody,
    valueRunCostBody,
    valueBody,
    tiersCharts,
    changesBody,
    alternativesBody,
    usage,
    sources,
  };
}

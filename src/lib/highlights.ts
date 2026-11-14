import { fmt, type Dictionary } from '../i18n';
import type { Dataset, ModelRecord } from './dataset';
import { formatBill, formatMultiple, formatPrice, formatScore } from './format';
import {
  highlightConfig,
  scoringConfig,
  type HighlightConfig,
  type ScoringConfig,
} from './scoring.config';
import { usagePeriod } from './usage';

export type HighlightKind = 'frontier' | 'value' | 'burner' | 'sleeper' | 'frugal';

export interface HighlightCard {
  kind: HighlightKind;
  kicker: string;
  model: {
    id: string;
    name: string;
    vendor: string;
  };
  stat: {
    value: string;
    label: string;
  };
  contrast: string;
}

export interface HighlightOptions {
  config?: ScoringConfig;
  thresholds?: HighlightConfig;
}

function modelRef(model: ModelRecord) {
  return { id: model.id, name: model.name, vendor: model.vendor };
}

export function modelPrice(model: ModelRecord): number | null {
  return model.rating.value.effective_price ?? model.rating.cost.blended;
}

export function buildHighlights(
  dataset: Dataset,
  t: Dictionary,
  options: HighlightOptions = {},
): HighlightCard[] {
  const config = options.config ?? scoringConfig;
  const thresholds = options.thresholds ?? highlightConfig;
  const h = t.highlights;
  const active = dataset.models.filter((model) => model.status === 'active');
  const used = new Set<string>();
  const cards: HighlightCard[] = [];

  const rated = active
    .filter((model) => model.rating.intelligence.score !== null)
    .sort((a, b) => {
      const diff = (b.rating.intelligence.score ?? 0) - (a.rating.intelligence.score ?? 0);
      if (diff !== 0) return diff;
      const valDiff = (b.rating.value.score ?? -1) - (a.rating.value.score ?? -1);
      if (valDiff !== 0) return valDiff;
      return a.name.localeCompare(b.name, 'en');
    });

  const frontier = rated[0];
  if (!frontier || frontier.rating.intelligence.score === null) return cards;

  const frontierScore = frontier.rating.intelligence.score;
  const frontierPrice = modelPrice(frontier);
  used.add(frontier.id);

  let frontierContrast = t.empty.noPrice;
  if (
    frontier.facts.index_cost_usd !== null &&
    frontier.rating.value.cost_basis === 'run_cost' &&
    frontier.rating.value.effective_price !== null
  ) {
    frontierContrast = fmt(h.frontier.runCost, {
      runCost: formatBill(frontier.facts.index_cost_usd),
      price: formatPrice(frontier.rating.value.effective_price),
    });
  } else if (frontier.rating.cost.free) {
    frontierContrast = t.empty.free;
  } else if (frontier.rating.cost.blended !== null) {
    frontierContrast = fmt(h.frontier.blended, {
      price: formatPrice(frontier.rating.cost.blended),
    });
  }

  cards.push({
    kind: 'frontier',
    kicker: h.frontier.kicker,
    model: modelRef(frontier),
    stat: { value: formatScore(frontierScore), label: t.rating.intelligence },
    contrast: frontierContrast,
  });

  const valueCandidates = active.filter(
    (model) =>
      !used.has(model.id) &&
      model.rating.value.score !== null &&
      model.rating.intelligence.score !== null,
  );
  const capableValue = valueCandidates.filter(
    (model) => (model.rating.intelligence.score ?? 0) >= config.intelligence.tiers.mid,
  );
  const valuePool = capableValue.length > 0 ? capableValue : valueCandidates;
  const bestValue = [...valuePool].sort((a, b) => {
    const valDiff = (b.rating.value.score ?? 0) - (a.rating.value.score ?? 0);
    if (valDiff !== 0) return valDiff;
    const intDiff = (b.rating.intelligence.score ?? 0) - (a.rating.intelligence.score ?? 0);
    if (intDiff !== 0) return intDiff;
    return a.name.localeCompare(b.name, 'en');
  })[0];

  if (
    bestValue &&
    bestValue.rating.value.score !== null &&
    bestValue.rating.intelligence.score !== null
  ) {
    used.add(bestValue.id);
    const intelPct =
      frontierScore > 0
        ? Math.round((bestValue.rating.intelligence.score / frontierScore) * 100)
        : 0;
    const price = modelPrice(bestValue);
    let contrast: string | null = null;
    if (bestValue.rating.cost.free) {
      contrast = fmt(h.value.free, { intel: intelPct });
    } else if (
      price !== null &&
      price > 0 &&
      frontierPrice !== null &&
      frontierPrice / price >= 1.2
    ) {
      contrast = fmt(h.value.cheaper, {
        intel: intelPct,
        multiple: formatMultiple(frontierPrice / price),
      });
    } else if (price !== null) {
      contrast = fmt(h.value.fallback, {
        intel: formatScore(bestValue.rating.intelligence.score),
        price: formatPrice(price),
      });
    }
    if (contrast !== null) {
      cards.push({
        kind: 'value',
        kicker: h.value.kicker,
        model: modelRef(bestValue),
        stat: { value: formatScore(bestValue.rating.value.score), label: t.rating.value },
        contrast,
      });
    }
  }

  const burners = active
    .flatMap((model) => {
      const blended = model.rating.cost.blended;
      const measured = model.rating.value.effective_price;
      if (
        used.has(model.id) ||
        model.rating.value.cost_basis !== 'run_cost' ||
        blended === null ||
        blended <= 0 ||
        measured === null
      ) {
        return [];
      }
      const ratio = measured / blended;
      return ratio >= thresholds.burnerRatio ? [{ model, blended, measured, ratio }] : [];
    })
    .sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.measured !== a.measured) return b.measured - a.measured;
      return a.model.name.localeCompare(b.model.name, 'en');
    });

  const burner = burners[0];
  if (burner) {
    used.add(burner.model.id);
    cards.push({
      kind: 'burner',
      kicker: h.burner.kicker,
      model: modelRef(burner.model),
      stat: { value: `${formatMultiple(burner.ratio)}×`, label: h.burner.unit },
      contrast: fmt(h.burner.contrast, {
        list: formatPrice(burner.blended),
        measured: formatPrice(burner.measured),
      }),
    });
  }

  const openrouterReady =
    usagePeriod(dataset) !== null && dataset.models.some((model) => model.openrouter?.rank != null);

  if (openrouterReady) {
    const sleepers = active
      .filter(
        (model) =>
          !used.has(model.id) &&
          (model.rating.value.tier === 'top' || model.rating.value.tier === 'high') &&
          model.rating.value.score !== null &&
          (model.openrouter?.rank == null || model.openrouter.rank > thresholds.sleeperRank),
      )
      .sort((a, b) => {
        const aRanked = a.openrouter?.rank != null ? 1 : 0;
        const bRanked = b.openrouter?.rank != null ? 1 : 0;
        if (bRanked !== aRanked) return bRanked - aRanked;
        const valDiff = (b.rating.value.score ?? 0) - (a.rating.value.score ?? 0);
        if (valDiff !== 0) return valDiff;
        return a.name.localeCompare(b.name, 'en');
      });

    const sleeper = sleepers[0];
    if (sleeper && sleeper.rating.value.score !== null && sleeper.rating.value.tier !== null) {
      used.add(sleeper.id);
      const price = modelPrice(sleeper);
      const priceText = sleeper.rating.cost.free
        ? t.empty.free
        : price !== null
          ? formatPrice(price)
          : t.empty.noPrice;
      const rank = sleeper.openrouter?.rank;
      cards.push({
        kind: 'sleeper',
        kicker: h.sleeper.kicker,
        model: modelRef(sleeper),
        stat: { value: formatScore(sleeper.rating.value.score), label: t.rating.value },
        contrast:
          rank != null
            ? fmt(h.sleeper.ranked, { rank, price: priceText })
            : fmt(h.sleeper.unranked, { price: priceText }),
      });
      return cards;
    }
  }

  const frugals = active
    .flatMap((model) => {
      const blended = model.rating.cost.blended;
      const measured = model.rating.value.effective_price;
      if (
        used.has(model.id) ||
        model.rating.value.cost_basis !== 'run_cost' ||
        blended === null ||
        blended <= 0 ||
        measured === null
      ) {
        return [];
      }
      const ratio = measured / blended;
      return ratio <= thresholds.frugalRatio ? [{ model, blended, measured, ratio }] : [];
    })
    .sort((a, b) => {
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      const valDiff = (b.model.rating.value.score ?? -1) - (a.model.rating.value.score ?? -1);
      if (valDiff !== 0) return valDiff;
      return a.model.name.localeCompare(b.model.name, 'en');
    });

  const frugal = frugals[0];
  if (frugal) {
    const savedPct = Math.round((1 - frugal.ratio) * 100);
    cards.push({
      kind: 'frugal',
      kicker: h.frugal.kicker,
      model: modelRef(frugal.model),
      stat: { value: `−${savedPct}%`, label: h.frugal.unit },
      contrast: fmt(h.frugal.contrast, {
        list: formatPrice(frugal.blended),
        measured: formatPrice(frugal.measured),
      }),
    });
  }

  return cards;
}

import type { Dictionary } from '../i18n';
import type { ModelRecord } from './dataset';
import { formatPrice, formatScore } from './format';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function modelImagePath(id: string): string {
  return `/og/${id}.png`;
}

export const SITE_IMAGE_PATH = '/og.png';

export const COMPARE_MAX = 4;

export function modelShareText(
  model: Pick<ModelRecord, 'name' | 'vendor' | 'rating'>,
  t: Pick<Dictionary, 'meta' | 'rating' | 'tier' | 'empty'>,
): { description: string; imageAlt: string } {
  const { intelligence, cost, value } = model.rating;
  const parts = [
    `${t.rating.intelligence} ${
      intelligence.tier
        ? `${t.tier.intelligence[intelligence.tier]} ${formatScore(intelligence.score ?? 0)}`
        : t.empty.unrated
    }`,
    `${t.rating.cost} ${
      cost.tier
        ? `${t.tier.cost[cost.tier]} ${cost.free ? t.empty.free : formatPrice(cost.blended ?? 0)}`
        : t.empty.noPrice
    }`,
    `${t.rating.value} ${
      value.tier ? `${t.tier.value[value.tier]} ${formatScore(value.score ?? 0)}` : t.empty.unrated
    }`,
  ];
  return {
    description: `${model.name} (${model.vendor}): ${t.meta.tagline}`,
    imageAlt: `${model.name} · ${parts.join(' · ')}`,
  };
}

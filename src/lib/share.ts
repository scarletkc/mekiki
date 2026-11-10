/** Paths and sizes shared by the share images and the pages that point to them. */
import type { Dictionary } from '../i18n';
import type { ModelRecord } from './dataset';
import { formatPrice, formatScore } from './format';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Site-relative path of a model's share image. */
export function modelImagePath(id: string): string {
  return `/og/${id}.png`;
}

/** Site-relative path of the share image used by every other page. */
export const SITE_IMAGE_PATH = '/og.png';

/** Most models the compare page shows side by side. */
export const COMPARE_MAX = 4;

/** Description of a model page and the text alternative of its share image, in one locale. */
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
    // Middle dots rather than sentence punctuation, which differs by language.
    imageAlt: `${model.name} · ${parts.join(' · ')}`,
  };
}

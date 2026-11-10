import { en, type Dictionary } from './en';
import { LOCALES, LOCALE_INFO, type Locale } from './locales';
import { zhCN } from './zh-cn';
import { zhTW } from './zh-tw';

export * from './locales';
export { fmt } from './fmt';
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = {
  'zh-cn': zhCN,
  'zh-tw': zhTW,
  en,
};

/** The UI strings of a locale. */
export function useTranslations(locale: Locale): Dictionary {
  return dictionaries[locale];
}

type TierGroup = keyof Dictionary['tier'];

/** Label of one tier in every locale, keyed by BCP 47 tag (used by the JSON API). */
export function tierLabels<G extends TierGroup>(
  group: G,
  tier: keyof Dictionary['tier'][G],
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const locale of LOCALES) {
    labels[LOCALE_INFO[locale].tag] = dictionaries[locale].tier[group][tier] as string;
  }
  return labels;
}

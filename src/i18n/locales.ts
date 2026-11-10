/**
 * Supported UI locales. Keep in sync with `i18n` in astro.config.mjs.
 *
 * The default locale is served without a URL prefix (`/`, `/m/...`); the
 * others live under `/<locale>/`. To add a language: add it here and in
 * astro.config.mjs, then add a dictionary in this folder.
 */
export const LOCALES = ['zh-cn', 'zh-tw', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-cn';

export const LOCALE_INFO: Record<
  Locale,
  {
    /** BCP 47 tag for `<html lang>`, `hreflang` and the API's `labels` keys. */
    tag: string;
    /** Name of the language, in that language. */
    name: string;
    /** Short label for the language switcher. */
    short: string;
  }
> = {
  'zh-cn': { tag: 'zh-CN', name: '简体中文', short: '简' },
  'zh-tw': { tag: 'zh-TW', name: '繁體中文', short: '繁' },
  en: { tag: 'en', name: 'English', short: 'EN' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Locales that need a URL prefix, i.e. everything but the default. */
export const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/**
 * Site-relative URL of a page in the given locale.
 * `localePath('en', '/method')` → `/en/method/`; default locale → `/method/`.
 * Pass paths without a locale prefix. File-like paths (`/api.json`) are
 * never localised.
 */
export function localePath(locale: Locale, path: string = '/'): string {
  const clean = `/${path.replace(/^\/+|\/+$/g, '')}`;
  if (/\.[a-z0-9]+$/i.test(clean) && !clean.startsWith('/m/')) return clean;
  const prefixed = locale === DEFAULT_LOCALE ? clean : `/${locale}${clean === '/' ? '' : clean}`;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
}

/** Strip the locale prefix from a pathname: `/en/method/` → `/method/`. */
export function stripLocale(pathname: string): string {
  for (const locale of PREFIXED_LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1) || '/';
    }
  }
  return pathname || '/';
}

/**
 * Supported UI locales.
 *
 * Every locale lives under its own URL prefix: `/en/`, `/zh-cn/`,
 * `/zh-tw/`. Unprefixed page URLs (`/`, `/method`, `/m/...`) only redirect
 * to the default locale; see src/layouts/Redirect.astro.
 *
 * To add a language: add it here, then add a dictionary in this folder and
 * register it in ./index.ts.
 */
export const LOCALES = ['en', 'zh-cn', 'zh-tw'] as const;
export type Locale = (typeof LOCALES)[number];

/** Where unprefixed URLs redirect to. */
export const DEFAULT_LOCALE: Locale = 'en';

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
  en: { tag: 'en', name: 'English', short: 'EN' },
  'zh-cn': { tag: 'zh-CN', name: '简体中文', short: '简' },
  'zh-tw': { tag: 'zh-TW', name: '繁體中文', short: '繁' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** True for paths that name a file (`/api.json`) rather than a page. */
function isFilePath(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path) && !path.startsWith('/m/');
}

/** Normalise a page path: leading slash, trailing slash, no duplicates. */
export function pagePath(path: string = '/'): string {
  const clean = `/${path.replace(/^\/+|\/+$/g, '')}`;
  if (isFilePath(clean)) return clean;
  return clean.endsWith('/') ? clean : `${clean}/`;
}

/**
 * Site-relative URL of a page in the given locale:
 * `localePath('en', '/method')` → `/en/method/`.
 * Pass paths without a locale prefix. File-like paths (`/api.json`) are
 * never localised.
 */
export function localePath(locale: Locale, path: string = '/'): string {
  const clean = pagePath(path);
  if (isFilePath(clean)) return clean;
  return `/${locale}${clean}`;
}

/** Strip the locale prefix from a pathname: `/en/method/` → `/method/`. */
export function stripLocale(pathname: string): string {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1) || '/';
    }
  }
  return pathname || '/';
}

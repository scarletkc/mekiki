export const LOCALES = ['en', 'zh-cn', 'zh-tw'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_INFO: Record<
  Locale,
  {
    tag: string;
    name: string;
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

function isFilePath(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path) && !path.startsWith('/m/');
}

export function pagePath(path: string = '/'): string {
  const clean = `/${path.replace(/^\/+|\/+$/g, '')}`;
  if (isFilePath(clean)) return clean;
  return clean.endsWith('/') ? clean : `${clean}/`;
}

export function localePath(locale: Locale, path: string = '/'): string {
  const clean = pagePath(path);
  if (isFilePath(clean)) return clean;
  return `/${locale}${clean}`;
}

export function stripLocale(pathname: string): string {
  for (const locale of LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1) || '/';
    }
  }
  return pathname || '/';
}

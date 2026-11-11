import { type Dictionary, LOCALE_INFO, type Locale, localePath } from '../i18n';
import { SITE_URL } from './dataset';
import { OG_HEIGHT, OG_WIDTH } from './share';

type Node = Record<string, unknown>;

export interface JsonLdPage {
  locale: Locale;
  path: string;
  name: string;
  title?: string;
  description: string;
  image: string;
  modified: string | null;
}

export interface JsonLd {
  '@context': 'https://schema.org';
  '@graph': Node[];
}

const DATA_FILES = ['/api.json', '/api/models.json', '/api/history.json'];

export function pageJsonLd(page: JsonLdPage, t: Pick<Dictionary, 'meta' | 'nav' | 'api'>): JsonLd {
  const { locale, path, modified } = page;
  const language = LOCALE_INFO[locale].tag;
  const home = new URL(localePath(locale, '/'), SITE_URL).href;
  const url = new URL(localePath(locale, path), SITE_URL).href;
  const siteId = `${home}#website`;
  const breadcrumbId = `${url}#breadcrumb`;
  const isModel = path.startsWith('/m/') && page.title !== undefined;

  const graph: Node[] = [
    {
      '@type': 'WebSite',
      '@id': siteId,
      url: home,
      name: 'mekiki',
      description: t.meta.description,
      inLanguage: language,
    },
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: page.name,
      description: page.description,
      inLanguage: language,
      isPartOf: { '@id': siteId },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: new URL(page.image, SITE_URL).href,
        width: OG_WIDTH,
        height: OG_HEIGHT,
      },
      ...(modified ? { dateModified: modified } : {}),
      ...(isModel ? { breadcrumb: { '@id': breadcrumbId } } : {}),
    },
  ];

  if (isModel) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t.nav.models, item: home },
        { '@type': 'ListItem', position: 2, name: page.title, item: url },
      ],
    });
  }

  if (path === '/api') {
    graph.push({
      '@type': 'Dataset',
      '@id': `${url}#dataset`,
      url,
      name: `mekiki: ${t.meta.tagline}`,
      description: `${t.meta.description} ${t.api.intro}`,
      isAccessibleForFree: true,
      creator: { '@type': 'Organization', name: 'mekiki', url: SITE_URL },
      ...(modified ? { dateModified: modified } : {}),
      distribution: DATA_FILES.map((file) => ({
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: new URL(file, SITE_URL).href,
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

import { describe, expect, it } from 'vitest';
import { useTranslations } from '@/i18n';
import { SITE_URL } from '@/lib/dataset';
import { type JsonLdPage, pageJsonLd, serializeJsonLd } from '@/lib/jsonld';

const t = useTranslations('zh-cn');
const base: JsonLdPage = {
  locale: 'zh-cn',
  path: '/',
  name: 'mekiki',
  description: 'About the page',
  image: '/og.png',
  modified: '2026-11-12T00:00:00.000Z',
};
const types = (page: JsonLdPage) => pageJsonLd(page, t)['@graph'].map((node) => node['@type']);
const node = (page: JsonLdPage, type: string) =>
  pageJsonLd(page, t)['@graph'].find((item) => item['@type'] === type)!;

describe('structured data', () => {
  it('describes the site and the page under the page language', () => {
    expect(types(base)).toEqual(['WebSite', 'WebPage']);
    const home = new URL('/zh-cn/', SITE_URL).href;
    expect(node(base, 'WebSite')).toMatchObject({ url: home, name: 'mekiki', inLanguage: 'zh-CN' });
    expect(node(base, 'WebPage')).toMatchObject({
      url: home,
      inLanguage: 'zh-CN',
      isPartOf: { '@id': `${home}#website` },
      dateModified: base.modified,
      primaryImageOfPage: { url: new URL('/og.png', SITE_URL).href },
    });
  });

  it('leaves the date out when nothing has synced', () => {
    expect(node({ ...base, modified: null }, 'WebPage')).not.toHaveProperty('dateModified');
  });

  it('gives a model page a trail back to the list', () => {
    const page = { ...base, path: '/m/openai/gpt-6.1-sol', title: 'GPT-6.1 Sol' };
    expect(types(page)).toEqual(['WebSite', 'WebPage', 'BreadcrumbList']);
    const url = new URL('/zh-cn/m/openai/gpt-6.1-sol/', SITE_URL).href;
    expect(node(page, 'BreadcrumbList').itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: t.nav.models,
        item: new URL('/zh-cn/', SITE_URL).href,
      },
      { '@type': 'ListItem', position: 2, name: 'GPT-6.1 Sol', item: url },
    ]);
  });

  it('describes the API as a dataset with its JSON files', () => {
    const page = { ...base, path: '/api', title: 'API' };
    expect(types(page)).toEqual(['WebSite', 'WebPage', 'Dataset']);
    const files = (node(page, 'Dataset').distribution as { contentUrl: string }[]).map(
      (file) => file.contentUrl,
    );
    expect(files).toEqual(
      ['/api.json', '/api/models.json', '/api/history.json'].map(
        (file) => new URL(file, SITE_URL).href,
      ),
    );
  });

  it('cannot close the script element it is written into', () => {
    const data = pageJsonLd({ ...base, name: '</script><b>' }, t);
    const text = serializeJsonLd(data);
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(data);
  });
});

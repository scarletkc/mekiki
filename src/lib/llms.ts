import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, useTranslations } from '../i18n';
import { apiDoc } from './api';
import { latestSync, REPO_URL, type Dataset } from './dataset';
import { feedPath } from './feed';
import { formatDateTime } from './format';
import { absoluteUrl, link, markdownUrl } from './markdown';
import { modelShareText } from './share';

const item = (text: string, href: string, note: string) => `- ${link(text, href)}: ${note}`;

const tick = (text: string) => `\`${text}\``;

export function buildLlmsTxt(dataset: Dataset): string {
  const locale = DEFAULT_LOCALE;
  const t = useTranslations(locale);
  const synced = latestSync(dataset);
  const languages = LOCALES.map((each) => `${LOCALE_INFO[each].name} (/${each}/)`).join(', ');

  const notes = [
    'Every page has a Markdown version: the address of the page with `.md` in place of the trailing slash, or `index.md` for a home page. The links below go to those versions, and each HTML page names its own in `<link rel="alternate" type="text/markdown">`.',
    `Pages exist in ${languages}. An address without a language prefix redirects with JavaScript, so fetch the prefixed one.`,
    `A missing value is written as "${t.empty.unrated}", "${t.empty.noData}" or "${t.empty.noPrice}" on pages and as null in the JSON API. It is never 0.`,
    `The data is refreshed every day. ${t.footer.synced}${synced ? formatDateTime(synced) : t.footer.never}.`,
  ];

  const pages = [
    item(
      t.nav.models,
      markdownUrl(locale, '/'),
      'every model with its three ratings and prices, in one table',
    ),
    item(
      t.nav.method,
      markdownUrl(locale, '/method'),
      'the formulas, weights, thresholds and data sources behind the ratings',
    ),
    item(
      t.nav.changes,
      markdownUrl(locale, '/changelog'),
      'what changed in the ratings, day by day',
    ),
    item(t.nav.api, markdownUrl(locale, '/api'), 'how to read the JSON API, with a live example'),
  ];

  const api = apiDoc(dataset, t).endpoints.map((endpoint) =>
    endpoint.href
      ? item(tick(endpoint.path), absoluteUrl(endpoint.href), endpoint.content)
      : `- ${tick(endpoint.path)}: ${endpoint.content}`,
  );

  const models = dataset.models.map((model) => {
    const tags = [
      model.status === 'legacy' ? t.badge.legacy : null,
      model.facts.open_weights === true ? t.badge.openWeights : null,
    ].filter((tag) => tag !== null);
    const note = [model.vendor, modelShareText(model, t).summary, ...tags].join(' · ');
    return item(model.name, markdownUrl(locale, `/m/${model.id}`), note);
  });

  const optional = [
    item(t.changelog.feed, absoluteUrl(feedPath(locale)), t.changelog.feedDescription),
    ...LOCALES.filter((other) => other !== locale).map((other) =>
      item(
        LOCALE_INFO[other].name,
        markdownUrl(other, '/'),
        `the same pages in ${LOCALE_INFO[other].tag}`,
      ),
    ),
    item(t.footer.repo, REPO_URL, 'the code, the scoring config and the data snapshots'),
  ];

  return `${[
    '# mekiki',
    `> ${t.meta.description}`,
    t.home.intro,
    notes.map((note) => `- ${note}`).join('\n'),
    '## Pages',
    pages.join('\n'),
    '## API',
    api.join('\n'),
    `## ${t.home.title}`,
    models.join('\n'),
    '## Optional',
    optional.join('\n'),
  ].join('\n\n')}\n`;
}

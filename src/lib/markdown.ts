import { fmt, useTranslations, type Dictionary, type Locale } from '../i18n';
import { API_VERSION, apiDoc, toApiModel } from './api';
import { changeCount, describeChange } from './change-text';
import { changesFor, modelSeries, type Change, type Changelog } from './changelog';
import { latestSync, SITE_URL, type Dataset, type ModelRecord } from './dataset';
import { feedPath } from './feed';
import { formatDateTime, formatPercent, formatPrice, formatScore } from './format';
import { utcDate, type HistoryEntry } from './history';
import { methodContent } from './method';
import { modelDetail } from './model-detail';
import { changelogConfig } from './scoring.config';
import { usageBadge, usageCitation, usageDetail, usagePeriod, type UsagePeriod } from './usage';

export const LLMS_PATH = '/llms.txt';

const MARKDOWN_PAGES = ['/changelog', '/method', '/api'];

export function markdownPath(locale: Locale, path: string): string | null {
  const clean = `/${path.replace(/^\/+|\/+$/g, '')}`;
  if (clean === '/') return `/${locale}/index.md`;
  if (MARKDOWN_PAGES.includes(clean) || clean.startsWith('/m/')) return `/${locale}${clean}.md`;
  return null;
}

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href;

export function markdownUrl(locale: Locale, path: string): string {
  const twin = markdownPath(locale, path);
  if (twin === null) throw new Error(`No Markdown version of ${path}`);
  return absoluteUrl(twin);
}

export const link = (text: string, href: string) => `[${text.replace(/[[\]]/g, '\\$&')}](${href})`;

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function table(head: string[], rows: string[][], numeric: number[] = []): string {
  const line = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
  const rule = head.map((_, index) => (numeric.includes(index) ? '---:' : '---'));
  return [line(head), line(rule), ...rows.map(line)].join('\n');
}

const code = (text: string, language = '') => `\`\`\`${language}\n${text}\n\`\`\``;

const compose = (blocks: (string | null | false)[]) =>
  `${blocks.filter((block) => block).join('\n\n')}\n`;

function siteLinks(locale: Locale, t: Dictionary): string {
  return [
    link(t.nav.models, markdownUrl(locale, '/')),
    link(t.nav.changes, markdownUrl(locale, '/changelog')),
    link(t.nav.method, markdownUrl(locale, '/method')),
    link(t.nav.api, markdownUrl(locale, '/api')),
    link('llms.txt', absoluteUrl(LLMS_PATH)),
  ].join(' · ');
}

function ratingText(model: ModelRecord, t: Dictionary) {
  const { intelligence, cost, value } = model.rating;
  return {
    intelligence: intelligence.tier
      ? `${t.tier.intelligence[intelligence.tier]} ${formatScore(intelligence.score ?? 0)}`
      : t.empty.unrated,
    cost: cost.tier
      ? `${t.tier.cost[cost.tier]} ${cost.free ? t.empty.free : formatPrice(cost.blended ?? 0)}`
      : t.empty.noPrice,
    value: value.tier
      ? `${t.tier.value[value.tier]} ${formatScore(value.score ?? 0)}`
      : t.empty.unrated,
  };
}

function badges(model: ModelRecord, t: Dictionary, period: UsagePeriod | null): string[] {
  return [
    model.status === 'legacy' ? t.badge.legacy : null,
    model.facts.open_weights === true ? t.badge.openWeights : null,
    usageBadge(model, period, t)?.label ?? null,
  ].filter((badge) => badge !== null);
}

function syncedLine(dataset: Dataset, t: Dictionary): string {
  const synced = latestSync(dataset);
  return `${t.footer.synced}${synced ? formatDateTime(synced) : t.footer.never}`;
}

function changeMarkdown(
  change: Change,
  locale: Locale,
  t: Dictionary,
  linkable: Set<string>,
): string {
  return describeChange(change, t)
    .map((segment) =>
      typeof segment === 'string'
        ? segment
        : linkable.has(segment.id)
          ? link(segment.name, markdownUrl(locale, `/m/${segment.id}`))
          : segment.name,
    )
    .join('');
}

export function homeMarkdown(dataset: Dataset, locale: Locale): string {
  const t = useTranslations(locale);
  const columns = t.table.columns;
  const period = usagePeriod(dataset);
  const ranked = period !== null && dataset.models.some((model) => model.openrouter?.rank != null);
  const rows = dataset.models.map((model) => {
    const { cost, value } = model.rating;
    const rating = ratingText(model, t);
    const name = link(model.name, markdownUrl(locale, `/m/${model.id}`));
    return [
      [name, ...badges(model, t, null).map((badge) => `(${badge})`)].join(' '),
      model.vendor,
      rating.intelligence,
      rating.cost,
      value.cost_basis === 'run_cost' && value.effective_price !== null
        ? formatPrice(value.effective_price)
        : t.table.notMeasured,
      rating.value,
      cost.input === null || cost.output === null
        ? t.empty.noPrice
        : cost.free
          ? t.empty.free
          : `${formatPrice(cost.input)} / ${formatPrice(cost.output)}`,
      ...(ranked
        ? [model.openrouter?.rank == null ? t.usage.notRanked : `#${model.openrouter.rank}`]
        : []),
    ];
  });
  return compose([
    '# mekiki',
    `> ${t.meta.description}`,
    `## ${t.home.title}`,
    t.home.intro,
    table(
      [
        columns.model,
        columns.vendor,
        columns.intelligence,
        columns.cost,
        columns.measured,
        columns.value,
        columns.price,
        ...(ranked ? [t.usage.column] : []),
      ],
      rows,
    ),
    `${t.table.priceNote}${t.footer.fullStop}${syncedLine(dataset, t)}${t.footer.fullStop.trimEnd()}`,
    ranked && `${usageCitation(period, t)} ${link(t.usage.about, markdownUrl(locale, '/method'))}`,
    siteLinks(locale, t),
  ]);
}

export function modelMarkdown(
  model: ModelRecord,
  dataset: Dataset,
  history: { entries: HistoryEntry[]; changelog: Changelog },
  locale: Locale,
): string {
  const t = useTranslations(locale);
  const d = t.detail;
  const { intelligence, value } = model.rating;
  const detail = modelDetail(model, dataset, t);
  const rating = ratingText(model, t);
  const none = t.empty.noData;
  const period = usagePeriod(dataset);
  const usage = period ? usageDetail(model, period, t) : null;

  const today = utcDate(new Date(dataset.generated_at));
  const series = modelSeries(history.entries, model.id, {
    date: today,
    intelligence: intelligence.score,
    value: value.score,
  });
  const historyStart = series[0]?.date ?? today;
  const changes = changesFor(history.changelog, model.id).slice(0, 12);
  const linkable = new Set(dataset.models.map((item) => item.id));
  const score = (figure: number | null) =>
    figure === null ? t.empty.unrated : formatScore(figure);

  return compose([
    `# ${model.name}`,
    [model.vendor, `\`${model.id}\``, ...badges(model, t, period)].join(' · '),
    [
      `- ${t.rating.intelligence}: ${rating.intelligence}`,
      `- ${t.rating.cost}: ${rating.cost} (${detail.costNote})`,
      `- ${t.rating.value}: ${rating.value} (${detail.valueNote})`,
    ].join('\n'),
    `## ${d.breakdown}`,
    table(
      [d.metricCol, d.raw, d.frontier, d.normalized, d.weight],
      detail.metrics.map((metric) => [
        metric.mapped ? `${metric.label} (\`${metric.mapped}\`)` : metric.label,
        metric.raw === null ? metric.missing : String(metric.raw),
        metric.frontier === null ? none : String(metric.frontier),
        metric.normalized === null ? none : formatScore(metric.normalized),
        formatPercent(metric.weight),
      ]),
      [1, 2, 3, 4],
    ),
    detail.scoreNote,
    `## ${d.facts}`,
    detail.facts.map((fact) => `- ${fact.label}: ${fact.value ?? fact.empty}`).join('\n'),
    detail.priceNotes.join('\n\n'),
    usage && `## ${t.usage.title}`,
    usage &&
      (usage.notFound ??
        usage.rows.map((row) => `- ${row.label}: ${row.value ?? none}`).join('\n')),
    usage && `${usage.citation} ${link(t.usage.about, markdownUrl(locale, '/method'))}`,
    `## ${d.history}`,
    series.length < 2
      ? fmt(d.historyStart, { date: historyStart })
      : table(
          [d.date, t.rating.intelligence, t.rating.value],
          [...series]
            .reverse()
            .map((point) => [point.date, score(point.intelligence), score(point.value)]),
          [1, 2],
        ),
    series.length >= 2 && d.historyNote,
    `### ${d.changes}`,
    changes.length === 0
      ? fmt(d.noChanges, { date: history.changelog.start ?? historyStart })
      : changes
          .map(({ date, change }) => `- ${date}: ${changeMarkdown(change, locale, t, linkable)}`)
          .join('\n'),
    `## ${d.links}`,
    detail.links.map((item) => `- ${link(item.label, absoluteUrl(item.href))}`).join('\n'),
    siteLinks(locale, t),
  ]);
}

export function methodMarkdown(dataset: Dataset, locale: Locale): string {
  const t = useTranslations(locale);
  const m = t.method;
  const content = methodContent(dataset, locale);
  return compose([
    `# ${m.title}`,
    m.intro,
    `## ${m.modelsTitle}`,
    m.modelsBody,
    m.legacyBody,
    `## ${m.intelligenceTitle}`,
    m.intelligenceBody,
    code(content.formulas.normalize),
    m.benchmarkBody,
    table(
      [t.detail.metricCol, m.source, m.floor, t.detail.weight],
      content.metrics.map((metric) => [metric.label, metric.source, metric.floor, metric.weight]),
      [3],
    ),
    content.livebenchNote,
    `## ${m.costTitle}`,
    content.costBody,
    content.costIndexBody,
    code(content.formulas.costIndex),
    `## ${m.valueTitle}`,
    content.valueRunCostBody,
    code(content.formulas.effectivePrice),
    content.valueBody,
    code(content.formulas.value),
    `## ${m.tiersTitle}`,
    content.tierRows
      .map(
        (row) =>
          `- ${row.rating}: ${row.tiers.map((tier) => `\`${tier.key}\` ${tier.label} ${tier.rule}`).join('; ')}`,
      )
      .join('\n'),
    `## ${m.usageTitle}`,
    content.usage.body,
    content.usage.citation,
    `## ${m.sourcesTitle}`,
    m.sourcesBody,
    table(
      [m.sourceName, m.sourceUse, m.sourceLicense, m.sourceUpdated],
      content.sources.map((source) => [
        source.edition
          ? `${link(source.name, source.url)} (${source.edition})`
          : link(source.name, source.url),
        source.use,
        source.licenseText,
        source.fetched_at ? formatDateTime(source.fetched_at) : t.empty.noData,
      ]),
    ),
    `## ${m.caveatsTitle}`,
    [m.caveatAaCoding, m.caveatVariants, m.caveatRunCost].map((item) => `- ${item}`).join('\n'),
    siteLinks(locale, t),
  ]);
}

export function apiMarkdown(dataset: Dataset, locale: Locale): string {
  const t = useTranslations(locale);
  const a = t.api;
  const { sample, samplePath, endpoints, fields } = apiDoc(dataset, t);
  return compose([
    `# ${a.title}`,
    a.intro,
    `## ${a.endpointsTitle}`,
    table(
      [a.path, a.content],
      endpoints.map((endpoint) => [
        endpoint.href
          ? link(`\`${endpoint.path}\``, absoluteUrl(endpoint.href))
          : `\`${endpoint.path}\``,
        endpoint.content,
      ]),
    ),
    `## ${a.exampleTitle}`,
    code(`curl ${SITE_URL}${samplePath}`, 'bash'),
    sample && fmt(a.exampleBody, { id: sample.id }),
    sample && code(JSON.stringify(toApiModel(sample), null, 2), 'json'),
    `## ${a.fieldsTitle}`,
    fields.map((field) => `- ${field}`).join('\n'),
    `## ${a.versionTitle}`,
    fmt(a.versionBody, { version: API_VERSION }),
    `## ${a.attributionTitle}`,
    a.attributionBody,
    siteLinks(locale, t),
  ]);
}

export function changelogMarkdown(changelog: Changelog, dataset: Dataset, locale: Locale): string {
  const t = useTranslations(locale);
  const c = t.changelog;
  const linkable = new Set(dataset.models.map((model) => model.id));
  return compose([
    `# ${c.title}`,
    fmt(c.intro, { delta: changelogConfig.scoreDelta }),
    link(c.feed, absoluteUrl(feedPath(locale))),
    changelog.start === null && c.empty,
    changelog.start !== null && changelog.days.length === 0 && c.none,
    ...changelog.days.flatMap((day) => [
      `## ${day.date} (${changeCount(day.changes.length, t)})`,
      day.changes.map((change) => `- ${changeMarkdown(change, locale, t, linkable)}`).join('\n'),
    ]),
    changelog.start !== null && fmt(c.start, { date: changelog.start }),
    siteLinks(locale, t),
  ]);
}

export function markdownResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}

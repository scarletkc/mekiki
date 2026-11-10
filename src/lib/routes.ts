/** Static-path helpers shared by the page files in src/pages. */
import { PREFIXED_LOCALES, type Locale } from '../i18n';
import { getModelPages } from './site-data';

/** One path per non-default locale, for pages under src/pages/[locale]/. */
export function localeStaticPaths() {
  return PREFIXED_LOCALES.map((locale) => ({ params: { locale }, props: { locale } }));
}

/** One detail page per model: `/m/<provider>/<model>`. */
export async function modelStaticPaths() {
  const pages = await getModelPages();
  return pages.map(({ model, entry }) => ({ params: { id: model.id }, props: { model, entry } }));
}

/** Detail pages for every non-default locale: `/<locale>/m/<provider>/<model>`. */
export async function localizedModelStaticPaths() {
  const pages = await getModelPages();
  return PREFIXED_LOCALES.flatMap((locale: Locale) =>
    pages.map(({ model, entry }) => ({
      params: { locale, id: model.id },
      props: { locale, model, entry },
    })),
  );
}

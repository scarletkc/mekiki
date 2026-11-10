/** Static-path helpers shared by the page files in src/pages/[locale]/. */
import { LOCALES } from '../i18n';
import { getModelPages } from './site-data';

/** One path per locale. */
export function localeStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale }, props: { locale } }));
}

/** One detail page per locale and model: `/<locale>/m/<provider>/<model>`. */
export async function localizedModelStaticPaths() {
  const pages = await getModelPages();
  return LOCALES.flatMap((locale) =>
    pages.map(({ model, entry }) => ({
      params: { locale, id: model.id },
      props: { locale, model, entry },
    })),
  );
}

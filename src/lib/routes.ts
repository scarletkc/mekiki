/** Static-path helpers shared by the page files in src/pages/[locale]/. */
import { LOCALES } from '../i18n';
import { getDataset } from './site-data';

/** One path per locale. */
export function localeStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale }, props: { locale } }));
}

/** One detail page per locale and model: `/<locale>/m/<provider>/<model>`. */
export async function localizedModelStaticPaths() {
  const { models } = await getDataset();
  return LOCALES.flatMap((locale) =>
    models.map((model) => ({ params: { locale, id: model.id }, props: { locale, model } })),
  );
}

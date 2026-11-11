import { LOCALES } from '../i18n';
import { getDataset } from './site-data';

export function localeStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale }, props: { locale } }));
}

export async function localizedModelStaticPaths() {
  const { models } = await getDataset();
  return LOCALES.flatMap((locale) =>
    models.map((model) => ({ params: { locale, id: model.id }, props: { locale, model } })),
  );
}

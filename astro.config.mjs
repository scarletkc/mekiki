// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mekiki.fog.moe',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Keep in sync with src/i18n/locales.ts. The default locale (zh-cn) is
  // served without a prefix so the routes and API URLs in docs/SPEC.md hold.
  i18n: {
    locales: ['zh-cn', 'zh-tw', 'en'],
    defaultLocale: 'zh-cn',
    routing: {
      prefixDefaultLocale: false,
    },
  },
});

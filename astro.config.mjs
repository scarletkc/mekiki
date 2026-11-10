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
  // Locales are routed by the page files themselves (src/pages/[locale]/ and
  // the redirect pages next to it), driven by src/i18n/locales.ts. Astro's
  // built-in i18n routing is deliberately not enabled.
});

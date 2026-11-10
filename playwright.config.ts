import { defineConfig, devices } from '@playwright/test';

// Browser smoke test of the built site. Run `pnpm build` first; `pnpm smoke`
// serves `dist/` with `astro preview` on its own port and tests it.
const port = 4329;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm preview --port ${port}`,
    url: `http://localhost:${port}/api.json`,
    reuseExistingServer: false,
  },
});

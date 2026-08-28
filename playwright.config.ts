import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // One worker: the specs share a single dev server and one Supabase database
  // (each seeds and tears down its own users/orgs), so they must run serially.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // A production build, not `pnpm dev`: the dev server's per-route JIT
    // compilation makes navigations unpredictably slow and the suite flaky.
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});

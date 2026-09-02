import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // One worker: the specs share a single dev server and one Supabase database
  // (each seeds and tears down its own users/orgs), so they must run serially.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // The suite runs against a shared remote Supabase (Postgres + GoTrue); one
  // retry absorbs the occasional upstream latency spike or rate-limit blip.
  retries: process.env.CI ? 2 : 1,
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
    env: {
      ...(process.env as Record<string, string>),
      // Enable the fixture-backed ad provider so the ads-* specs never hit a
      // real Meta/Google API. Fake OAuth creds so `integrationsConfig()` is
      // non-null; never used to call anything.
      ADS_PROVIDER_STUB: '1',
      TOKEN_ENCRYPTION_KEY: Buffer.from('e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-').toString('base64'),
      CRON_SECRET: 'e2e-cron-secret',
      OAUTH_REDIRECT_BASE_URL: 'http://localhost:3000',
      META_APP_ID: 'e2e-meta-app',
      META_APP_SECRET: 'e2e-meta-secret',
      GOOGLE_ADS_CLIENT_ID: 'e2e-google-id',
      GOOGLE_ADS_CLIENT_SECRET: 'e2e-google-secret',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'e2e-google-devtoken',
    },
  },
});

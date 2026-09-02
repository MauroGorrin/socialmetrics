---
name: add-ad-provider
description: Use when adding a third ad platform (TikTok Ads, LinkedIn Ads, Microsoft Ads) to the
  metric sync. Covers the provider module, the OAuth wiring, the env config, and the schema check
  constraint. Do NOT use for organic (Instagram/TikTok) insights — that is a different scope model.
---

# Add an ad provider

## When to use
A client runs spend on a platform the sync does not cover yet, and you are adding it.

## Steps
1. Add the slug to the `platform` check constraint in `src/server/db/schema.ts`
   (`platform_connection_platform_check`) and to `metric_source_check`; `pnpm db:generate`.
2. Add the platform to `integrationsConfig()` in `src/lib/integrations.ts` and its env vars
   (all `.optional()`) to `src/lib/env.ts` and `.env.example`.
3. Create `src/server/providers/<slug>.ts` implementing `AdInsightsProvider` from
   `src/server/providers/types.ts` — normalize the API's response to `DailyInsightRow` (the 5
   `BASE_METRICS`). Raw `fetch` unless the API genuinely needs a client library (justify the dep).
4. Add the case to `getProvider` in `src/server/providers/index.ts` (and to the test-stub branch).
5. Add `tests/fixtures/<slug>-*.json` (recorded responses) and `tests/unit/provider-<slug>.test.ts`.
6. Extend the account-picker page and `<PlatformConnectionCard>` — they switch on `platform`.
7. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Verify
```bash
pnpm test tests/unit/provider-<slug>.test.ts   # expect: exit 0, 0 failed
pnpm build                                      # expect: exit 0
```

## Do not
- Do not hit the real API from a test. Fixture + injected fetch only.
- Do not add the provider to the client bundle — it is `src/server/**` and goes in
  `serverComponentsExternalPackages` if it is a library.
- Do not store a token unencrypted or return one from any query.

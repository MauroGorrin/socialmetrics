---
paths:
  - "src/server/providers/**"
  - "src/server/sync/**"
  - "src/app/api/integrations/**"
  - "src/app/api/cron/**"
  - "src/lib/crypto.ts"
  - "src/lib/integrations.ts"
---

# Ad-platform integration conventions

- Tokens are AES-256-GCM ciphertext everywhere except inside `src/server/sync/ads-sync.ts` and
  `src/server/providers/**`. No query, action, or route may return or log a decrypted token,
  an OAuth `code`, or a client secret.
- Every integration env var is `.optional()` in `src/lib/env.ts`. Gate at runtime with
  `integrationsConfig()`, never with a boot-time required var. `pnpm build` must pass with none set.
- Provider modules normalize to `DailyInsightRow` — only the 5 `BASE_METRICS`. Ratios (ctr/cpl/roas)
  are never fetched or stored; they are derived downstream.
- Outbound hosts are hard-coded constants. Never build a request URL host from user or DB input.
- `metric` deletes are always scoped by `source`: `'manual'` for the grid/Excel writers,
  the platform slug for `upsertSyncedMetrics`. Widening a delete's scope is a data-loss bug.
- The cron route (`src/app/api/cron/**`) authenticates by `Bearer CRON_SECRET` only, with a
  constant-time compare. It is the one place a system-wide (non-org-scoped) query is allowed
  (`listConnected()`).
- OAuth flows: sign the `state` param, compare it to an httpOnly cookie on callback, verify before
  exchanging the `code`. Re-run the org+role guard from the state payload's `clientId` on callback —
  never trust the payload for authorization.
- The Meta Graph API version is the single const `V` in `src/server/providers/meta.ts`. Bump it
  there and nowhere else.

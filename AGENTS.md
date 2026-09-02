# Reportes App — agent instructions

SaaS platform for agencies to generate branded monthly client reports from social media and ads metrics.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test | `pnpm test` · `pnpm test:e2e` |
| Migrate | `pnpm db:migrate` |

## Non-negotiable

1. Never commit secrets or `.env` files.
2. Multi-tenant check on every query — filter by `org_id`.
3. Validate input with zod at every boundary.
4. Server-side authorization always.
5. Test tenancy isolation (org A cannot see org B data).
6. Migrations are committed to `drizzle/`.
7. PDFs render without network calls or flashing.

Full architecture, boundaries, and design tokens: see `CLAUDE.md` in this directory.

## Ad-platform sync

Meta Ads + Google Ads metrics sync into the `metric` table tagged by `source`. See the
"Ad-platform sync" section of CLAUDE.md. Rules: tokens are encrypted and never logged/returned;
all integration env vars are optional (feature gated by `integrationsConfig()`); deletes are
always scoped by `metric.source`. Design doc: `blueprints/ads-api-sync/blueprint.md`.

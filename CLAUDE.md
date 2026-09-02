# Reportes App

SaaS platform for agencies to generate branded monthly client reports from social media and ads metrics.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` — http://localhost:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format --write` |
| Unit tests | `pnpm test` · single file: `pnpm test {path/to/file}` |
| E2E tests | `pnpm test:e2e` |
| DB migrate | `pnpm db:migrate` |
| DB seed | `pnpm db:seed` |
| DB inspect | `pnpm db:studio` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` must pass before any task is marked done.

Node 24 is pinned in `.nvmrc`. Dependency versions live in `pnpm-lock.yaml` — never guess one.

## Stack

Next.js 14 · TypeScript · Tailwind CSS · Drizzle ORM · Supabase Auth + Postgres · Recharts · Puppeteer (PDF) · Resend (email) · Vercel.

## Architecture

**Request path:** Browser → `src/app/[orgSlug]/dashboard/page.tsx` (server) → `src/server/queries/clients.ts` (filter by org_id) → `src/server/db/index.ts` (Drizzle) → Postgres.

Mutations go through `src/app/[orgSlug]/{feature}/actions.ts` (server actions), never client-side fetch.

**Boundaries:** Every query/mutation is org-scoped — nothing without `org_id` check.

| Layer | May import from | Must never |
|---|---|---|
| `src/app/**` (routes) | `components`, `server`, `lib` | `db/` directly |
| `src/components/**` | `lib`, other components | `server/` or `db/` |
| `src/server/**` | `db/`, `lib/` | React or `components/` |
| `src/db/**` | nothing internal | `server/` or `app/` |

**Where things live:**

| Concern | Single source of truth |
|---|---|
| DB schema | `src/server/db/schema.ts` — change here, `pnpm db:migrate` |
| Env access | `src/lib/env.ts` — validated at boot |
| Shared types | Inferred from schema; hand-written in `src/lib/types.ts` |
| Auth session | `src/server/auth/session.ts` — `getSession()`, used everywhere |
| Multi-tenant check | `src/server/auth/guards.ts` — `tenantGuard()` in every action |

## Code rules

1. **One component per file. Max 300 lines.** Longer → split by responsibility.
2. **Path alias `@/` → `src/`.** No `../..` imports.
3. **Server-first.** Components are server by default. Add `"use client"` only for state/events; push to the leaf.
4. **No barrel files.** Import from the source module; `index.ts` re-exports break tree-shaking.
5. **Validate at the edge.** Every route handler + server action parses input with a zod schema before touching business logic.
6. **Errors return typed results,** not thrown strings. Shape: `{ ok: true, data } | { ok: false, error }`.
7. **Colocate.** A component used by exactly one route lives beside that route.
8. **No new dependency without a reason.** Check stdlib or existing deps first.

## Design system

Warm BrightBean palette. Tokens in `src/styles/globals.css`; components reference token **names** only. `src/lib/design-tokens.ts` mirrors the semantic values for logic/tests — kept in sync by `tests/unit/design-tokens.test.ts`. Semantic token names are frozen (~180 files use them); only values changed.

| Role | Token | Light | Dark |
|---|---|---|---|
| Primary | `--primary` | `#F97316` | `#FB923C` |
| Primary fg | `--primary-fg` | `#FFFFFF` | `#171412` |
| Background | `--background` | `#FAFAF9` | `#171412` |
| Surface | `--surface` | `#FFFFFF` | `#1C1917` |
| Border | `--border` | `#E7E5E4` | `#44403C` |
| Text | `--fg` | `#1C1917` | `#FAFAF9` |
| Muted | `--fg-muted` | `#57534E` | `#D6D3D1` |
| Destructive | `--destructive` | `#EF4444` | `#F87171` |
| Success | `--success` | `#22C55E` | `#4ADE80` |
| Warning | `--warning` | `#EAB308` | `#FACC15` |

Added alongside: stone ramp `--neutral-50`…`--neutral-950`; surfaces `--surface-0/1/2` + `--border-hover`; text `--text-primary/secondary/tertiary/ghost/inverse`; brand `--brand-50/100/200/500/600/700`; status `--success/warning/error/info` `-50/-500/-700`; warm shadows `--shadow-xs`…`--shadow-xl`; radii `--radius-sm`…`--radius-2xl` + `--radius-full`; `--ease-out` + `--dur-fast/base/slow`.

- **Type:** headings/body Inter 400–700 · body 16px/1.5 · **numbers in `--font-mono`** (system stack: `ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, Menlo, monospace` — no web font)
- **Spacing:** 4px base (4, 8, 12, 16, 24, 32, 48, 64, 96)
- **Radius:** `--radius-md` controls, `--radius-xl` cards, `--radius-full` avatars/badges
- **Elevation:** cards `--shadow-sm`; dropdowns/popovers `--shadow-lg`
- **Motion:** 150ms enter, 300ms exit, `--ease-out`; opacity + transform only; honors `prefers-reduced-motion`
- **Dark mode kept.** Every semantic token on `:root` is redefined under `:root[data-theme="dark"]` **and** `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`.
- **`--primary` (`#F97316`) is fill / border / stroke / focus-ring / large numerals only** — never body text on a light surface (2.8:1). Active chips use the soft style (`--brand-50` bg / `--brand-700` text / `--primary` border).

## Environment

| Variable | Required | Used by | Source |
|---|---|---|---|
| `SUPABASE_URL` | yes | Auth + DB | Supabase dashboard |
| `SUPABASE_ANON_KEY` | yes | Client-side Auth | Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server DB access | Supabase dashboard (secrets) |
| `DATABASE_URL` | yes | Drizzle migrations | Supabase connection pooler |
| `SESSION_JWT_SECRET` | yes | JWT signing | `openssl rand -base64 32` |
| `SESSION_URL` | no | Callback URL | `http://localhost:3000` or prod domain |
| `RESEND_API_KEY` | yes | Email sending | Resend dashboard (secrets) |
| `RESEND_FROM_EMAIL` | yes | Email from address | Your domain's email |

`.env.example` is committed and stays in sync. `.env*` files with real values are gitignored.

## Rules

Deferred conventions — read before editing that area:

| File | Applies to |
|---|---|
| `.claude/rules/database.md` | `src/server/db/**`, `drizzle/` |
| `.claude/rules/api.md` | `src/app/[orgSlug]/**/actions.ts`, route handlers |
| `.claude/rules/components.md` | `src/components/**` |
| `.claude/rules/integrations.md` | `src/server/providers/**`, `src/server/sync/**`, `src/app/api/integrations/**`, `src/app/api/cron/**`, `src/lib/crypto.ts`, `src/lib/integrations.ts` |

## Non-negotiable

1. **Never commit secrets, `.env` files, or generated build output.** Use `.env.example` as the reference.
2. **Multi-tenant check on every query.** Every row-read must filter by `org_id` from the session.
3. **Validate input at the boundary.** Zod schemas on every route handler + server action before touching mutations.
4. **Server-side authorization always.** Check role before the work, not after. Client-side button-hiding is cosmetic.
5. **Test tenancy isolation.** E2E tests must verify org A cannot see org B data across list, detail, update, delete.
6. **Database migrations are committed.** Never `.gitignore` the `drizzle/` folder. Migrations are version control.
7. **PDFs must render without flashing.** Puppeteer + React template; no external CSS loading or network calls in the PDF template.

## Ad-platform sync (blueprint: `blueprints/ads-api-sync/`)

Clients with an `ads` or `mixed` profile can connect one Meta Ads and/or one Google Ads
account (`platform_connection` table, one row per client+platform). Connecting backfills 12
months of daily insights into `metric` with `source` = `meta` | `google_ads`; a daily Vercel
Cron (`/api/cron/sync-ads`, bearer `CRON_SECRET`) re-syncs the current + previous month. For a
connected client the metrics grid's ad fields are read-only — the sync owns them and overwrites
the month wholesale ("API pisa todo"). Manual entry (`source='manual'`) still owns organic
metrics and every non-connected client.

- Tokens are AES-256-GCM encrypted (`src/lib/crypto.ts`), decrypted only in
  `src/server/sync/ads-sync.ts` and `src/server/providers/**`. Never return or log a token.
- The feature is dark unless `integrationsConfig()` (`src/lib/integrations.ts`) finds its env
  vars. All ad-integration env vars are OPTIONAL in `src/lib/env.ts` — the app boots without them.
- Provider modules (`src/server/providers/{meta,google-ads}.ts`) normalize each API to
  `DailyInsightRow` (the 5 `BASE_METRICS`). `getProvider(platform)` is the factory.
- `metric.source` scopes deletes: `upsertMonthlyMetrics` only clears `source='manual'`;
  `upsertSyncedMetrics` only clears `source=<platform>`. Never widen either.

Extra commands: `pnpm db:generate --custom --name <slug>` (empty migration), `pnpm add google-ads-api`.

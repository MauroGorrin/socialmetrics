---
description: Database schema and migration conventions
paths:
  - "src/server/db/**"
  - "drizzle/**"
---

# Database conventions

- Every table has `id` (uuid), `created_at`, `updated_at` timestamps.
- Multi-tenant tables have `org_id` as the first column after `id`; index on it.
- Never edit a migration that has run. Add a new one.
- Soft-delete with `deleted_at` on user-facing entities (clients, reports); queries filter it.
- Foreign keys use `on delete cascade` for detail rows; `on delete restrict` for org owner.
- Queries in `src/server/queries/` take `org_id` as the first parameter; always filter by it.
- Mutations in `src/server/mutations/` check `role` before writing.

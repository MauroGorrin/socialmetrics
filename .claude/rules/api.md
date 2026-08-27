---
description: Server action and route handler contracts
paths:
  - "src/app/**/actions.ts"
  - "src/app/api/**"
---

# API conventions

- Server actions are in `src/app/[orgSlug]/{feature}/actions.ts`.
- Every action validates input with a zod schema before touching business logic.
- Return shape: `{ ok: true, data: T } | { ok: false, error: string }`.
- All org-scoped actions take `orgSlug` from params and verify membership before querying.
- All actions log to `audit_log` with action name + actor_id.
- Errors never include stack traces in the response.

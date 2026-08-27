---
description: Component conventions and constraints
paths:
  - "src/components/**"
---

# Component conventions

- One component per file. Max 300 lines of code.
- Server components by default; add `"use client"` only for state, effects, or event handlers.
- `"use client"` appears on the leaf component that needs it, never on a layout or page.
- Use path alias `@/` for imports; no `../..` relative paths.
- No barrel files. Import from the source module directly.
- Dark mode: use CSS variables from `src/styles/globals.css`. No hardcoded colors.
- Props over context for small components. Use context only for app-wide state (theme, user session).
- Component names match file names: `src/components/ui/Button.tsx` exports `function Button(...)`.

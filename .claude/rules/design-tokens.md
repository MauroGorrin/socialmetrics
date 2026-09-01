---
description: Convenciones de tokens de diseño y modo oscuro (paleta cálida BrightBean)
paths:
  - "src/styles/**"
  - "src/lib/design-tokens.ts"
---

# Tokens de diseño — convenciones

- **Conservá los nombres de los tokens semánticos** (`--background`, `--surface`, `--border`, `--fg`, `--fg-muted`, `--primary`, `--primary-fg`, `--destructive`, `--success`, `--warning`, `--chart-*`, `--client-*`). Los usan ~180 archivos. Cambiás los **valores**, y agregás tokens BrightBean nuevos (`--neutral-*`, `--surface-0/1/2`, `--text-*`, `--shadow-*`, `--radius-*`, `--brand-*`, estados `-50/-500/-700`) **al lado**.
- **Cada token semántico definido en `:root` se redefine bajo `:root[data-theme="dark"]` Y bajo `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`.** `tests/unit/design-tokens.test.ts` assert (c) falla si falta la redefinición dark de alguno.
- **`globals.css` y `src/lib/design-tokens.ts` se mantienen en sincronía.** `colors.light`/`colors.dark` (keys: primary, primaryFg, background, surface, border, fg, fgMuted, destructive, success, warning) deben igualar el hex que `globals.css` declara para el `--var` mapeado. El test normaliza a mayúsculas antes de comparar; usá mayúsculas en ambos lados por consistencia.
- **`Object.keys(colors.light)` === `Object.keys(colors.dark)`** — mismo set de keys en ambos.
- **Sin hex hardcodeado en componentes.** Solo `var(--token)` o utilidades de Tailwind mapeadas en `@theme inline`.
- **`--primary` `#F97316` es relleno / borde / trazo / focus ring / numeral grande (≥1.5rem).** Nunca texto de cuerpo sobre fondo claro (contraste 2.8:1). El chip activo usa el estilo suave: `--brand-50` fondo + `--brand-700` texto + borde `--primary`.
- **`--font-mono` es el stack del sistema** (`ui-monospace, SFMono-Regular, 'Cascadia Code', Consolas, monospace`) — sin web font, sin dependencia. Los valores de métrica se renderizan en mono.
- **No toques `shellFootprint` ni `layout`** salvo que cambies el ancho de la sidebar — y si lo hacés, actualizá `layout.sidebarWidth` en el mismo commit y confirmá que `tests/unit/viewport.test.ts` sigue en verde (footprint ≤ viewport, sidebar acoplado >768px, capado en `maxContentWidth`).
- **Conservá el bloque global de `prefers-reduced-motion`** en `globals.css`.

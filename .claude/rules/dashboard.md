---
description: Convenciones del dashboard reestilizado y sus primitivos
paths:
  - "src/app/[orgSlug]/dashboard/**"
  - "src/app/[orgSlug]/clients/[id]/**"
  - "src/components/app/**"
  - "src/lib/dashboard-view.ts"
---

# Dashboard — convenciones

- **Las stat cards reciben strings ya formateados.** La página llama `formatMetric(key, value)` y pasa el string a `<StatCard value={...}>`. `<StatCard>`, `<GroupedStatCard>` y sus sub-tiles nunca formatean números.
- **La lógica de selección vive en `src/lib/dashboard-view.ts`**, no en `page.tsx`: `pickStatCards(profile)`, `pickGroupedCard(profile)`, `pickChartChips(profile)`, `resolveChartMetric(param, profile)`, `rangeToMonths(period, refMonth)`. La página compone; la lógica se testea en aislamiento (`tests/unit/dashboard-view.test.ts`).
- **Los params de URL son el único estado del dashboard:** `month`, `period`, `client`, `profile`, `chart_metric`. No se agrega estado global cliente. Cada control cliente parte de `new URLSearchParams(searchParams)` y solo setea su propio param — nunca reconstruye la query desde cero.
- **`chart_metric` siempre pasa por `resolveChartMetric(searchParams.chart_metric, profile)`** antes de usarse. Un valor no incluido en `pickChartChips(profile)` cae al primer chip del perfil, sin error.
- **`period` mantiene el contrato `1 | 3 | 6 | 12`.** Un `?period=12` bookmarkeado resuelve la ventana de 12 meses vía `rangeToMonths`.
- **Las sparklines son `aria-hidden="true"`.** El valor va en el texto adyacente de la stat card.
- **`<MetricToggleChart>`, `<RangeToggle>`, `<ClientSwitcher>` son `"use client"`** — son las hojas de estado/navegación. `page.tsx` es server component.
- **Recharts en el hero chart se tematiza con CSS vars** (gradiente `var(--primary)`), como `trend-chart.tsx` — nunca hex literal en el JSX del chart, para que siga el swap de modo oscuro.
- **Borrado de componentes viejos solo si huérfanos:** grep primero; `pnpm typecheck` es el juez de que nada quedó colgado.
- Las firmas de `src/server/queries/reports.ts` (`clientMonthlySeries`, `clientOrganicMonthlySeries`, `listReports`) están **congeladas** — no las cambies.

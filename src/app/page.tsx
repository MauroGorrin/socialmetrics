import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Marketing landing. The rest of the product lives behind auth; this is the
 * front door — it explains the value in one screen and routes visitors into
 * sign-up or sign-in. Fully static (server component, no client JS) and themed
 * off the CSS custom properties in `globals.css`.
 */

export const metadata = {
  title: 'Reportes App — Reportes mensuales de marketing para tus clientes',
  description:
    'Genera reportes mensuales con tu marca a partir de las métricas de redes sociales y ads. Para agencias y consultores.',
};

const GHOST_LINK =
  'rounded px-4 py-2 text-sm font-medium text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';
const PRIMARY_LINK =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const FEATURES: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <IconChart />,
    title: 'Métricas en un solo lugar',
    body: 'Carga impresiones, clics, inversión, ROAS, CTR y CPL por cliente y por mes. KPIs calculados automáticamente.',
  },
  {
    icon: <IconDocument />,
    title: 'Reportes PDF con tu marca',
    body: 'Un clic genera un PDF prolijo con tu logo y tu pie de página. Listo para enviar al cliente.',
  },
  {
    icon: <IconLink />,
    title: 'Link público para compartir',
    body: 'Comparte el reporte con un enlace temporal. El cliente lo abre sin crear cuenta ni instalar nada.',
  },
  {
    icon: <IconUsers />,
    title: 'Multi-cliente y equipo',
    body: 'Invita a tu equipo con roles. Cada organización ve solo sus clientes y sus datos.',
  },
];

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: '1',
    title: 'Crea tu cuenta',
    body: 'Sin tarjeta. Entras directo y armas tu primera organización en el asistente.',
  },
  {
    n: '2',
    title: 'Carga clientes y métricas',
    body: 'Agrega cada cliente y sus números del mes. O usa los datos de ejemplo para probar.',
  },
  {
    n: '3',
    title: 'Genera y envía el reporte',
    body: 'Un PDF con tu marca, o un link para compartir. En segundos, todos los meses.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <span className="text-base font-bold tracking-tight text-[var(--fg)]">
            Reportes<span className="text-[var(--fg-muted)]"> App</span>
          </span>
          <nav className="flex items-center gap-1">
            <Link href="/auth/signin" className={GHOST_LINK}>
              Iniciar sesión
            </Link>
            <Link href="/auth/signup" className={PRIMARY_LINK}>
              Crear cuenta
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-5xl px-4 py-20 md:py-28">
          <p className="text-sm font-medium text-[var(--fg-muted)]">
            Para agencias y consultores de marketing
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-[var(--fg)] md:text-5xl">
            Reportes mensuales con tu marca, sin pelearte con planillas
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--fg-muted)]">
            Centraliza las métricas de redes y ads de cada cliente y genera un reporte PDF
            profesional —o un link para compartir— en segundos.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/auth/signup" className={`${PRIMARY_LINK} px-5 py-2.5 text-base`}>
              Empezar gratis
            </Link>
            <Link
              href="/auth/signin"
              className={`${GHOST_LINK} px-5 py-2.5 text-base underline underline-offset-4`}
            >
              Ya tengo cuenta
            </Link>
          </div>
          <p className="mt-3 text-sm text-[var(--fg-muted)]">
            Sin tarjeta de crédito. Entras y pruebas con datos de ejemplo.
          </p>
        </section>

        {/* Features */}
        <section className="border-t border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 md:py-20">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
              Todo lo que necesitas para el reporte del mes
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-6"
                >
                  <div className="text-[var(--fg)]">{feature.icon}</div>
                  <h3 className="mt-4 text-base font-semibold text-[var(--fg)]">{feature.title}</h3>
                  <p className="mt-2 text-sm text-[var(--fg-muted)]">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16 md:py-20">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Cómo funciona</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-sm font-bold text-[var(--fg)]">
                  {step.n}
                </span>
                <h3 className="mt-4 text-base font-semibold text-[var(--fg)]">{step.title}</h3>
                <p className="mt-2 text-sm text-[var(--fg-muted)]">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section className="border-t border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-4 py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
                Arma tu primer reporte hoy
              </h2>
              <p className="mt-2 text-sm text-[var(--fg-muted)]">
                Toma menos de cinco minutos con el asistente.
              </p>
            </div>
            <Link href="/auth/signup" className={`${PRIMARY_LINK} px-5 py-2.5 text-base`}>
              Crear cuenta
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-[var(--fg-muted)] sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Reportes App</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-[var(--fg)]">
              Privacidad
            </Link>
            <Link href="/auth/signin" className="hover:text-[var(--fg)]">
              Iniciar sesión
            </Link>
            <Link href="/auth/signup" className="hover:text-[var(--fg)]">
              Crear cuenta
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

// ── icons (inline, no dependency; inherit currentColor) ───────────────────────

function IconChart() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="13" y="7" width="3" height="10" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

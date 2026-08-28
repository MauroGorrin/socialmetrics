import Link from 'next/link';
import type { ReactNode } from 'react';

const STEP_LABELS = ['Agencia', 'Cliente', 'Métricas', 'Reporte', 'Listo'];

export const WIZARD_FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';
export const WIZARD_PRIMARY =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

/** Shared frame for every onboarding step: progress bar, title, back link. */
export function WizardShell({
  step,
  title,
  subtitle,
  backHref,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-md space-y-6 py-6">
      <div className="flex gap-1">
        {STEP_LABELS.map((label, index) => (
          <span
            key={label}
            className={`h-1 flex-1 rounded ${
              index < step ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
            }`}
          />
        ))}
      </div>

      <div>
        <p className="text-sm text-[var(--fg-muted)]">Paso {step} de 5</p>
        <h1 className="text-2xl font-bold text-[var(--fg)]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--fg-muted)]">{subtitle}</p> : null}
      </div>

      {children}

      {backHref ? (
        <Link href={backHref} className="inline-block text-sm text-[var(--fg-muted)] underline">
          ← Atrás
        </Link>
      ) : null}
    </section>
  );
}

import { seedMetricsAction } from '@/app/(app)/onboarding/actions';
import { WIZARD_PRIMARY, WizardShell } from '@/app/(app)/onboarding/wizard-shell';
import { requireStep } from '@/lib/onboarding';

export default function OnboardingStep3() {
  const state = requireStep(3);

  return (
    <WizardShell
      step={3}
      title="Carga métricas de ejemplo"
      subtitle={`Vamos a crear 30 métricas para ${state.clientName ?? 'tu cliente'} para que veas cómo se arma un reporte.`}
      backHref="/onboarding/step-2"
    >
      <form action={seedMetricsAction} className="flex flex-col gap-4">
        {state.metricsSeeded ? (
          <p className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)]">
            Métricas cargadas ✓
          </p>
        ) : null}
        <button type="submit" className={`${WIZARD_PRIMARY} self-start`}>
          {state.metricsSeeded ? 'Continuar' : 'Cargar 30 métricas'}
        </button>
      </form>
    </WizardShell>
  );
}

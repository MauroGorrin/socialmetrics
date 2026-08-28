import { generateOnboardingReportAction } from '@/app/(app)/onboarding/actions';
import { WIZARD_PRIMARY, WizardShell } from '@/app/(app)/onboarding/wizard-shell';
import { requireStep } from '@/lib/onboarding';

// Report generation launches headless Chromium — well past the 15s default for
// a serverless function. Give the action room to finish.
export const maxDuration = 60;

export default function OnboardingStep4({ searchParams }: { searchParams: { error?: string } }) {
  requireStep(4);

  return (
    <WizardShell
      step={4}
      title="Genera tu primer reporte"
      subtitle="Con las métricas cargadas ya puedes generar el PDF del mes."
      backHref="/onboarding/step-3"
    >
      <form action={generateOnboardingReportAction} className="flex flex-col gap-4">
        {searchParams.error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            No pudimos generar el reporte. Vuelve a intentar.
          </p>
        ) : null}
        <button type="submit" className={`${WIZARD_PRIMARY} self-start`}>
          Generar reporte
        </button>
      </form>
    </WizardShell>
  );
}

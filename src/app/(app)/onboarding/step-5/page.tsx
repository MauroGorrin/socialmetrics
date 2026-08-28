import { finishOnboardingAction } from '@/app/(app)/onboarding/actions';
import { WIZARD_PRIMARY, WizardShell } from '@/app/(app)/onboarding/wizard-shell';
import { requireStep } from '@/lib/onboarding';

export default function OnboardingStep5() {
  requireStep(5);

  return (
    <WizardShell
      step={5}
      title="¡Listo!"
      subtitle="Tu primer reporte está generado. Ábrelo para verlo y compartirlo."
      backHref="/onboarding/step-4"
    >
      <form action={finishOnboardingAction}>
        <button type="submit" className={`${WIZARD_PRIMARY} self-start`}>
          Ver reporte
        </button>
      </form>
    </WizardShell>
  );
}

import { submitOrgNameAction } from '@/app/(app)/onboarding/actions';
import { WIZARD_FIELD, WIZARD_PRIMARY, WizardShell } from '@/app/(app)/onboarding/wizard-shell';
import { requireStep } from '@/lib/onboarding';

export default function OnboardingStep1({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const state = requireStep(1);

  return (
    <WizardShell step={1} title="¿Cómo se llama tu agencia?" subtitle="Podrás cambiarlo más tarde.">
      <form action={submitOrgNameAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Nombre de la agencia
          <input
            name="orgName"
            type="text"
            required
            maxLength={80}
            defaultValue={state.orgName ?? ''}
            className={WIZARD_FIELD}
          />
        </label>
        {searchParams.error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            Ingresa un nombre.
          </p>
        ) : null}
        <button type="submit" className={`${WIZARD_PRIMARY} self-start`}>
          Siguiente
        </button>
      </form>
    </WizardShell>
  );
}

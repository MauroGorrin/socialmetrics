import { submitClientAction } from '@/app/(app)/onboarding/actions';
import { WIZARD_FIELD, WIZARD_PRIMARY, WizardShell } from '@/app/(app)/onboarding/wizard-shell';
import { PROFILE_LABELS, REPORT_PROFILES } from '@/lib/client-profile';
import { requireStep } from '@/lib/onboarding';

export default function OnboardingStep2({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const state = requireStep(2);

  return (
    <WizardShell step={2} title="Agrega tu primer cliente" backHref="/onboarding/step-1">
      <form action={submitClientAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Nombre del cliente
          <input
            name="clientName"
            type="text"
            required
            maxLength={120}
            defaultValue={state.clientName ?? ''}
            className={WIZARD_FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Tipo de gestión
          <select
            name="clientProfile"
            defaultValue={state.clientProfile ?? 'ads'}
            className={WIZARD_FIELD}
          >
            {REPORT_PROFILES.map((value) => (
              <option key={value} value={value}>
                {PROFILE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {searchParams.error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            Completa el nombre del cliente.
          </p>
        ) : null}
        <button type="submit" className={`${WIZARD_PRIMARY} self-start`}>
          Siguiente
        </button>
      </form>
    </WizardShell>
  );
}

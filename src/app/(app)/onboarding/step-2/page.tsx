import { submitClientAction } from '@/app/(app)/onboarding/actions';
import { WIZARD_FIELD, WIZARD_PRIMARY, WizardShell } from '@/app/(app)/onboarding/wizard-shell';
import { requireStep } from '@/lib/onboarding';

const PLATFORMS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
];

export default function OnboardingStep2({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const state = requireStep(2);

  return (
    <WizardShell step={2} title="Agregá tu primer cliente" backHref="/onboarding/step-1">
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
          Plataforma
          <select
            name="clientPlatform"
            defaultValue={state.clientPlatform ?? 'meta'}
            className={WIZARD_FIELD}
          >
            {PLATFORMS.map((platform) => (
              <option key={platform.value} value={platform.value}>
                {platform.label}
              </option>
            ))}
          </select>
        </label>
        {searchParams.error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            Completá el nombre y la plataforma.
          </p>
        ) : null}
        <button type="submit" className={`${WIZARD_PRIMARY} self-start`}>
          Siguiente
        </button>
      </form>
    </WizardShell>
  );
}

import { redirect } from 'next/navigation';
import { readOnboarding } from '@/lib/onboarding';

/** Wizard router — sends the user to their furthest unlocked step. */
export default function OnboardingPage() {
  redirect(`/onboarding/step-${readOnboarding().step}`);
}

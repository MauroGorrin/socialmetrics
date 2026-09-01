import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReportProfile } from '@/lib/metrics';

/**
 * Onboarding wizard state — a signed-scope httpOnly cookie, not a table.
 * `step` is the highest step the user has unlocked; step pages call
 * {@link requireStep} to block forward skips (back is always allowed).
 */

const COOKIE = 'reportes-onboarding';
const MAX_STEP = 5;

export type OnboardingState = {
  step: number;
  orgSlug?: string;
  orgName?: string;
  clientId?: string;
  clientName?: string;
  clientProfile?: ReportProfile;
  periodMonth?: string;
  metricsSeeded?: boolean;
  reportId?: string;
};

export function readOnboarding(): OnboardingState {
  try {
    const raw = cookies().get(COOKIE)?.value;
    if (!raw) return { step: 1 };
    const parsed = JSON.parse(raw) as OnboardingState;
    const step = Math.min(Math.max(1, Number(parsed.step) || 1), MAX_STEP);
    return { ...parsed, step };
  } catch {
    return { step: 1 };
  }
}

export function writeOnboarding(next: OnboardingState): void {
  cookies().set(COOKIE, JSON.stringify(next), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60,
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearOnboarding(): void {
  cookies().delete(COOKIE);
}

/** Merge a patch into the current state and persist it. */
export function advanceOnboarding(patch: Partial<OnboardingState>): OnboardingState {
  const current = readOnboarding();
  const merged = { ...current, ...patch };
  writeOnboarding(merged);
  return merged;
}

/** In a step page: bounce back to the furthest unlocked step if `n` is ahead of it. */
export function requireStep(n: number): OnboardingState {
  const state = readOnboarding();
  if (state.step < n) {
    redirect(`/onboarding/step-${state.step}`);
  }
  return state;
}

type SeedRow = {
  orgId: string;
  clientId: string;
  createdBy: string;
  metricName: string;
  metricValue: string;
  period: string;
};

/**
 * Seed metric rows for the demo client, matching its report profile. Ads clients
 * get 30 rows (6 names × 5 dates) of base figures + CTR; organic clients get one
 * row per organic metric at the first of the month. Either way the report shows
 * real derived KPIs, not placeholders.
 */
export function seedMetricRows(input: {
  orgId: string;
  clientId: string;
  createdBy: string;
  periodMonth: string;
  profile?: ReportProfile;
}): SeedRow[] {
  const common = {
    orgId: input.orgId,
    clientId: input.clientId,
    createdBy: input.createdBy,
  };

  if (input.profile === 'organic' || input.profile === 'mixed') {
    const organic: Array<[string, number]> = [
      ['followers_start', 4200],
      ['followers_end', 4680],
      ['reach', 38_500],
      ['impressions', 61_200],
      ['profile_visits', 2100],
      ['link_clicks', 540],
      ['interactions', 3120],
      ['posts_published', 14],
      ['stories_published', 46],
      ['video_views', 22_800],
    ];
    const rows: SeedRow[] = organic.map(([metricName, value]) => ({
      ...common,
      metricName,
      metricValue: value.toFixed(2),
      period: `${input.periodMonth}-01`,
    }));
    if (input.profile === 'mixed') {
      rows.push(...seedMetricRows({ ...input, profile: 'ads' }));
    }
    return rows;
  }

  const names = ['impressions', 'clicks', 'spend', 'conversions', 'conversion_value', 'ctr'];
  const days = [3, 9, 15, 21, 27];
  const rows: SeedRow[] = [];
  for (const [ni, name] of names.entries()) {
    for (const [di, day] of days.entries()) {
      const base = [4200, 180, 95, 9, 380, 4.1][ni] ?? 100;
      rows.push({
        ...common,
        metricName: name,
        metricValue: (base * (1 + di * 0.12)).toFixed(2),
        period: `${input.periodMonth}-${String(day).padStart(2, '0')}`,
      });
    }
  }
  return rows;
}
